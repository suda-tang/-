import base64,copy,hashlib,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,MagicMock
import classroom_runtime as runtime
import classroom_materials as materials

class RuntimeTests(unittest.TestCase):
 def setUp(self):self.course={'start':1,'end':8,'status':'complete','scenes':[{'id':'s1','content':{'canvas':{'elements':[{'id':'t1','type':'text','content':'原文'}]}},'actions':[{'type':'speech','text':'原讲解','audioId':'old'}]}]}
 def test_protocol_and_range(self):
  self.assertEqual(len(runtime.ACTION_TYPES),32)
  self.assertEqual(runtime.validate_actions([{'type':'music-listen','startMeasure':2,'endMeasure':4}],self.course)[0]['seconds'],0)
  for action in ({'type':'eval'},{'type':'music-seek','startMeasure':99},{'type':'music-tempo','bpm':0},{'type':'scene-jump','index':1}):
   with self.assertRaises(ValueError):runtime.validate_actions([action],self.course)
 def test_revision_and_audio_invalidation(self):
  runtime.edit_scene(self.course,{'sceneId':'s1','revision':0,'change':{'kind':'speech','cursor':0,'text':'新讲解'}})
  self.assertNotIn('audioId',self.course['scenes'][0]['actions'][0]);self.assertTrue(self.course['scenes'][0]['actions'][0]['audioInvalidated'])
  self.assertEqual(self.course['revisions'][0]['scene']['actions'][0]['text'],'原讲解')
  with self.assertRaises(ValueError):runtime.edit_scene(self.course,{'sceneId':'s1','revision':0})
 def test_safe_text_and_observation_binding(self):
  runtime.edit_scene(self.course,{'sceneId':'s1','revision':0,'change':{'kind':'element-text','elementId':'t1','text':'<script>bad</script>'}})
  self.assertNotIn('<script>',self.course['scenes'][0]['content']['canvas']['elements'][0]['content'])
  with self.assertRaises(ValueError):runtime.append_observation(self.course,{'sceneId':'other','value':'wrong'})
  runtime.append_observation(self.course,{'sceneId':'s1','kind':'quiz','value':{'answer':'A'}})
  self.assertEqual(self.course['observations'][0]['value']['answer'],'A')

class MaterialsTests(unittest.TestCase):
 def test_resumable_upload_parse_reuse_and_score_binding(self):
  with tempfile.TemporaryDirectory() as tmp,patch.object(materials,'ROOT',Path(tmp)),patch.object(materials,'POOL',MagicMock()) as pool:
   content='教案：先聆听再比较，不要求会弹钢琴。'.encode();score='a'*64
   data={'scoreId':score,'name':'教案.txt','size':len(content),'digest':hashlib.sha256(content).hexdigest(),'offset':0,'kind':'lesson-plan','chunk':base64.b64encode(content[:8]).decode()}
   item=materials.upload(data);self.assertEqual(item['offset'],8)
   self.assertEqual(materials.upload(data)['offset'],8)
   data.update(offset=8,chunk=base64.b64encode(content[8:]).decode());item=materials.upload(data)
   self.assertEqual(item['status'],'queued');self.assertEqual(pool.submit.call_count,1)
   materials.parse(item['id']);parsed=materials.read(item['id']);self.assertEqual(parsed['status'],'ready')
   self.assertIn('聆听',materials.selected(score,[item['id']])[0]['text'])
   with self.assertRaises(ValueError):materials.selected('b'*64,[item['id']])
   self.assertEqual(materials.upload(data)['status'],'ready');self.assertEqual(pool.submit.call_count,1)
   self.assertNotIn('text',materials.list_for(score)[0]);self.assertNotIn('path',materials.list_for(score)[0])
 def test_invalid_file_and_digest(self):
  with self.assertRaises(ValueError):materials.upload({'scoreId':'a'*64,'name':'bad.exe'})

if __name__=='__main__':unittest.main()
