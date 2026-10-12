import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,MagicMock
import score_classroom as c

class ClassroomTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.ident='a'*64
  self.profile={'id':self.ident,'title':'测试曲','measureCount':8,'measures':[{'measure':i} for i in range(1,9)],'issues':[],'limits':[]}
  self.xml='<score-partwise><part id="P1"><measure number="1"><attributes><divisions>2</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type><staff>1</staff></note></measure></part></score-partwise>'
  (self.root/(self.ident+'.json')).write_text(json.dumps({'xml':self.xml}),encoding='utf-8')
  self.pool=MagicMock();self.patches=[patch.object(c,'CACHE',self.root),patch.object(c,'STORE',self.root/'lessons'),patch.object(c,'get_profile',return_value=self.profile),patch.object(c,'POOL',self.pool),patch.object(c,'ACTIVE',set())]
  for p in self.patches:p.start()
 def tearDown(self):
  for p in reversed(self.patches):p.stop()
  self.tmp.cleanup()
 def test_same_request_reuses_queued_job(self):
  a=c.create({'scoreId':self.ident,'start':1,'end':4});b=c.create({'scoreId':self.ident,'start':1,'end':4})
  self.assertEqual(a['id'],b['id']);self.assertEqual(self.pool.submit.call_count,1)
 def test_whole_work_keeps_class_duration_and_teaching_mode(self):
  self.profile['measureCount']=100
  a=c.create({'scoreId':self.ident,'scope':'whole','duration':45,'mode':'piano','goal':'高中音乐课堂教学','features':['slides','quiz','interactive','pbl']})
  self.assertEqual((a['start'],a['end']),(1,100));self.assertEqual(a['duration'],45);self.assertEqual(a['mode'],'classroom')
  self.assertIn('pbl',a['features'])
 def test_school_stages_have_separate_cache(self):
  jobs=[c.create({'scoreId':self.ident,'scope':'whole','schoolStage':stage,'useReferences':False}) for stage in ('primary','junior','senior')]
  self.assertEqual(len(set(j['id'] for j in jobs)),3)
  self.assertEqual(jobs[0]['schoolStage'],'primary')
  self.assertEqual(jobs[0]['level'],'小学三年级')

 def test_progressive_content_is_upgraded_without_duplicate_pages(self):
  job=c.create({'scoreId':self.ident,'useReferences':False})
  proc=MagicMock();proc.stderr=[];proc.wait.return_value=0
  events=[{'type':'outline','outlines':[{'id':'o1'}],'lessonPlan':{}},{'type':'scene','scene':{'id':'s1','phase':'content','actions':[]}},{'type':'scene','scene':{'id':'s1','phase':'ready','actions':[{'type':'speech','text':'讲解'}]}},{'type':'plan','lessonPlan':{'objectives':['听辨']}},{'type':'complete','progress':100}]
  proc.stdout=[json.dumps(e)+'\n' for e in events]
  process=MagicMock();process.__enter__.return_value=proc
  with patch.object(c.subprocess,'Popen',return_value=process):c.generate(job['id'])
  result=c.read(job['id']);self.assertEqual(result['status'],'complete');self.assertEqual(len(result['scenes']),1);self.assertEqual(result['scenes'][0]['phase'],'ready');self.assertEqual(result['lessonPlan']['objectives'],['听辨'])

 def test_range_rejected(self):
  for start,end in [(0,4),(4,2),(1,9)]:
   with self.assertRaises(ValueError):c.create({'scoreId':self.ident,'start':start,'end':end})
 def test_written_duration_evidence(self):
  a=c.create({'scoreId':self.ident,'start':1,'end':4});e=json.loads((c.STORE/(a['id']+'.input.json')).read_text(encoding='utf-8'))['evidence']
  self.assertEqual(e['notes'][0]['duration'],1);self.assertEqual(e['notes'][0]['writtenType'],'quarter');self.assertEqual(e['notes'][0]['staff'],'1')
 def test_complete_cache_and_source_invalidation(self):
  a=c.create({'scoreId':self.ident,'end':4});a['status']='complete';c.write_json(c.STORE/(a['id']+'.json'),a);c.ACTIVE.clear()
  self.assertEqual(c.create({'scoreId':self.ident,'end':4})['status'],'complete');self.assertEqual(self.pool.submit.call_count,1)
  (self.root/(self.ident+'.json')).write_text(json.dumps({'xml':self.xml+'\n'}),encoding='utf-8')
  self.assertNotEqual(c.create({'scoreId':self.ident,'end':4})['id'],a['id'])
 def test_interrupted_visible_in_task_center(self):
  c.create({'scoreId':self.ident,'end':4});c.ACTIVE.clear();tasks=c.tasks()
  self.assertEqual(tasks[0]['status'],'failed');self.assertIn('重启',tasks[0]['stage'])

if __name__=='__main__':unittest.main()
