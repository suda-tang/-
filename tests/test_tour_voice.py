import json,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
import tour_voice as v

class VoiceFallbackTests(unittest.TestCase):
 def test_circuit_uses_cached_file_and_marks_provider(self):
  with tempfile.TemporaryDirectory() as folder,patch.object(v,'ROOT',Path(folder)),patch.object(v,'EDGE_RETRY_AT',time.time()+600):
   ident=v.key('测试备用朗读')
   def fake(text,target,locale):target.write_bytes(b'ID3'+b'0'*2000)
   with patch.object(v,'fallback',side_effect=fake) as fallback:
    v.generate('测试备用朗读',ident)
   fallback.assert_called_once()
   self.assertTrue((v.ROOT/(ident+'.mp3')).exists())
   self.assertEqual(json.loads((v.ROOT/(ident+'.json')).read_text())['provider'],'fallback')
 def test_failure_cleans_partial_audio(self):
  with tempfile.TemporaryDirectory() as folder,patch.object(v,'ROOT',Path(folder)),patch.object(v,'EDGE_RETRY_AT',time.time()+600):
   ident=v.key('失败检查')
   def fail(text,target,locale):target.write_bytes(b'partial');raise RuntimeError('测试连接失败')
   with patch.object(v,'fallback',side_effect=fail):v.generate('失败检查',ident)
   self.assertFalse((v.ROOT/(ident+'.tmp')).exists());self.assertFalse((v.ROOT/(ident+'.mp3')).exists())
   self.assertIn('测试连接失败',v.ERRORS.pop(ident)[1])

if __name__=='__main__':unittest.main()
