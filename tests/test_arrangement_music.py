import unittest
from arrangement_music import meter_bars,warp,model_score,drum_pattern,voice_leading,inferred_bars,PROGRAMS,PRESETS
from arrangement_service import validate

def xml(beats='3',unit=4):
 return f'<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>{beats}</beats><beat-type>{unit}</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure><measure number="2"><note><rest/><duration>4</duration></note></measure></part></score-partwise>'

class ArrangementMusicTest(unittest.TestCase):
 def test_meters_and_round_trip(self):
  for beats,unit,length in [(' 4 ',4,4),('3',4,3),('6',8,3),('2',2,4),('3+2',8,2.5)]:
   bars=meter_bars(xml(beats,unit));self.assertEqual(bars[0]['length'],length)
   for beat in (0,length/2,length,length*1.7,length*2):self.assertAlmostEqual(warp(warp(beat,bars,True),bars),beat)
 def test_drums_do_not_mirror_piano_onsets(self):
  bars=meter_bars(xml('4'));sparse={'events':[{'beat':0,'notes':[{'midi':60,'duration':8}]}]}
  dense={'events':[{'beat':i/4,'notes':[{'midi':60,'duration':.25}]} for i in range(32)]}
  self.assertEqual(drum_pattern(sparse,bars),drum_pattern(dense,bars))
  hits=drum_pattern(sparse,bars)
  self.assertEqual([n['beat'] for n in hits if n['midi']==38],[1,3,5,7])
 def test_compound_meter(self):
  bars=meter_bars(xml('6',8));score={'events':[{'beat':0,'notes':[{'midi':60,'duration':6}]}]}
  self.assertEqual([n['beat'] for n in drum_pattern(score,bars) if n['midi']==38],[1.5,4.5])
 def test_single_voice_no_overlaps(self):
  bars=meter_bars(xml('3'));score={'events':[{'beat':0,'notes':[{'midi':n,'duration':6} for n in (48,60,64,67)]}]}
  notes=voice_leading(score,bars,[{'beat':i/4,'midi':48+i%40} for i in range(24)],40)
  self.assertTrue(notes)
  for a,b in zip(notes,notes[1:]):self.assertLessEqual(a['beat']+a['duration'],b['beat'])
  self.assertTrue(all(n['midi']%12 in (0,4,7) for n in notes))
 def test_all_presets_use_supported_programs(self):
  for values in PRESETS.values():self.assertTrue(all(p in PROGRAMS for p in values))
  self.assertEqual(len(PROGRAMS),34)
  self.assertEqual(validate({'style':'custom','programs':[40,42]})['programs'],[40,42])
  with self.assertRaises(ValueError):validate({'style':'custom','programs':[73]})
 def test_harmony_changes_within_bar_and_does_not_invent_triad(self):
  bars=meter_bars(xml('4'))[:1]
  score={'events':[{'beat':0,'notes':[{'midi':p,'duration':2} for p in (48,60,64,67)]},{'beat':2,'notes':[{'midi':p,'duration':2} for p in (49,61,65,68)]}]}
  notes=voice_leading(score,bars,[],41)
  self.assertTrue(notes)
  for n in notes:
   self.assertIn(n['midi']%12,(0,4,7) if n['beat']<2 else (1,5,8))
   if n['beat']<2:self.assertLessEqual(n['beat']+n['duration'],2)
  other=voice_leading(score,bars,[],40,notes)
  for a in notes:
   for b in other:
    if a['beat']<b['beat']+b['duration'] and b['beat']<a['beat']+a['duration']:
     self.assertGreaterEqual(abs(a['midi']-b['midi']),3)
 def test_duple_fill_stays_on_sixteenth_grid_without_tuned_toms(self):
  bars=[{'start':i*4,'length':4,'beats':4,'unit':4,'pickup':False} for i in range(8)]
  hits=drum_pattern({'events':[{'beat':0,'notes':[{'midi':60,'duration':32}]}]},bars)
  self.assertTrue(all(abs(n['beat']*4-round(n['beat']*4))<1e-6 for n in hits))
  self.assertFalse(any(n['midi'] in (43,47,50) for n in hits))
  self.assertGreater(len([n for n in hits if 31<=n['beat']<32]),len([n for n in hits if 3<=n['beat']<4]))
 def test_legacy_jobs_without_meter_bars_get_valid_bars(self):
  score={'totalBeats':6,'measures':2,'events':[{'beat':0,'measure':1,'offset':0,'notes':[{'duration':1}]},{'beat':3,'measure':2,'offset':0,'notes':[{'duration':1}]}]}
  bars=inferred_bars(score)
  self.assertEqual([(b['start'],b['length']) for b in bars],[(0.0,3.0),(3.0,3.0)])

if __name__=='__main__':unittest.main()
