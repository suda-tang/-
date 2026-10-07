"""One real all-parameter acoustic training step, separate from production."""
import json,sys,time,os
from pathlib import Path
try:
    from .runtime_location import cosyvoice_runtime
except ImportError:
    from runtime_location import cosyvoice_runtime
os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
import torch
import onnxruntime as ort
ROOT=Path(__file__).resolve().parents[1]
RUNTIME=cosyvoice_runtime();sys.path.insert(0,str(RUNTIME/'CosyVoice-main'))
from hyperpyyaml import load_hyperpyyaml
from cosyvoice.cli.frontend import CosyVoiceFrontEnd
MODEL=RUNTIME/'pretrained_models/Fun-CosyVoice3-0.5B'
OUT=ROOT/'.sites-runtime/voice-reference/training/mentor-full-v1'
def report(**values):
    (OUT/'acoustic-smoke.json').write_text(json.dumps(values,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(values,ensure_ascii=False),flush=True)
def main():
    torch.set_num_threads(4);torch.set_num_interop_threads(1);torch.manual_seed(1729)
    report(status='loading',scope='full-acoustic-flow-only')
    with torch.device('meta'),(MODEL/'cosyvoice3.yaml').open() as stream:
        config=load_hyperpyyaml(stream,overrides={'qwen_pretrain_path':str(MODEL/'CosyVoice-BlankEN'),'llm':None,'hift':None,'hifigan':None})
    flow=config['flow'];flow.load_state_dict(torch.load(MODEL/'flow.pt',weights_only=True,map_location='cpu',mmap=True),assign=True)
    flow.decoder.rand_noise=torch.randn(1,80,50*300)
    frontend=CosyVoiceFrontEnd.__new__(CosyVoiceFrontEnd);frontend.device=torch.device('cpu');frontend.feat_extractor=config['feat_extractor']
    options=ort.SessionOptions();options.intra_op_num_threads=2;options.enable_cpu_mem_arena=False;options.enable_mem_pattern=False;options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
    frontend.speech_tokenizer_session=ort.InferenceSession(str(MODEL/'speech_tokenizer_v3.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
    frontend.campplus_session=ort.InferenceSession(str(MODEL/'campplus.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
    reference=ROOT/'.sites-runtime/voice-reference/processed/f922ad0fa273a637876ad1b4d9ddbef3/reference-clip.wav'
    token,_=frontend._extract_speech_token(str(reference));feat,_=frontend._extract_speech_feat(str(reference));embedding=frontend._extract_spk_embedding(str(reference))
    token=token[:,:100];length=min(feat.shape[1],token.shape[1]*2);token=token[:,:length//2];feat=feat[:,:token.shape[1]*2]
    batch={'speech_token':token,'speech_token_len':torch.tensor([token.shape[1]]),'speech_feat':feat,'speech_feat_len':torch.tensor([feat.shape[1]]),'embedding':embedding}
    del frontend
    flow.requires_grad_(True);flow.train();optimizer=torch.optim.AdamW(flow.parameters(),lr=1e-6,weight_decay=.01,foreach=False)
    count=sum(p.numel() for p in flow.parameters());report(status='forward',scope='full-acoustic-flow-only',trainableParameters=count)
    started=time.monotonic();loss=flow(batch,torch.device('cpu'))['loss'];report(status='backward',loss=float(loss.detach()),trainableParameters=count)
    loss.backward();torch.nn.utils.clip_grad_norm_(flow.parameters(),1.)
    grad_count=sum(p.numel() for p in flow.parameters() if p.grad is not None)
    report(status='optimizer',parametersWithGradient=grad_count,trainableParameters=count)
    optimizer.step()
    target=OUT/'flow-smoke.pt';torch.save({'model':flow.state_dict(),'steps':1,'scope':'full-acoustic-flow-only','production':False},target)
    report(status='complete',scope='full-acoustic-flow-only',steps=1,loss=float(loss.detach()),trainableParameters=count,parametersWithGradient=grad_count,seconds=round(time.monotonic()-started,2),checkpoint=str(target),production=False)
if __name__=='__main__':
    try:main()
    except Exception as error:report(status='failed',error=type(error).__name__+': '+str(error));raise
