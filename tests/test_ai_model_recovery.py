import unittest,json
from unittest.mock import Mock,patch
from ai_workspace import recover_model_plan,post_model_stream
class RecoveryTests(unittest.TestCase):
 def test_blank_generated_settings_do_not_override_the_real_classroom(self):
  from ai_workspace import action_value
  settings=json.loads(action_value({'type':'create_classroom','value':{'goal':'','schoolStage':'','mode':'','scope':'whole'}}))
  self.assertEqual(settings,{'scope':'whole'})
 def test_nonstream_recovery_keeps_original_request_and_actions(self):
  response=Mock();response.json.return_value={'choices':[{'message':{'content':json.dumps({'reply':'正在备课','actions':[{'type':'create_classroom','value':{'scope':'whole'}}]})}}]}
  with patch('ai_workspace.requests.post',return_value=response) as post:
   result=recover_model_plan([{'role':'system','content':'allowed actions'},{'role':'user','content':'把这节课备课一下'}],'把这节课备课一下')
  self.assertEqual(result['actions'][0]['type'],'create_classroom');self.assertFalse(post.call_args.kwargs['json']['stream']);self.assertIn('把这节课备课一下',post.call_args.kwargs['json']['messages'][-1]['content'])
 def test_empty_recovery_never_fabricates_an_action(self):
  response=Mock();response.json.return_value={'choices':[{'message':{'content':''}}]}
  with patch('ai_workspace.requests.post',return_value=response):self.assertIsNone(recover_model_plan([],'备课'))
 def test_gateway_final_message_is_read_without_delta(self):
  response=Mock();response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False)
  value='{"reply":"查看课堂进度","actions":[]}'
  response.iter_lines.return_value=[('data: '+json.dumps({'choices':[{'message':{'content':value}}]})).encode(),b'data: [DONE]']
  with patch('ai_workspace.requests.post',return_value=response):self.assertEqual(post_model_stream([]),value)
if __name__=='__main__':unittest.main()
