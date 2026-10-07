"""Full CosyVoice3 acoustic-flow fine-tuning, independent of the production model.

This trains all flow parameters. The text model and vocoder are not trained.
Validation windows never receive optimizer updates. Resume restores optimizer,
random state and order; original model files are never written.
"""
import os,json,sys,time,random,argparse,gc
from pathlib import Path
try:
    from .runtime_location import cosyvoice_runtime
except ImportError:
    from runtime_location import cosyvoice_runtime
os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
import torch,numpy as np,onnxruntime as ort
ROOT=Path(__file__).resolve().parents[1];RUNTIME=cosyvoice_runtime()
sys.path.insert(0,str(RUNTIME/'CosyVoice-main'))
from hyperpyyaml import load_hyperpyyaml
from cosyvoice.cli.frontend import CosyVoiceFrontEnd
MODEL=RUNTIME/'pretrained_models/Fun-CosyVoice3-0.5B'
OUT=ROOT/'.sites-runtime/voice-reference/training/mentor-full-v1'
DATA=ROOT/'.sites-runtime/voice-reference/training/mentor-acoustic-v1/dataset.json'
STATUS=ROOT/'dist/narration/mentor-full-training.json'
state={'status':'loading','scope':'full-acoustic-flow-only','production':False}
def report(**values):
    state.update(values,updated=time.time());payload=json.dumps(state,ensure_ascii=False,indent=2)
    for path in (OUT/'training.json',STATUS):
        temporary=path.with_suffix('.tmp')
        for attempt in range(30):
            try:temporary.write_text(payload,encoding='utf-8');temporary.replace(path);break
            except PermissionError:time.sleep(.1)
    print(json.dumps(values,ensure_ascii=False),flush=True)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--resume',action='store_true');args=parser.parse_args()
    torch.set_num_threads(4);torch.set_num_interop_threads(1);torch.manual_seed(1729);random.seed(1729)
    manifest=json.loads(DATA.read_text(encoding='utf-8'));rows=[r for r in manifest['windows'] if r.get('file')]
    report(stage='准备三份录音的训练特征',progress=1,sourceCount=len(manifest['sources']),sourceSeconds=round(sum(s['seconds'] for s in manifest['sources']),2))
    with torch.device('meta'),(MODEL/'cosyvoice3.yaml').open() as stream:
        config=load_hyperpyyaml(stream,overrides={'qwen_pretrain_path':str(MODEL/'CosyVoice-BlankEN'),'llm':None,'hift':None,'hifigan':None})
    flow=config['flow'];flow.load_state_dict(torch.load(MODEL/'flow.pt',weights_only=True,map_location='cpu',mmap=True),assign=True)
    flow.decoder.rand_noise=torch.randn(1,80,50*300)
    frontend=CosyVoiceFrontEnd.__new__(CosyVoiceFrontEnd);frontend.device=torch.device('cpu');frontend.feat_extractor=config['feat_extractor']
    options=ort.SessionOptions();options.intra_op_num_threads=2;options.enable_cpu_mem_arena=False;options.enable_mem_pattern=False;options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
    frontend.speech_tokenizer_session=ort.InferenceSession(str(MODEL/'speech_tokenizer_v3.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
    frontend.campplus_session=ort.InferenceSession(str(MODEL/'campplus.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
    batches=[]
    for index,row in enumerate(rows):
        cache=OUT/'features'/(row['id']+'.pt');cache.parent.mkdir(exist_ok=True)
        if cache.exists():batch=torch.load(cache,weights_only=True)
        else:
            token,_=frontend._extract_speech_token(row['file']);feat,_=frontend._extract_speech_feat(row['file']);embedding=frontend._extract_spk_embedding(row['file'])
            length=min(token.shape[1],feat.shape[1]//2);token=token[:,:length];feat=feat[:,:length*2]
            batch={'speech_token':token,'speech_token_len':torch.tensor([length]),'speech_feat':feat,'speech_feat_len':torch.tensor([length*2]),'embedding':embedding}
            torch.save(batch,cache)
        batches.append(batch);report(progress=2+8*(index+1)/len(rows),featureStep=index+1,featureTotal=len(rows))
    del frontend;gc.collect()
    train=[];valid=[]
    for source in manifest['sources']:
        indices=[i for i,row in enumerate(rows) if row['source']==source['id']]
        for i,index in enumerate(indices):(valid if i%8==0 else train).append(index)
    flow.requires_grad_(True);count=sum(p.numel() for p in flow.parameters());flow.train()
    def validate():
        python_state=random.getstate();torch_state=torch.get_rng_state();losses=[];flow.eval()
        with torch.no_grad():
            for i,index in enumerate(valid):
                random.seed(9100+i);torch.manual_seed(9100+i);losses.append(float(flow(batches[index],torch.device('cpu'))['loss']))
        random.setstate(python_state);torch.set_rng_state(torch_state);flow.train();return sum(losses)/len(losses)
    resume=OUT/'resume.pt';step=0;order=train[:];random.shuffle(order)
    optimizer=torch.optim.AdamW(flow.parameters(),lr=3e-7,weight_decay=.001,foreach=False)
    if args.resume and resume.exists():
        saved=torch.load(resume,weights_only=True,mmap=True);flow.load_state_dict(saved['model']);optimizer.load_state_dict(saved['optimizer']);order=saved['order'];step=saved['step'];baseline=saved['baseline'];random.setstate(saved['pythonRandom']);torch.set_rng_state(saved['torchRandom']);del saved
    else:baseline=validate()
    report(status='training',stage='训练声学模块全部参数',progress=12,step=step,total=len(order),trainWindows=len(train),validationWindows=len(valid),trainableParameters=count,baselineLoss=baseline)
    times=[]
    for position in range(step,len(order)):
        started=time.monotonic();optimizer.zero_grad(set_to_none=True);loss=flow(batches[order[position]],torch.device('cpu'))['loss']
        if not torch.isfinite(loss):raise RuntimeError('训练误差出现非有限值，已停止')
        loss.backward();torch.nn.utils.clip_grad_norm_(flow.parameters(),1.);optimizer.step();step=position+1;times.append(time.monotonic()-started)
        report(step=step,loss=float(loss.detach()),progress=12+78*step/len(order),stepSeconds=round(times[-1],2),remainingSeconds=round(sum(times[-10:])/len(times[-10:])*(len(order)-step)))
        if step%20==0 or step==len(order):
            temporary=resume.with_suffix('.pending.pt');torch.save({'model':flow.state_dict(),'optimizer':optimizer.state_dict(),'order':order,'step':step,'baseline':baseline,'pythonRandom':random.getstate(),'torchRandom':torch.get_rng_state()},temporary);temporary.replace(resume)
    optimizer.zero_grad(set_to_none=True);del optimizer;gc.collect()
    report(status='validating',stage='检查保留录音上的效果',progress=92)
    final=validate();target=OUT/'flow-candidate.pt';torch.save({'model':flow.state_dict(),'scope':'full-acoustic-flow-only','steps':step,'baselineLoss':baseline,'validationLoss':final,'production':False},target)
    report(status='complete',stage='声学全参数训练完成，待试听比较',progress=100,validationLoss=final,validationImproved=final<baseline,checkpoint=str(target))
if __name__=='__main__':
    try:main()
    except Exception as error:report(status='failed',stage='训练停止，已保留检查点',error=type(error).__name__+': '+str(error));raise
