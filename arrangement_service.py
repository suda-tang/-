import hashlib,json,subprocess,time,os
from pathlib import Path
from storage import write_json
from arrangement_music import PRESETS,PROGRAMS,meter_bars
ROOT=Path(__file__).resolve().parent;CACHE=ROOT/'.sites-runtime/arrangements'
def validate(params):
 if not isinstance(params,dict) or params.get('style','original') not in (*PRESETS,'custom'):raise ValueError('请选择支持的编制')
 if not isinstance(params.get('drums',False),bool):raise ValueError('鼓伴奏参数无效')
 result={'style':params.get('style','original'),'drums':params.get('drums',False)}
 if result['style']=='custom':
  selected=params.get('programs',[])
  if not isinstance(selected,list) or not 1<=len(selected)<=8 or any(type(p)!=int or p not in PROGRAMS for p in selected):raise ValueError('请从模型支持的乐器中选择 1–8 个声部')
  result['programs']=list(dict.fromkeys(selected))
 if result=={'style':'original','drums':False}:raise ValueError('请选择配器或鼓伴奏')
 return result
def generate(digest,params,progress,server):
 import background_jobs
 params=validate(params);cached=server.read_cached_score(digest)
 if not cached or not cached.get('xml'):raise ValueError('请先完成识谱')
 bars=meter_bars(cached['xml'])
 key=hashlib.sha256(json.dumps([digest,cached['xml'],params,'neural-v12'],sort_keys=True).encode()).hexdigest();CACHE.mkdir(exist_ok=True)
 output=CACHE/(key+'.json');xml=CACHE/(key+'.musicxml');midi=CACHE/(key+'.mid')
 if output.exists() and xml.exists() and midi.exists():return {'key':key,'digest':digest,'cached':True}
 progress(1,'准备原谱');score=background_jobs.inspect(digest,xml=cached['xml'])['score'];request=CACHE/(key+'.input.json')
 write_json(request,{'score':score,'bars':bars,'xml':cached['xml'],'params':params,'title':background_jobs.score_title(digest)})
 with (CACHE/(key+'.log')).open('w',encoding='utf-8') as log:
  proc=subprocess.Popen([str(ROOT/'.sites-runtime/performance-env/Scripts/python.exe'),str(ROOT/'scripts/generate-arrangement.py'),str(request),str(output)],stdout=log,stderr=subprocess.STDOUT,cwd=ROOT,creationflags=(subprocess.CREATE_NO_WINDOW|subprocess.BELOW_NORMAL_PRIORITY_CLASS) if os.name=='nt' else 0)
  started=time.monotonic()
  while proc.poll() is None:
   if time.monotonic()-started>3600:proc.kill();proc.wait();raise TimeoutError('配器生成超时，原谱已保留')
   try:
    status=json.loads(output.with_suffix('.progress.json').read_text());progress(status['progress'],status['detail'])
   except (OSError,ValueError,KeyError):pass
   time.sleep(1)
  if proc.returncode:raise RuntimeError('配器模型生成失败，详情保存在 '+key[:8]+'.log')
 if not all(p.exists() for p in (output,xml,midi)):raise RuntimeError('生成文件不完整')
 write_json(CACHE/(key+'.manifest.json'),{'digest':digest,'params':params,'key':key})
 return {'key':key,'digest':digest,'cached':False}
