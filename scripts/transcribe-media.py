"""Transkun CPU inference and ordered image-book assembly, outside HTTP threads."""
import sys,json,math,subprocess,wave,copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path[:0]=[str(ROOT),str(ROOT/'.sites-runtime/transcription-vendor')]
from storage import write_json
from idle_runtime import checkpoint

def notation(midi,title,path,samples=None,sample_rate=44100):
 import numpy as np
 from music21 import stream,note,chord,meter,clef,instrument,metadata,layout,tempo
 try:bpm=round(midi.estimate_tempo())
 except (ValueError,IndexError):bpm=80
 while bpm>180:bpm=round(bpm/2)
 while bpm<45:bpm*=2
 # Fit to local beat times instead of accumulating one global tempo's error.
 beat_times=None
 # Keep a single, stable transport grid for transcription. Frame-by-frame
 # beat tracking can jump at bar lines on accompaniment recordings, which
 # creates audible tempo resets and wrong measure boundaries.
 use_local_tempo=False
 if use_local_tempo and samples is not None and len(samples)>sample_rate*3:
  try:
   import librosa
   tracked,frames=librosa.beat.beat_track(y=librosa.resample(samples,orig_sr=sample_rate,target_sr=22050),sr=22050,trim=False)
   times=librosa.frames_to_time(frames,sr=22050)
  except ImportError:
   # Local fallback when optional beat-tracker dependencies are unavailable.
   # Fit a weighted onset pulse, then follow nearby attacks without removing rests.
   notes=[n for t in midi.instruments if not t.is_drum for n in t.notes]
   attacks=np.array(sorted(n.start for n in notes));times=[]
   if len(attacks)>3:
    step=.01;train=np.zeros(int(attacks[-1]/step)+101)
    for n in notes:train[int(n.start/step)]+=n.velocity/127
    fft=np.fft.rfft(train,n=2*len(train));corr=np.fft.irfft(fft*np.conj(fft))[:len(train)]
    lags=np.arange(33,min(110,len(corr)))
    if len(lags):
     best=max(lags,key=lambda lag:corr[lag]*(.8+.2*np.exp(-abs(60/(lag*step)-bpm)/35)))
     period=best*step;current=attacks[0]
     while current<=attacks[-1]+period:
      times.append(current);target=current+period;near=attacks[np.abs(attacks-target)<period*.14]
      correction=float(near[np.argmin(abs(near-target))]-target)*.35 if len(near) else 0
      current=target+correction
   times=np.asarray(times)
  if len(times)>=4:
   beat_times=times; bpm=int(round(60/np.median(np.diff(times))))
 def beat_at(seconds):
  if beat_times is None:return seconds*bpm/60
  if seconds<beat_times[0]:return (seconds-beat_times[0])/(beat_times[1]-beat_times[0])
  if seconds>beat_times[-1]:return len(beat_times)-1+(seconds-beat_times[-1])/(beat_times[-1]-beat_times[-2])
  return float(np.interp(seconds,beat_times,np.arange(len(beat_times))))
 all_notes=[n for track in midi.instruments if not track.is_drum for n in track.notes]
 origin=min(0,min((beat_at(n.start) for n in all_notes),default=0))
 raw=[beat_at(n.start)-origin for n in all_notes]
 # Select straight or triplet subdivisions globally, avoiding mixed accidental tuplets.
 grid=min((4,3),key=lambda g:np.mean([abs(x-round(x*g)/g) for x in raw])+(0.018 if g==3 else 0)) if raw else 4
 signatures=midi.time_signature_changes
 signature=f'{signatures[0].numerator}/{signatures[0].denominator}' if signatures else '4/4'
 score=stream.Score();score.metadata=metadata.Metadata();score.metadata.title=title
 parts=[stream.PartStaff(id='PianoRH'),stream.PartStaff(id='PianoLH')]
 for index,part in enumerate(parts):
  part.partName='钢琴';part.insert(0,instrument.Piano());part.insert(0,meter.TimeSignature(signature));part.insert(0,clef.TrebleClef() if index==0 else clef.BassClef());part.insert(0,tempo.MetronomeMark(number=bpm))
  groups={}
  for track in midi.instruments:
   if track.is_drum:continue
   for n in track.notes:
    if (n.pitch>=60)!=(index==0):continue
    onset=max(0,round((beat_at(n.start)-origin)*grid)/grid);ending=round((beat_at(n.end)-origin)*grid)/grid;duration=max(1/grid,ending-onset)
    groups.setdefault((onset,duration),[]).append(n.pitch)
  for (onset,duration),pitches in sorted(groups.items()):
   item=note.Note(pitches[0]) if len(pitches)==1 else chord.Chord(sorted(set(pitches)))
   item.quarterLength=duration;part.insert(onset,item)
  if not groups:part.append(note.Rest(quarterLength=4))
  part.makeMeasures(inPlace=True)
  for measure in part.getElementsByClass(stream.Measure):measure.makeVoices(inPlace=True,fillGaps=True)
  part.makeTies(inPlace=True)
  score.insert(0,part)
 score.insert(0,layout.StaffGroup(parts,symbol='brace',barTogether=True));score.write('musicxml',fp=str(path))

def run(request):
 data=json.loads(Path(request).read_text(encoding='utf-8'));key=data['digest'];cache=Path(data.get('cacheDir') or ROOT/'.sites-runtime/score-cache');progress_path=cache/(key+'.import-progress.json')
 def progress(value,detail,**extra):write_json(progress_path,{'progress':value,'detail':detail,**extra})
 try:
  if data['mode']=='photos':
   from PIL import Image,ImageOps
   try:
    import pillow_heif
    pillow_heif.register_heif_opener()
   except ImportError:pass
   manifest=json.loads((cache/(key+'.photo-book.json')).read_text(encoding='utf-8'));target=cache/(key+'.pdf');temporary=cache/(key+'.assembling.pdf')
   for i,image_id in enumerate(manifest['pages']):
    checkpoint()
    with Image.open(cache/(image_id+'.photo')) as raw:
     if raw.width*raw.height>40000000:raise ValueError('照片分辨率过大，请缩小后上传')
     image=ImageOps.exif_transpose(raw).convert('RGB');image.thumbnail((2400,3200));image.save(temporary,'PDF',resolution=200,append=i>0)
    progress((i+1)/len(manifest['pages'])*95,f'整理照片 {i+1} / {len(manifest["pages"])}')
   temporary.replace(target);progress(100,'照片已整理，开始识谱');return
  import imageio_ffmpeg,numpy as np,torch,moduleconf
  progress(2,'提取音轨');audio_path=cache/(key+'.wav')
  result=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-nostdin','-v','error','-y','-i',str(cache/(key+'.source')),'-t','1801','-vn','-ac','1','-ar','44100','-c:a','pcm_s16le',str(audio_path)],capture_output=True,timeout=300,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  if result.returncode:raise ValueError('无法读取音轨，请上传含声音的 MP3、WAV、M4A、MP4 或 MOV 文件')
  with wave.open(str(audio_path),'rb') as wav:
   seconds=wav.getnframes()/wav.getframerate()
   if seconds>1800:raise ValueError('音视频最长支持 30 分钟，请分段上传')
   samples=np.frombuffer(wav.readframes(wav.getnframes()),dtype=np.int16).astype(np.float32)/32768
  torch.set_num_threads(2)
  if data.get('analyzeAudio'):
   from audio_separation import piano_input
   try:samples,needs_choice=piano_input(samples,44100,cache,key,data.get('audioChoice'),progress)
   except (ImportError,FileNotFoundError,RuntimeError) as error:
    if data.get('audioChoice')=='separate':raise ValueError('钢琴分离模型尚未就绪：'+str(error)) from error
    progress(5,'音轨检查模型尚未就绪，可选择直接转录或稍后处理',needsChoice=True);return
   if needs_choice:
    progress(5,'疑似含人声或其他乐器，请选择转录方式',needsChoice=True);return
  progress(6,'载入钢琴转录模型')
  vendor=ROOT/'.sites-runtime/transcription-vendor/transkun/pretrained'
  manager=moduleconf.parseFromFile(str(vendor/'2.0.conf'));model=manager['Model'].module.TransKun(conf=manager['Model'].config)
  weights=torch.load(vendor/'2.0.pt',map_location='cpu',weights_only=False);model.load_state_dict(weights.get('best_state_dict',weights.get('state_dict')),strict=True);model.eval()
  if model.fs!=44100:
   import soxr
   samples=soxr.resample(samples,44100,model.fs)
  original=model.transcribeFrames;count=0;segments=math.ceil((len(samples)/model.fs+16)/8)
  def frames(*args,**kwargs):
   nonlocal count
   checkpoint();result=original(*args,**kwargs);count+=1;progress(min(92,8+84*count/segments),f'转录片段 {count} / {segments}');return result
  model.transcribeFrames=frames
  with torch.inference_mode():notes=model.transcribe(torch.from_numpy(samples[:,None]),stepInSecond=8,segmentSizeInSecond=16,discardSecondHalf=False)
  from transkun.Data import writeMidi
  midi=writeMidi(notes)
  if not any(t.notes for t in midi.instruments):raise ValueError('没有识别到钢琴音符，请检查录音内容和音量')
  midi.write(str(cache/(key+'.mid')));progress(94,'生成钢琴双手谱')
  notation(midi,data['title'],cache/(key+'.transcribed.musicxml'),samples,model.fs);progress(100,'钢琴转录完成')
 except Exception as error:
  progress(0,'处理失败',error=str(error));raise

if __name__=='__main__':run(sys.argv[1])
