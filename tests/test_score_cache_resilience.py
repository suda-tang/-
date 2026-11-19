import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import server

class CacheResilienceTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.cache=Path(self.tmp.name);p=patch.object(server,'CACHE_DIR',self.cache);p.start();self.addCleanup(p.stop)
  self.digest='a'*64
 def write(self,value,suffix='.json'):
  (self.cache/(self.digest+suffix)).write_text(json.dumps(value),encoding='utf-8')
 def test_non_object_cache_is_unavailable_not_a_crash(self):
  for value in (None,[],42,'text'):
   self.write(value);self.assertIsNone(server.read_cached_score(self.digest,repair=False))
 def test_invalid_embedded_metadata_does_not_hide_valid_score(self):
  for metadata in (None,[],42,'text'):
   self.write({'xml':'<?xml version="1.0"?><score-partwise/>','metadata':metadata})
   self.assertEqual(server.read_cached_score(self.digest,repair=False)['metadata'],{})
 def test_invalid_sidecar_does_not_hide_valid_score(self):
  self.write({'xml':'<?xml version="1.0"?><score-partwise/>','metadata':{'title':'测试曲谱'}})
  for metadata in (None,[],42,'text'):
   self.write(metadata,'.metadata.json')
   self.assertEqual(server.read_cached_score(self.digest,repair=False)['metadata']['title'],'测试曲谱')
 def test_sidecar_still_overrides_older_embedded_title(self):
  self.write({'xml':'<?xml version="1.0"?><score-partwise/>','metadata':{'title':'旧标题'}})
  self.write({'title':'新标题'},'.metadata.json')
  self.assertEqual(server.read_cached_score(self.digest,repair=False)['metadata']['title'],'新标题')
