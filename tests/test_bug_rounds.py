import unittest
from ai_direct_controls import direct_controls
from score_profiles import build

class BugRounds(unittest.TestCase):
    def test_passage_keeps_both_endpoints(self):
        context={'currentId':'score','measureCount':20}
        result=direct_controls('练第4到第8小节',context)
        self.assertEqual(result['actions'],[{'type':'set_range','value':{'from':4,'to':8,'practice':True}}])
        self.assertIsNone(direct_controls('练第8到第4小节',context))
        self.assertIsNone(direct_controls('练第4到第80小节',context))

    def test_report_stays_on_current_score(self):
        result=direct_controls('生成曲目报告',{'currentId':'chosen'})
        self.assertEqual(result['actions'],[{'type':'score_report','value':''}])

    def test_duplicate_part_names_are_distinct(self):
        xml='<score-partwise><part-list>'+''.join(f'<score-part id="P{i}"><part-name>钢琴</part-name></score-part>' for i in range(3))+'</part-list>'+''.join(f'<part id="P{i}"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part>' for i in range(3))+'</score-partwise>'
        result=build(xml)
        self.assertEqual(len({part['name'] for part in result['parts']}),3)

if __name__=='__main__':unittest.main()
