import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from ai_workspace import fast_plan
from music_index import resolve_chord


class RepertoireTests(unittest.TestCase):
    def setUp(self):
        self.context={'scores':[{'id':'bach','title':'前奏曲 - 巴赫','ready':True},
                                {'id':'vivaldi','title':'四季 - 维瓦尔第','ready':True},
                                {'id':'offenbach','title':'序曲 - 奥芬巴赫','ready':True}],
                      'currentId':'bach'}

    def test_constraints_before_external_title(self):
        result=fast_plan({'context':self.context,'messages':[{'role':'user','content':'帮我找一首巴洛克时期的德国作曲家的音乐，找出这个曲子的所有减七和弦。'}]})
        self.assertEqual(result['actions'][0]['type'],'choose_scores')
        self.assertEqual([x['id'] for x in result['actions'][0]['value']],['bach'])

    def test_ordinal_requires_real_candidates(self):
        messages=[{'role':'user','content':'帮我找一首巴洛克时期的德国作曲家的音乐，找出所有减七和弦'},
                  {'role':'assistant','content':'曲谱候选：[{"id":"bach","title":"前奏曲 - 巴赫"}]'},
                  {'role':'user','content':'打开第一首，先不要播放'}]
        result=fast_plan({'context':self.context,'messages':messages})
        self.assertEqual([x['type'] for x in result['actions']],['open','chords'])
        self.assertIn('dim7',result['actions'][1]['value'])

    def test_quality_not_substring(self):
        self.assertEqual(resolve_chord('半减七和弦'),'half-dim7')
        self.assertEqual(resolve_chord('减七和弦'),'dim7')
        result=fast_plan({'context':self.context,'messages':[{'role':'user','content':'找出这首曲子所有减七和弦，给出小节和拍的位置'}]})
        self.assertEqual(result['actions'][0]['type'],'chords')
        self.assertIn('dim7',result['actions'][0]['value'])


if __name__=='__main__':unittest.main()
