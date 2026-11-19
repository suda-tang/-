import unittest
from score_profiles import build

class TonalEvidenceTests(unittest.TestCase):
 def xml(self,key='',namespace=''):
  return f'<score-partwise{namespace}><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>2</divisions>{key}</attributes><note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration></note><note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>2</duration></note></measure></part></score-partwise>'
 def test_missing_signature_preserves_pitch_evidence(self):
  p=build(self.xml());self.assertEqual(p['keys'],[]);self.assertEqual(p['tonalEvidence']['signatureStatus'],'not-written');self.assertEqual(p['tonalEvidence']['pitchClassDurations'],[{'pitchClass':6,'quarterBeats':2.0}])
 def test_written_c_signature_is_not_missing(self):
  p=build(self.xml('<key><fifths>0</fifths><mode>minor</mode></key>'));self.assertEqual(p['keys'][0]['mode'],'minor');self.assertEqual(p['keys'][0]['fifths'],'0');self.assertEqual(p['tonalEvidence']['signatureStatus'],'written')
 def test_namespace_supported(self):
  p=build(self.xml(namespace=' xmlns="http://www.musicxml.org/ns/musicxml"'));self.assertEqual(p['tonalEvidence']['pitchClassDurations'][0]['pitchClass'],6)
 def test_no_pitched_notes_does_not_fabricate_key(self):
  p=build('<score-partwise><part id="D"><measure number="1"><note><unpitched/><duration>1</duration></note></measure></part></score-partwise>');self.assertEqual(p['keys'],[]);self.assertEqual(p['tonalEvidence']['pitchClassDurations'],[])
