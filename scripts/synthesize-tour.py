"""Resumable, offline CosyVoice generation. Publish only finalized, decoded audio."""
import os
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
import json, sys, time, hashlib, subprocess
from pathlib import Path
import numpy as np
import soundfile as sf
import torch

ROOT=Path(__file__).resolve().parents[1]
RUNTIME=Path('C:/PianoCoachRuntime/cosyvoice')
sys.path.insert(0,str(RUNTIME/'CosyVoice-main'))
from cosyvoice.cli.cosyvoice import CosyVoice3
OUT=ROOT/'dist/narration'
WORK=ROOT/'.sites-runtime/tour-synthesis'
WORK.mkdir(parents=True,exist_ok=True)
FFMPEG=Path('C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe')
TEXTS=[
 ('mentor-preface','mentor','老师您好，欢迎您来看唐秋鸣的项目。这是一个钢琴学习工作区，可以从乐谱开始，试听演奏，再查看练习和改编的过程。接下来由秋鸣介绍他的做法，以及还想继续研究的问题。'),
 ('tang-opening','tang','老师您好，我是唐秋鸣。我在苏州大学学习音乐教育，主项是钢琴。最早做异地合奏，是希望不在同一间琴房的人也能一起排练。这个网页是后来的钢琴学习原型，我想请您看几个具体的环节。'),
 ('tang-select','tang','请您在曲库里选一首熟悉的作品。我们沿着同一首曲子往下看，这样更容易听出问题。选好以后，等谱子打开，再继续演示。'),
 ('tang-import','tang','这里可以放入电子文件、照片或录音。识别出来以后，我仍然要对照原稿。拍号或者左右手读错，会影响后面的播放和评价，所以这一步不能省。'),
 ('tang-play','tang','现在可以先听一段，再放慢速度，对着谱看。我之前反复遇到小节末尾停顿的问题。它提醒我，演奏的呼吸必须建立在节奏正确的基础上，不能靠随意改变速度。'),
 ('tang-practice','tang','这里是跟弹练习。我更想知道，学生看见提示以后，到底怎样改变练习。下一步我想比较实时提示和乐句结束后的提示，再关掉提示，让学生独立弹一次。'),
 ('tang-arrange','tang','这里可以查看改编后的声部。我关心的不是声部数量，而是它们是否给旋律留出空间。生成以后还需要试听、核对，再请老师和学生判断是否适合练习。'),
 ('tang-tasks','tang','耗时的识别和改编放在任务中心。等待的时候仍然可以看原稿，听已经处理好的部分。出错也应该说清楚原因，避免打断使用者刚才的思路。'),
 ('tang-closing','tang','这就是目前的原型。它还不能替代教师的判断。我最想推进的是，把反馈的时机和学生的练习行为联系起来，用一个范围明确的实验去检验。谢谢您听我介绍，也期待您的意见。')
]
REF=ROOT/'.sites-runtime/voice-reference/processed'
intro=json.loads((OUT/'mentor-script.json').read_text(encoding='utf-8'))
TEXTS=[(item['id'],'mentor',item['text']) for item in intro]+[item for item in TEXTS if item[1]=='tang']
SPEAKERS={
 'mentor':(REF/'f922ad0fa273a637876ad1b4d9ddbef3/reference-clip.wav','今年已经是我从教的第二十七个年头了。我一直是在苏州大学从事音乐教育的工作。'),
 'tang':(REF/'ddbaeca4c9704c390bf1dc50d26b7eb6/reference-short.wav','老师您好，我是唐秋鸣，现在在苏州大学学习音乐教育，主项是钢琴。')
}
state={'status':'loading','completed':0,'total':len(TEXTS),'current':'加载语音模型','updated':time.time()}
def report(**fields):
 # The local web server can briefly hold the status file open on Windows.
 # Progress reporting must never abort an hours-long CPU synthesis because a
 # status-file rename happened during that tiny read window.
 state.update(fields,updated=time.time());p=OUT/'generation.json';tmp=p.with_suffix('.tmp');payload=json.dumps(state,ensure_ascii=False)
 for attempt in range(12):
  try:
   tmp.write_text(payload,encoding='utf-8');tmp.replace(p);break
  except PermissionError:
   time.sleep(.15*(attempt+1))
  except OSError:
   if attempt==11:
    try:p.write_text(payload,encoding='utf-8')
    except OSError:pass
 else:
  try:p.write_text(payload,encoding='utf-8')
  except OSError:pass
 print(payload,flush=True)
def main():
 OUT.mkdir(parents=True,exist_ok=True);report()
 torch.set_num_threads(4);torch.set_num_interop_threads(1)
 model=CosyVoice3(str(RUNTIME/'pretrained_models/Fun-CosyVoice3-0.5B'),fp16=False)
 for role,(wav,text) in SPEAKERS.items():
  model.add_zero_shot_spk('You are a helpful assistant.<|endofprompt|>'+text,str(wav),role)
 manifest=[]
 for n,(name,role,text) in enumerate(TEXTS):
  target=OUT/(name+'.m4a');receipt=WORK/(name+'.json')
  digest=hashlib.sha256((text+str(SPEAKERS[role])).encode()).hexdigest()
  if not(target.exists() and receipt.exists() and json.loads(receipt.read_text()).get('hash')==digest):
   report(status='synthesizing',completed=n,current=name,text=text,samples=0)
   chunks=[];started=time.monotonic()
   for result in model.inference_zero_shot(text,'','',zero_shot_spk_id=role,stream=True,text_frontend=False):
    chunks.append(result['tts_speech'].squeeze(0).detach().cpu().numpy())
    report(samples=sum(len(c) for c in chunks),audioSeconds=sum(len(c) for c in chunks)/model.sample_rate,elapsed=round(time.monotonic()-started,1))
   audio=np.concatenate(chunks)
   if not np.isfinite(audio).all() or len(audio)<model.sample_rate or np.max(np.abs(audio))<0.001:raise RuntimeError(name+'没有生成有效声音')
   wav=WORK/(name+'.wav');sf.write(wav,audio,model.sample_rate,subtype='PCM_16')
   temp=OUT/(name+'.pending.m4a')
   subprocess.run([str(FFMPEG),'-v','error','-y','-i',str(wav),'-c:a','aac','-b:a','128k','-movflags','+faststart',str(temp)],check=True)
   subprocess.run([str(FFMPEG),'-v','error','-i',str(temp),'-f','null','-'],check=True)
   temp.replace(target);receipt.write_text(json.dumps({'hash':digest,'seconds':len(audio)/model.sample_rate}),encoding='utf-8')
  manifest.append({'id':name,'role':role,'text':text,'url':'/narration/'+target.name})
  report(completed=n+1,current=name)
 # One atomic manifest prevents a half-complete tour being treated as ready.
 temp=OUT/'tour.tmp';temp.write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8');temp.replace(OUT/'tour.json')
 report(status='complete',current='全部旁白已生成')
if __name__=='__main__':
 try:main()
 except Exception as exc:
  report(status='failed',error=str(exc));raise
