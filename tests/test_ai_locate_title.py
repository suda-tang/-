import unittest
from unittest.mock import patch
from ai_workspace import plan_locate

class LocateTitleTest(unittest.TestCase):
    def test_book_title_brackets_do_not_match_every_request(self):
        items=[{'id':'wrong','title':'《情歌王2024》.mp3'}, {'id':'right','title':'知足'}]
        with patch('ai_catalog.locate',return_value={'measure':12,'label':'通鼓'}) as locate:
            result=plan_locate('通鼓',True,'播放《知足》里通鼓最早出现的地方',items,{'currentId':'right'})
        self.assertEqual(locate.call_args.args[0]['id'],'right')
        self.assertFalse(any(a['type']=='open' for a in result['actions']))
    def test_current_score_used_for_unnamed_followup(self):
        items=[{'id':'wrong','title':'《情歌王2024》.mp3'}, {'id':'right','title':'知足'}]
        with patch('ai_catalog.locate',return_value={'measure':12,'label':'鼓组'}) as locate:
            plan_locate('鼓组',False,'鼓组什么时候进来',items,{'currentId':'right'})
        self.assertEqual(locate.call_args.args[0]['id'],'right')
