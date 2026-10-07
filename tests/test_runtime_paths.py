import os, unittest
from pathlib import Path
from unittest.mock import patch
from scripts.runtime_location import cosyvoice_runtime

class RuntimePathTests(unittest.TestCase):
 def test_explicit_model_location(self):
  with patch.dict(os.environ,{'PIANO_COSY_RUNTIME':'custom-runtime'}):
   self.assertEqual(cosyvoice_runtime(),Path('custom-runtime'))
 def test_fresh_download_targets_project(self):
  with patch.dict(os.environ,{},clear=True):
   self.assertEqual(cosyvoice_runtime(prefer_local=True),Path(__file__).resolve().parents[1]/'.sites-runtime/cosyvoice')

if __name__=='__main__': unittest.main()
