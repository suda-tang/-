"""Routing regressions reproduced in the live musician browser session."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ai_workspace as ai
from ai_direct_controls import direct_controls


class MusicianRouting(unittest.TestCase):
    def test_direct_compound_controls(self):
        context={'currentId':'test','playing':True,'parts':[{'value':'P1','name':'钢琴'}]}
        plan=direct_controls('切换到简谱，只听钢琴，先不要播放',context)
        self.assertEqual([a['type'] for a in plan['actions']],['view','solo','pause'])
        self.assertIsNone(direct_controls('只听钢琴，然后把第2小节改成三拍子',context))
        self.assertIsNone(direct_controls('不要切换到简谱',context))
        self.assertEqual(direct_controls('先暂停，保持当前位置',context)['actions'],[{'type':'pause','value':''}])
        self.assertEqual(direct_controls('停止播放，回到开头，切回电子谱',context)['actions'],[{'type':'stop','value':''},{'type':'view','value':'engraved'}])
        self.assertEqual(direct_controls('换成音轨视图，我想看看每个乐器',context)['actions'],[{'type':'view','value':'daw'}])
        self.assertIsNone(direct_controls('换成音轨视图，然后删除钢琴声部',context))

    def test_current_score_is_not_library_search(self):
        for text in ('这首曲子有哪些乐器？原谱速度是多少？', '从第37小节开始播放钢琴', '先暂停，保持当前位置'):
            with self.subTest(text=text):
                self.assertIsNone(ai.plan_theory_search(text, [], {}, True))

    def test_explanation_and_practice_are_not_transport(self):
        for text in ('刚才说的属七和弦是什么意思？用C大调给我一个例子', '为钢琴第1到4小节制定一个慢练计划'):
            with self.subTest(text=text):
                self.assertIsNone(ai.fast_plan({'messages': [{'role': 'user', 'content': text}], 'context': {}}))

    def test_explicit_web_search_only_lists_candidates(self):
        result = ai.fast_plan({'messages': [{'role': 'user', 'content': '联网找一下《卡农》的钢琴谱，先展示候选链接，不要导入'}], 'context': {}})
        self.assertEqual(result['actions'], [{'type': 'web_search', 'value': '卡农 钢琴谱'}])


if __name__ == '__main__':
    unittest.main()
