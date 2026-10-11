import json
import unittest
from unittest.mock import patch
from ai_capabilities import arrangement_config, analysis_context
import ai_workspace


class CapabilitiesTest(unittest.TestCase):
    def test_custom_config(self):
        value = {'style': 'custom', 'programs': [40, 42], 'drums': False}
        self.assertEqual(arrangement_config(json.dumps(value)), value)
        self.assertEqual(json.loads(ai_workspace.action_value({'type':'configure_arrangement','value':value})), value)

    def test_invalid_configs(self):
        for value in [None, [], {'style':'custom','programs':[],'drums':False},
                      {'style':'custom','programs':[40,40],'drums':False},
                      {'style':'custom','programs':[999],'drums':False},
                      {'style':'custom','programs':[True],'drums':False},
                      {'style':'strings','programs':[40],'drums':False},
                      {'style':'strings','drums':'false'},
                      {'style':'strings','drums':False,'delete':True}]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                arrangement_config(value)

    def test_original_requires_drums(self):
        self.assertTrue(arrangement_config({'style':'original','drums':False})['drums'])

    def test_practice_does_not_cross_scores(self):
        context={'currentId':'a','practice':{'observations':8},'measure':3,'settings':{'tempo':80}}
        self.assertIsNone(analysis_context(context,'b')['practice'])
        self.assertEqual(analysis_context(context,'a')['practice']['observations'],8)

    def test_planner_receives_guidance_and_validates_action(self):
        class Response:
            def json_response(self, result, status=200):self.result=result
        target=Response()
        def model(messages,*args,**kwargs):
            self.assertIn('configure_arrangement',messages[0]['content'])
            self.assertIn('context.tasks',messages[0]['content'])
            return json.dumps({'reply':'设置小提琴和大提琴，不加鼓。','actions':[{'type':'configure_arrangement','value':{'style':'custom','programs':[40,42],'drums':False}}]})
        with patch.object(ai_workspace,'fast_plan',return_value=None), patch.object(ai_workspace,'post_model_stream',side_effect=model):
            ai_workspace.plan_data({'messages':[{'role':'user','content':'自选小提琴和大提琴，不加鼓'}],'context':{'scores':[]}},target)
        self.assertEqual(target.result['actions'][0]['type'],'configure_arrangement')


if __name__ == '__main__':unittest.main()
