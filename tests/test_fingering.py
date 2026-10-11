import copy
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('piano_fingering', ROOT/'scripts/piano-fingering.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

def notes(pitches, hand='right', chord=False):
    return [dict(id=str(i),midi=p,beat=i//3 if chord else i,duration=1,measure=i//8+1,hand=hand,finger=0) for i,p in enumerate(pitches)]

class FingeringTests(unittest.TestCase):
    def test_scale_and_no_musical_mutation(self):
        source={'size':'M','notes':notes([60,62,64,65,67,69,71,72])}
        original=copy.deepcopy(source)
        result=worker.generate(source)
        self.assertEqual(list(result['fingers'].values()), [1,2,3,1,2,3,4,5])
        self.assertEqual(source,original)

    def test_chords_both_hands(self):
        for hand in ('left','right'):
            result=worker.generate({'size':'M','notes':notes([60,64,67,62,65,69,60,64,67],hand,True)})
            self.assertEqual(len(result['fingers']),9)
            for i in (0,3,6):
                fingers=[result['fingers'][str(j)] for j in range(i,i+3)]
                self.assertEqual(len(set(fingers)),3)
                self.assertEqual(fingers, sorted(fingers,reverse=hand=='left'))

    def test_fixed_anchors_and_short_tail(self):
        for length in (1,2,3,8,11):
            sequence=notes(([60,62,64,65,67,69,71,72,71,69,67])[:length])
            sequence[0]['finger']=1
            result=worker.generate({'size':'M','notes':sequence})
            self.assertEqual(result['fingers']['0'],1)
            self.assertEqual(len(result['fingers']),length)
            self.assertTrue(all(1<=f<=5 for f in result['fingers'].values()))

    def test_duplicate_key_and_impossible_chord(self):
        sequence=notes([60,60,64],chord=True)
        result=worker.generate({'size':'M','notes':sequence})
        self.assertEqual(result['fingers']['0'],result['fingers']['1'])
        sequence=notes([60,62,64,65,67,69])
        for n in sequence:n['beat']=0
        result=worker.generate({'size':'M','notes':sequence})
        self.assertFalse(result['fingers'])
        self.assertEqual(len(result['review']),1)

    def test_saved_correction_is_durable(self):
        import fingering_service as service
        previous=service.CACHE
        try:
            with tempfile.TemporaryDirectory() as folder:
                service.CACHE=Path(folder)
                payload={'size':'M','notes':notes([60,62]),'fingers':{'0':1,'1':3},'manual':['1']}
                service.profile(payload)
                loaded=service.profile({'notes':payload['notes'],'size':'M'})
                self.assertEqual(loaded['fingers'],payload['fingers'])
                self.assertEqual(loaded['manual'],['1'])
                self.assertNotEqual(service.profile_key(payload),service.profile_key({**payload,'size':'S'}))
        finally:service.CACHE=previous

if __name__=='__main__': unittest.main()
