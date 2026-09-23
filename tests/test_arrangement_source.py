import json,tempfile,unittest
from pathlib import Path
from arrangement_source import original_xml

class SourceTests(unittest.TestCase):
 def test_missing_source_never_flattens_piano(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaises(ValueError):original_xml({'score':{'events':[]}},Path(d)/'x.input.json',d)
 def test_legacy_exact_event_match_recovers_original(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'analysis').mkdir();(root/'score-cache').mkdir()
   score={'events':[{'beat':0,'notes':[{'part':'left','midi':48}]}]}
   (root/'analysis'/'abc.inspect.json').write_text(json.dumps({'score':score}))
   (root/'score-cache'/'abc.json').write_text(json.dumps({'xml':'original two staves'}))
   self.assertEqual(original_xml({'score':score},root/'x.input.json',root),'original two staves')
