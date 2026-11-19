import unittest
from unittest.mock import Mock
from score_work_titles import numbered_title_matches
from ai_workspace import fast_plan
from library_classification import search_scores
class NumberedWorks(unittest.TestCase):
    def setUp(self):
        self.items=[{'id':'n9','title':'Symphony No.9 · Mov.4 - 贝多芬','ready':True},{'id':'n94','title':'Symphony No.94 - 海顿','ready':True},{'id':'d9','title':'Symphony No.9 - 德沃夏克','ready':True}]
    def test_number_boundaries(self):
        self.assertTrue(numbered_title_matches('找一下第九交响曲',self.items[0]['title']))
        self.assertFalse(numbered_title_matches('找一下第九交响曲',self.items[1]['title']))
    def test_composer_is_retained(self):
        self.assertFalse(numbered_title_matches('贝多芬第九交响曲',self.items[2]['title']))
    def test_fast_plan_returns_actual_versions(self):
        result=fast_plan({'messages':[{'role':'user','content':'找一下第九交响曲'}],'context':{'scores':self.items}})
        self.assertEqual(result['actions'][0]['type'],'choose_scores')
    def test_search_never_needs_model(self):
        result=search_scores('找一下第九交响曲',self.items,request=Mock(side_effect=AssertionError('unneeded model')))
        self.assertEqual(set(result['ids']),{'n9','d9'})
