import json
import unittest
from unittest.mock import patch
import ai_workspace
from practice_plan import validate_practice_plan, bind_generated_practice_plan, fallback_practice_plan

CONTEXT = {'practiceVersion': 'local:123', 'practiceRequest': True, 'measureNumbers': [0, 1, 2, 4], 'scores': []}
PLAN = {'scoreVersion': 'local:123', 'goal': '慢练短句', 'steps': [{'start': 1, 'end': 2, 'bpm': 60, 'rounds': 3, 'method': '核对低音再合手。', 'criterion': '自己听相邻起音是否均匀。'}]}


class PracticePlanTests(unittest.TestCase):
    def test_generated_range_is_intersected_with_real_score(self):
        draft=dict(PLAN,steps=[dict(PLAN['steps'][0],start='1',end='99',bpm='60',rounds='3')])
        result=bind_generated_practice_plan(draft,CONTEXT)
        self.assertEqual((result['steps'][0]['start'],result['steps'][0]['end']),(1,4))
        with self.assertRaises(ValueError):validate_practice_plan(draft,CONTEXT)
    def test_fallback_uses_real_measure_numbers(self):
        context=dict(CONTEXT,measureNumbers=[12,13,14],practiceTempo=80)
        plan=fallback_practice_plan(context)
        self.assertEqual(plan['steps'][0]['start'],12)
        self.assertEqual(plan['steps'][0]['end'],14)
        self.assertEqual(plan['steps'][0]['bpm'],60)
    def test_generation_binds_request_version_but_saved_plan_stays_strict(self):
        for version in (None, 'context.practiceVersion', 'old', 123):
            draft = dict(PLAN, scoreVersion=version)
            self.assertEqual(bind_generated_practice_plan(draft, CONTEXT), PLAN)
            with self.assertRaises(ValueError):
                validate_practice_plan(draft, CONTEXT)
        draft = {k:v for k,v in PLAN.items() if k!='scoreVersion'}
        self.assertEqual(bind_generated_practice_plan(json.dumps(draft), CONTEXT), PLAN)
        with self.assertRaises(ValueError):
            validate_practice_plan(PLAN, dict(CONTEXT, practiceVersion='new-score'))

    def test_valid_and_invalid(self):
        self.assertEqual(validate_practice_plan(json.dumps(PLAN), CONTEXT), PLAN)
        for bad in [dict(PLAN, scoreVersion='old'), dict(PLAN, microphone=True), dict(PLAN, steps=[dict(PLAN['steps'][0], end=99)]), dict(PLAN, steps=[dict(PLAN['steps'][0], rounds=True)])]:
            with self.assertRaises(ValueError):
                validate_practice_plan(bad, CONTEXT)

    def test_model_proposal_cannot_bypass_confirmation(self):
        class Target:
            def json_response(self, result, status=200):
                self.result, self.status = result, status
        target = Target()
        def model(messages, *args, **kwargs):
            self.assertIn('practice_plan', messages[0]['content'])
            return json.dumps({'reply': '分段建议待确认。', 'actions': [{'type': 'practice_plan', 'value': dict(PLAN, scoreVersion='context.practiceVersion')}, {'type': 'set_tempo', 'value': '200'}, {'type': 'play', 'value': ''}]})
        with patch.object(ai_workspace, 'post_model_stream', side_effect=model):
            ai_workspace.plan_data({'messages': [{'role': 'user', 'content': '给我练习计划'}], 'context': CONTEXT}, target)
        self.assertEqual(target.status, 200)
        self.assertEqual([a['type'] for a in target.result['actions']], ['practice_plan'])
        self.assertEqual(json.loads(target.result['actions'][0]['value']), PLAN)

    def test_prose_only_response_is_repaired_to_a_valid_proposal(self):
        class Target:
            def json_response(self, result, status=200):
                self.result, self.status = result, status
        target = Target()
        replies=[json.dumps({'reply':'先慢练两小节。','actions':[]}),json.dumps({'reply':'分段建议待确认。','actions':[{'type':'practice_plan','value':PLAN}]})]
        with patch.object(ai_workspace,'post_model_stream',side_effect=replies) as model:
            ai_workspace.plan_data({'messages':[{'role':'user','content':'练习计划'}],'context':CONTEXT},target)
        self.assertEqual(model.call_count,2)
        self.assertEqual(target.status,200)
        self.assertEqual(target.result['actions'][0]['type'],'practice_plan')


if __name__ == '__main__':
    unittest.main()
