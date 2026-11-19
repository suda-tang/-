"""Noise-only postprocessing; preserve original VoxCPM recordings and manuscript."""
import json,subprocess,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FF=Path('C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe')
MODEL=ROOT/'.sites-runtime/voice-denoise/std.rnnn'
def main():
 tracks=json.loads((ROOT/'dist/narration/tour.json').read_text(encoding='utf-8'));result=[]
 for t in tracks:
  if t.get('role')!='mentor' or '.voxcpm.' not in t.get('url',''):result.append(t);continue
  source=ROOT/'dist'/t['url'].lstrip('/');source=Path(str(source).replace('.voxcpm.clean.','.voxcpm.'))
  target=source.with_name(source.stem+'.clean.m4a');tmp=target.with_suffix('.pending.m4a')
  subprocess.run([str(FF),'-v','error','-y','-i',str(source),'-af','aresample=48000,highpass=f=60,arnndn=m=.sites-runtime/voice-denoise/std.rnnn:mix=0.9,aresample=24000','-c:a','aac','-b:a','128k','-movflags','+faststart',str(tmp)],cwd=ROOT,check=True)
  subprocess.run([str(FF),'-v','error','-i',str(tmp),'-f','null','-'],check=True);tmp.replace(target)
  result.append({**t,'url':'/narration/'+target.name});print(target.name,flush=True)
 # Originals stay intact; publication is atomic and only happens after every output decodes.
 path=ROOT/'dist/narration/tour.json';backup=ROOT/'.sites-runtime/voice-denoise/tour-before-clean.json'
 if not backup.exists():backup.write_bytes(path.read_bytes())
 pending=path.with_suffix('.pending.json');pending.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8');pending.replace(path)
 (ROOT/'.sites-runtime/voice-denoise/processing.json').write_text(json.dumps({'model':'Xiph RNNoise std.rnnn','mix':0.9,'source':'https://github.com/richardpl/arnndn-models','sha256':hashlib.sha256(MODEL.read_bytes()).hexdigest(),'tracks':len(result)}),encoding='utf-8')
if __name__=='__main__':main()
