import unittest
from ai_workspace import missing_execution, fast_plan

class MissingExecutionTests(unittest.TestCase):
    def test_promised_search_requires_actions(self):
        for reply in ('好的，我来帮您查一下曲库里有没有蓝调风格的曲子。正在检索全库。', '我来搜索蓝调音乐', '已经切换到简谱', '马上播放这首作品'):
            with self.subTest(reply=reply):
                self.assertTrue(missing_execution({'reply':reply,'actions':[]}))
    def test_advice_and_permission_do_not_execute(self):
        for reply in ('建议先听低音声部。', '我无法播放这首曲子。', '要不要联网搜索？', '我来介绍一下蓝调的特点。', '这次操作尚未执行。'):
            self.assertFalse(missing_execution({'reply':reply,'actions':[]}))
    def test_existing_actions_are_not_repeated(self):
        self.assertFalse(missing_execution({'reply':'马上播放','actions':[{'type':'play'}]}))
    def test_recover_search_from_original_request(self):
        plan=fast_plan({'messages':[{'role':'user','content':'找个蓝调音乐'}],'context':{}})
        self.assertEqual(plan['actions'],[{'type':'search','value':'找个蓝调音乐'}])
