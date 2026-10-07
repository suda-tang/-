import json,tempfile,unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import score_profiles as p

def note(step='C',duration=1,staff=1):return f'<note dynamics="65"><pitch><step>{step}</step><octave>4</octave></pitch><duration>{duration}</duration><staff>{staff}</staff></note>'
def fixture(body,time='3',parts=1):
 listing=''.join(f'<score-part id="P{i}"><part-name>Part {i}</part-name></score-part>' for i in range(1,parts+1))
 material=''.join(f'<part id="P{i}"><measure number="1"><attributes><divisions>1</divisions><time><beats>{time}</beats><beat-type>4</beat-type></time></attributes>{body}</measure></part>' for i in range(1,parts+1))
 return '<score-partwise><work><work-title>Test</work-title></work><part-list>'+listing+'</part-list>'+material+'</score-partwise>'
class Tests(unittest.TestCase):
 def test_all_parts_and_three_four(self):
  result=p.build(fixture(note()*3,parts=2))
  self.assertEqual(len(result['parts']),2);self.assertEqual(result['noteCount'],6);self.assertEqual(result['onsetGroups'],3);self.assertEqual(result['issues'],[]);self.assertEqual(result['timeSignatures'][0]['value'],'3/4');self.assertEqual(result['writtenDynamics'],6)
 def test_backup_voices_do_not_sum(self):
  result=p.build(fixture(note()*3+'<backup><duration>3</duration></backup>'+note('G',3,2)))
  self.assertEqual(result['issues'],[]);self.assertEqual(result['parts'][0]['staves'],['1','2'])
 def test_overfull_is_evidence_not_edit(self):
  result=p.build(fixture(note()*4));self.assertEqual(result['issues'][0]['code'],'overfull');self.assertEqual(result['noteCount'],4)
 def test_cache_invalidation_on_user_rename(self):
  old=(p.CACHE,p.STORE)
  with tempfile.TemporaryDirectory() as folder:
   try:
    p.CACHE=Path(folder)/'scores';p.STORE=Path(folder)/'profiles';p.CACHE.mkdir();ident='a'*64
    (p.CACHE/(ident+'.json')).write_text(json.dumps({'xml':fixture(note()*3)}),encoding='utf-8')
    self.assertFalse(p.get_profile(ident)['cached']);self.assertTrue(p.get_profile(ident)['cached'])
    (p.CACHE/(ident+'.metadata.json')).write_text(json.dumps({'userTitle':'Renamed'}),encoding='utf-8')
    updated=p.get_profile(ident);self.assertFalse(updated['cached']);self.assertEqual(updated['title'],'Renamed')
   finally:p.CACHE,p.STORE=old
class AnalysisCacheTests(unittest.TestCase):
 def test_model_report_cached_and_practice_invalidates(self):
  import ai_workspace as a
  from unittest.mock import patch
  import io
  class Handler:
   def __init__(self):self.wfile=io.BytesIO()
   def send_response(self,*args):pass
   def send_header(self,*args):pass
   def end_headers(self):pass
  class Response:
   def __enter__(self):return self
   def __exit__(self,*args):pass
   def raise_for_status(self):pass
   def iter_lines(self):
    yield b'data: '+json.dumps({'choices':[{'delta':{'content':'Evidence-based advice'}}]}).encode()
    yield b'data: [DONE]'
  plan={'analysis':True,'question':'Practice plan','score':{'id':'a'*64,'title':'Test'},'evidence':{'version':1,'generatedAt':1,'cached':False,'parts':[]}}
  with tempfile.TemporaryDirectory() as folder,patch.object(a,'ROOT',Path(folder)),patch.object(a,'fast_plan',return_value=plan),patch.object(a.requests,'post',return_value=Response()) as model:
   h=Handler();a.stream_result(h,{'context':{}});self.assertEqual(model.call_count,1)
   plan['evidence']['cached']=True
   h=Handler();a.stream_result(h,{'context':{}});self.assertEqual(model.call_count,1);self.assertIn(b'Evidence-based advice',h.wfile.getvalue())
   a.stream_result(Handler(),{'context':{'practice':{'observations':3}}});self.assertEqual(model.call_count,2)

if __name__=='__main__':unittest.main()
