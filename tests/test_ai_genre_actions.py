import json
import unittest
from unittest.mock import Mock
from ai_workspace import fast_plan,parse_model_json
from library_classification import search_scores


class GenreActions(unittest.TestCase):
    def test_repertoire_requests_emit_search(self):
        for text in ('找个蓝调音乐','推荐一首爵士作品','帮我找民谣歌曲','find some blues music'):
            with self.subTest(text=text):
                plan=fast_plan({'messages':[{'role':'user','content':text}],'context':{}})
                self.assertEqual(plan['actions'],[{'type':'search','value':text}])

    def test_explanation_does_not_trigger_search(self):
        self.assertIsNone(fast_plan({'messages':[{'role':'user','content':'解释一下蓝调是什么'}],'context':{}}))

    def test_blues_title_matches_without_model(self):
        items=[{'id':'blues','title':'Blues in C'},{'id':'jazz','title':'Take Five'},{'id':'blue','title':'蓝色多瑙河'}]
        result=search_scores('找个蓝调音乐',items,request=Mock(side_effect=AssertionError('unneeded model')))
        self.assertEqual(result['ids'],['blues'])

    def test_gateway_escaped_actions_are_readable(self):
        plan={'reply':'查找蓝调','actions':[{'type':'search','value':'蓝调'}]}
        for text in (json.dumps(json.dumps(plan,ensure_ascii=False)),json.dumps(plan,ensure_ascii=False).replace('"','\\"')):
            self.assertEqual(parse_model_json(text),plan)


if __name__=='__main__':unittest.main()
