"""Private CPU speaker adaptation; keeps the base model and existing narration intact.

Only the acoustic model's speaker projection is trained. This is not full-model
training and does not alter the text language model or claim a quality guarantee.
"""
import os
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
import argparse, hashlib, json, math, random, sys, time, traceback
from pathlib import Path
try:
    from .runtime_location import cosyvoice_runtime
except ImportError:
    from runtime_location import cosyvoice_runtime
import numpy as np
import soundfile as sf
import torch
import torch.nn.functional as F
import gc
import onnxruntime as ort
from types import SimpleNamespace

ROOT=Path(__file__).resolve().parents[1]
RUNTIME=cosyvoice_runtime()
sys.path.insert(0,str(RUNTIME/'CosyVoice-main'))
from cosyvoice.cli.cosyvoice import CosyVoice3
from cosyvoice.cli.frontend import CosyVoiceFrontEnd
from cosyvoice.cli.model import CosyVoice3Model
from hyperpyyaml import load_hyperpyyaml

STORE=ROOT/'.sites-runtime/voice-reference'
WORK=STORE/'training/mentor-acoustic-v1'
WORK.mkdir(parents=True,exist_ok=True)
STATUS=ROOT/'dist/narration/mentor-training.json'
state={'status':'preparing','stage':'核对导师素材','step':0,'total':0,'progress':0}

def report(**values):
    state.update(values,updated=time.time())
    payload=json.dumps(state,ensure_ascii=False)
    temp=STATUS.with_suffix('.training.tmp')
    for _ in range(10):
        try:temp.write_text(payload,encoding='utf-8');temp.replace(STATUS);break
        except PermissionError:time.sleep(.1)
    print(payload,flush=True)

def prepare():
    rows=[];sources=[];seen=set()
    for meta in sorted(STORE.glob('*.json')):
        m=json.loads(meta.read_text(encoding='utf-8'))
        if m.get('role')!='mentor' or not m.get('consent',{}).get('confirmed'):continue
        wav=STORE/'processed'/m['id']/'reference-clean.wav'
        if not wav.exists():raise RuntimeError('导师素材尚未提取完整音轨：'+m['id'])
        fingerprint=hashlib.sha256(wav.read_bytes()).hexdigest()
        if fingerprint in seen:continue
        seen.add(fingerprint)
        audio,sr=sf.read(wav,dtype='float32');assert sr==24000
        if audio.ndim>1:audio=audio.mean(axis=1)
        sources.append({'id':m['id'],'seconds':len(audio)/sr,'hash':fingerprint})
        # Acoustic learning needs aligned sound features, not unreliable ASR labels.
        # Use every viable region, retaining a manifest of excluded windows.
        for n,start in enumerate(range(0,len(audio),int(sr*4.5))):
            clip=audio[start:start+int(sr*4.5)]
            item={'source':m['id'],'start':start/sr,'seconds':len(clip)/sr,'id':m['id']+'-'+str(n)}
            rms=float(np.sqrt(np.mean(clip**2)))
            item.update(rms=rms,clippedFraction=float(np.mean(np.abs(clip)>.995)))
            if len(clip)<sr*1.6 or rms<.007 or item['clippedFraction']>.04:
                item['excluded']='too-short-or-silent-or-clipped';rows.append(item);continue
            path=WORK/'segments'/(item['id']+'.wav');path.parent.mkdir(exist_ok=True)
            if not path.exists():sf.write(path,clip,sr,subtype='PCM_16')
            item['file']=str(path);rows.append(item)
    if len(sources)<1:raise RuntimeError('没有已授权的导师素材')
    (WORK/'dataset.json').write_text(json.dumps({'sources':sources,'windows':rows},ensure_ascii=False,indent=2),encoding='utf-8')
    report(stage='载入本机语音模型',sourceCount=len(sources),sourceSeconds=round(sum(s['seconds'] for s in sources),2),usableWindows=sum('file' in r for r in rows),progress=2)
    return rows,sources

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--epochs',type=int,default=2);parser.add_argument('--synthesize-only',action='store_true');parser.add_argument('--full-flow-checkpoint');args=parser.parse_args()
    global STATUS
    if args.full_flow_checkpoint:
        if not args.synthesize_only:raise ValueError('全参数版本必须使用已完成的检查点')
        STATUS=ROOT/'dist/narration/mentor-full-training.json'
    torch.set_num_threads(4);torch.set_num_interop_threads(1)
    torch.manual_seed(1729);np.random.seed(1729);random.seed(1729)
    rows,sources=prepare()
    directory=RUNTIME/'pretrained_models/Fun-CosyVoice3-0.5B'
    # Training only needs the acoustic model. Loading LLM checkpoints twice
    # during construction can exhaust RAM while the web app is also running.
    with torch.device('meta'),(directory/'cosyvoice3.yaml').open() as stream:
        config=load_hyperpyyaml(stream,overrides={'qwen_pretrain_path':str(directory/'CosyVoice-BlankEN'),'llm':None,'hift':None,'hifigan':None})
    flow=config['flow']
    flow.load_state_dict(torch.load(directory/'flow.pt',map_location='cpu',weights_only=True,mmap=True),assign=True)
    flow.decoder.rand_noise=torch.randn(1,80,50*300)
    flow.requires_grad_(False)
    frontend=CosyVoiceFrontEnd.__new__(CosyVoiceFrontEnd)
    frontend.device=torch.device('cpu');frontend.feat_extractor=config['feat_extractor'];frontend.allowed_special=config['allowed_special'];frontend.spk2info={};frontend.text_frontend=''
    options=ort.SessionOptions();options.intra_op_num_threads=4;options.enable_cpu_mem_arena=False;options.enable_mem_pattern=False;options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
    frontend.campplus_session=ort.InferenceSession(str(directory/'campplus.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
    frontend.speech_tokenizer_session=ort.InferenceSession(str(directory/'speech_tokenizer_v3.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
    model=CosyVoice3.__new__(CosyVoice3);model.model_dir=str(directory);model.sample_rate=24000;model.frontend=frontend;model.fp16=False
    flow.eval();flow.decoder.training_cfg_rate=0
    eligible=[r for r in rows if 'file' in r];features=[]
    for i,row in enumerate(eligible):
        cache=WORK/'features'/(row['id']+'.pt');cache.parent.mkdir(exist_ok=True)
        if cache.exists():feature=torch.load(cache,map_location='cpu',weights_only=True)
        else:
            with torch.no_grad():
                token,_=model.frontend._extract_speech_token(row['file'])
                feat,_=model.frontend._extract_speech_feat(row['file'])
                embedding=model.frontend._extract_spk_embedding(row['file'])
                h=flow.pre_lookahead_layer(flow.input_embedding(token.long())).repeat_interleave(flow.token_mel_ratio,dim=1)
                length=min(feat.shape[1],h.shape[1])
                feature={'mu':h[:,:length].transpose(1,2).contiguous(),'feat':feat[:,:length].transpose(1,2).contiguous(),'embedding':embedding,'source':row['source']}
            torch.save(feature,cache)
        features.append((row,feature))
        report(status='extracting',stage='提取音色与声学特征',step=i+1,total=len(eligible),progress=5+30*(i+1)/len(eligible))
    # Equal weight per source, so the longest video cannot drown out the others.
    means=[]
    for source in sources:
        vectors=[F.normalize(f['embedding'],dim=1) for r,f in features if r['source']==source['id']]
        if not vectors:raise RuntimeError('一份素材没有可用人声：'+source['id'])
        means.append(F.normalize(torch.cat(vectors).mean(0,keepdim=True),dim=1))
    speaker=F.normalize(torch.cat(means).mean(0,keepdim=True),dim=1)
    # Keep all accepted sources represented in both training and validation.
    train=[];valid=[]
    for source in sources:
        subset=[f for r,f in features if r['source']==source['id']]
        for i,f in enumerate(subset):(valid if i%8==0 else train).append(f)
    if not train or not valid:raise RuntimeError('素材不足以划分训练和验证集')
    projection=flow.spk_embed_affine_layer
    original={k:v.detach().clone() for k,v in projection.state_dict().items()}
    projection.requires_grad_(True)
    optimizer=torch.optim.AdamW(projection.parameters(),lr=3e-5,weight_decay=.01)
    def loss_for(feature,seed=None):
        if seed is not None:torch.manual_seed(seed)
        x=feature['feat'];mask=torch.ones(1,1,x.shape[-1]);cond=torch.zeros_like(x)
        return flow.decoder.compute_loss(x,mask,feature['mu'],projection(speaker),cond=cond,streaming=False)[0]
    def validate():
        with torch.no_grad():return float(np.mean([loss_for(f,9000+i).item() for i,f in enumerate(valid)]))
    saved=torch.load(WORK/'selected.pt',map_location='cpu',weights_only=True) if args.synthesize_only else None
    baseline=saved['baselineLoss'] if saved else validate();best=saved['validationLoss'] if saved else baseline;best_epoch=1 if saved and saved['adapted'] else 0
    if not saved:
        report(status='training',stage='训练导师音色适配参数',baselineLoss=baseline,trainWindows=len(train),validationWindows=len(valid),trainableParameters=sum(p.numel() for p in projection.parameters()),progress=38)
    elif args.full_flow_checkpoint:
        full_result=json.loads((STORE/'training/mentor-full-v1/training.json').read_text(encoding='utf-8'))
        report(status='preparing',stage='准备声学全参数版本试听',trainableParameters=full_result['trainableParameters'],fullAcousticValidation={'baselineLoss':full_result['baselineLoss'],'validationLoss':full_result['validationLoss']},progress=38)
    else:report(status='preparing',stage='恢复已保存的音色参数',progress=38)
    step=0;total=len(train)*args.epochs
    for epoch in range(0 if saved else args.epochs):
        order=list(range(len(train)));random.shuffle(order)
        for index in order:
            started=time.monotonic();optimizer.zero_grad(set_to_none=True)
            loss=loss_for(train[index]);loss.backward()
            torch.nn.utils.clip_grad_norm_(projection.parameters(),1.)
            optimizer.step();step+=1
            # Checkpoints remain private and allow continuation after interruption.
            torch.save({'projection':projection.state_dict(),'speaker':speaker,'optimizer':optimizer.state_dict(),'step':step},WORK/'last.pt')
            report(step=step,total=total,epoch=epoch+1,loss=float(loss.detach()),stepSeconds=round(time.monotonic()-started,2),progress=38+45*step/total)
        value=validate()
        if value<best:
            best=value;best_epoch=epoch+1
            torch.save({'projection':projection.state_dict(),'speaker':speaker,'epoch':best_epoch,'validationLoss':best,'baselineLoss':baseline},WORK/'best.pt')
        report(validationLoss=value,bestValidationLoss=best)
    selected=WORK/'best.pt'
    if saved:
        projection.load_state_dict(saved['projection']);speaker=saved['speaker']
    elif selected.exists() and best_epoch:
        checkpoint=torch.load(selected,map_location='cpu',weights_only=True);projection.load_state_dict(checkpoint['projection'])
    else:
        projection.load_state_dict(original)
    if not args.full_flow_checkpoint:torch.save({'projection':projection.state_dict(),'speaker':speaker,'adapted':bool(best_epoch),'baselineLoss':baseline,'validationLoss':best,'sources':sources},WORK/'selected.pt')
    report(status='synthesizing',stage='生成导师对照试听',progress=86,selectedEpoch=best_epoch,adaptationAccepted=bool(best_epoch))
    # The verified short transcript supplies pronunciation; all three recordings
    # supply the learned projection and pooled identity. Do not concatenate texts.
    reference=STORE/'processed/f922ad0fa273a637876ad1b4d9ddbef3/reference-clip.wav'
    prompt='You are a helpful assistant.<|endofprompt|>今年已经是我从教的第二十七个年头了。我一直是在苏州大学从事音乐教育的工作。'
    frontend.tokenizer=config['get_tokenizer']()
    model.add_zero_shot_spk(prompt,str(reference),'mentor-adapted')
    if not args.full_flow_checkpoint:
        model.frontend.spk2info['mentor-adapted']['flow_embedding']=speaker
        model.frontend.spk2info['mentor-adapted']['llm_embedding']=speaker
    del frontend.speech_tokenizer_session,frontend.campplus_session
    config['flow']=None
    del flow,features,train,valid,optimizer
    gc.collect()
    # Only cached prompt features are required for generation. Release the
    # two ONNX encoders before allocating the text model.
    from cosyvoice.llm.llm import Qwen2Encoder
    from transformers import Qwen2ForCausalLM,AutoConfig
    class EmptyQwenEncoder(Qwen2Encoder):
        def __init__(self,pretrain_path):
            torch.nn.Module.__init__(self)
            self.model=Qwen2ForCausalLM(AutoConfig.from_pretrained(pretrain_path))
    import cosyvoice.llm.llm as llm_module
    original_encoder=llm_module.Qwen2Encoder;llm_module.Qwen2Encoder=EmptyQwenEncoder
    try:
        with torch.device('meta'),(directory/'cosyvoice3.yaml').open() as stream:
            inference_config=load_hyperpyyaml(stream,overrides={'qwen_pretrain_path':str(directory/'CosyVoice-BlankEN'),'flow':None,'hifigan':None})
    finally:llm_module.Qwen2Encoder=original_encoder
    llm,hift=inference_config['llm'],inference_config['hift']
    llm.load_state_dict(torch.load(directory/'llm.pt',map_location='cpu',weights_only=True,mmap=True),assign=True)
    hift.load_state_dict({k.replace('generator.',''):v for k,v in torch.load(directory/'hift.pt',map_location='cpu',weights_only=True,mmap=True).items()},assign=True)
    # Rotary frequencies are non-persistent and therefore absent from weights.
    for module in llm.modules():
        if hasattr(module,'rope_init_fn') and getattr(module,'inv_freq',None) is not None and module.inv_freq.is_meta:
            frequencies,module.attention_scaling=module.rope_init_fn(module.config,torch.device('cpu'))
            module.register_buffer('inv_freq',frequencies,persistent=False);module.original_inv_freq=frequencies
    for module in hift.modules():
        for name in ('rand_ini','sine_waves','uv'):
            value=getattr(module,name,None)
            if isinstance(value,torch.Tensor) and value.is_meta:
                shape=list(value.shape)
                # This comparison sentence is short; the stock five-minute
                # random-noise cache wastes hundreds of MB on a CPU machine.
                if name in ('sine_waves','uv'):shape[1]=min(shape[1],60*24000)
                value=torch.rand(shape,device='cpu',dtype=value.dtype)
                if name=='rand_ini':value[:,0]=0
                setattr(module,name,value)
    unresolved=[name for root in (llm,hift) for name,buffer in root.named_buffers() if buffer.is_meta]
    if unresolved:raise RuntimeError('推理缓冲区尚未初始化：'+', '.join(unresolved))
    llm.eval();hift.eval()
    text='老师您好，欢迎您来看秋鸣的项目。我们先听一段音乐，再一起看看谱子。'
    inputs=frontend.frontend_zero_shot(text,'','',24000,'mentor-adapted')
    token_path=WORK/'comparison-tokens.pt'
    if token_path.exists():tokens=torch.load(token_path,weights_only=True)
    else:
        values=[];silent=0
        for token in llm.inference(text=inputs['text'],text_len=inputs['text_len'],prompt_text=inputs['prompt_text'],prompt_text_len=inputs['prompt_text_len'],prompt_speech_token=inputs['llm_prompt_speech_token'],prompt_speech_token_len=inputs['llm_prompt_speech_token_len'],embedding=inputs['llm_embedding'],uuid='mentor-comparison'):
            silent=silent+1 if token in [1,2,28,29,55,248,494,2241,2242,2322,2323] else 0
            if silent<=5:values.append(token)
            if len(values)%25==0:report(stage='生成讲解语音内容',generatedTokens=len(values))
        tokens=torch.tensor(values,dtype=torch.int32).unsqueeze(0);torch.save(tokens,token_path)
    inference_config['llm']=None;del llm;gc.collect()
    report(stage='将训练后的音色合成为声音',progress=92)
    with torch.device('meta'),(directory/'cosyvoice3.yaml').open() as stream:
        acoustic_config=load_hyperpyyaml(stream,overrides={'qwen_pretrain_path':str(directory/'CosyVoice-BlankEN'),'llm':None,'hift':None,'hifigan':None})
    flow=acoustic_config['flow']
    flow_weights=torch.load(args.full_flow_checkpoint or directory/'flow.pt',map_location='cpu',weights_only=True,mmap=True)
    flow.load_state_dict(flow_weights['model'] if args.full_flow_checkpoint else flow_weights,assign=True)
    flow.decoder.rand_noise=torch.randn(1,80,50*300)
    if not args.full_flow_checkpoint:flow.spk_embed_affine_layer.load_state_dict(torch.load(WORK/'selected.pt',weights_only=True)['projection'])
    flow.eval()
    model.model=CosyVoice3Model(None,flow,hift,False)
    with torch.inference_mode():
        chunks=[result['tts_speech'].squeeze(0).cpu().numpy() for result in model.model.tts(**inputs,source_speech_token=tokens,stream=False)]
    audio=np.concatenate(chunks)
    if not np.isfinite(audio).all() or len(audio)<24000 or np.max(np.abs(audio))<.001:raise RuntimeError('试听没有生成有效音频')
    variant='full' if args.full_flow_checkpoint else 'trained'
    target=STORE/('processed/f922ad0fa273a637876ad1b4d9ddbef3/mentor-preface-'+variant+'.wav')
    temporary=target.with_suffix('.pending.wav');sf.write(temporary,audio,24000,subtype='PCM_16');temporary.replace(target)
    report(status='complete',stage='对照试听已生成',progress=100,audioSeconds=round(len(audio)/24000,2),preview='/api/voice-reference/mentor/f922ad0fa273a637876ad1b4d9ddbef3/trial?variant='+variant,text=text)

if __name__=='__main__':
    try:main()
    except Exception as error:report(status='failed',stage='处理停止',error=type(error).__name__+': '+(str(error) or '本机可用内存不足，任务已停止并保留进度'));traceback.print_exc();raise
