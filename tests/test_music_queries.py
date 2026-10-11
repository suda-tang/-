import json
import unittest
from unittest.mock import Mock, patch
from music_query import repertoire_request, repertoire_conversation, repertoire_query, web_consent, required_query_facets
from library_classification import search_scores, SEARCH_CACHE
import ai_workspace

QUERY='找古典时期的钢琴独奏奏鸣曲慢乐章，要单三部，不要贝多芬，不要弦乐，先别播放'

def model_response(value):
 response=Mock();response.json.return_value={'choices':[{'message':{'content':json.dumps(value)}}]};return response

class MusicQueriesTest(unittest.TestCase):
 def setUp(self):SEARCH_CACHE.clear()

 def test_chinese_json_separators_preserve_prose(self):
  data=ai_workspace.parse_model_json('{"matches"：[ {"id":"score1"，"checks":{"form":"A，B：再现"}} ]}')
  self.assertEqual(data['matches'][0]['checks']['form'],'A，B：再现')
  self.assertEqual(data['matches'][0]['id'],'score1')

 def test_search_repairs_invalid_model_format_once(self):
  broken=Mock();broken.json.return_value={'choices':[{'message':{'content':'结果如下，格式暂不完整'}}]}
  request=Mock(side_effect=[broken,model_response({'matches':[]})])
  result=search_scores(QUERY,[{'id':'1','title':'莫扎特 奏鸣曲'}],request=request)
  self.assertEqual(result['ids'],[]);self.assertEqual(request.call_count,2)
  self.assertNotIn('搜索服务未返回',result.get('warning',''))

 def test_repertoire_does_not_become_current_part_control(self):
  self.assertTrue(repertoire_request(QUERY))
  self.assertIsNone(ai_workspace.fast_plan({'messages':[{'role':'user','content':QUERY}],'context':{'current':'知足','parts':[{'value':'piano','name':'钢琴'}]}}))
  self.assertFalse(repertoire_request('只听钢琴，不要弦乐'))

 def test_followup_inherits_conditions(self):
  history=[{'role':'user','content':QUERY},{'role':'assistant','content':'需要核对具体乐章。'},{'role':'user','content':'国籍改成法国，其他条件保留'}]
  self.assertTrue(repertoire_conversation(history));query=repertoire_query(history)
  self.assertIn(QUERY,query);self.assertIn('改成法国',query)

 def test_category_cannot_bypass_negation_and_form(self):
  request=Mock(return_value=model_response({'matches':[]}))
  result=search_scores(QUERY,[{'id':'1','title':'贝多芬 古典时期 钢琴独奏 单三部','category':'古典作品'}],request=request)
  self.assertEqual(result['ids'],[]);self.assertEqual(request.call_count,1)
  prompt=request.call_args.kwargs['json']['messages'][0]['content']
  self.assertIn('排除',prompt);self.assertIn('query_facets',prompt)

 def test_unknown_form_is_not_confirmed_match(self):
  request=Mock(return_value=model_response({'matches':[{'id':'score1','checks':{'period':'古典时期','form':'尚未核实','instrumentation':'钢琴独奏'},'uncertain':['form']}]}))
  self.assertEqual(search_scores(QUERY,[{'id':'1','title':'莫扎特 奏鸣曲'}],request=request)['ids'],[])

 def test_complete_checks_resolve_only_real_ids(self):
  query='找德国浪漫主义钢琴独奏作品'
  request=Mock(return_value=model_response({'matches':[{'id':'score1','checks':{'period':'浪漫主义','nationality':'德国作曲家','instrumentation':'钢琴独奏'},'uncertain':[]},{'id':'invented','checks':{},'uncertain':[]}]}))
  self.assertEqual(search_scores(query,[{'id':'1','title':'候选作品'}],request=request)['ids'],['1'])

 def test_plain_title_stays_fast(self):
  request=Mock(side_effect=AssertionError('should not call model'))
  self.assertEqual(search_scores('知足',[{'id':'1','title':'知足'}],request=request)['ids'],['1'])

 def test_soft_polyphony_is_not_a_hard_form_constraint(self):
  facets=required_query_facets('找法国印象主义钢琴独奏作品，复调味道是加分项，不是必须')
  self.assertNotIn('form',facets)

 def test_ordinary_yes_word_is_not_web_consent(self):
  self.assertFalse(web_consent([{'role':'user','content':'复调是加分项，不是必须'}]))
  self.assertFalse(web_consent([{'role':'user','content':'先不要联网搜索'}]))
  self.assertTrue(web_consent([{'role':'assistant','content':'需要联网查找吗？'},{'role':'user','content':'可以'}]))
  self.assertTrue(web_consent([{'role':'user','content':'去网上找找其他曲谱'}]))

 def test_recommendation_cannot_execute_model_generated_play(self):
  class Capture:
   def json_response(self,result,status=200):self.result=result
  target=Capture()
  proposal={'reply':'准备查找。','actions':[{'type':'solo','value':'piano'},{'type':'play','value':''},{'type':'skill_search','value':'music software'},{'type':'search','value':'贝多芬'}]}
  with patch.object(ai_workspace,'post_model_stream',return_value=json.dumps(proposal)):
   ai_workspace.plan_data({'messages':[{'role':'user','content':QUERY}],'context':{'scores':[]}},target)
  self.assertEqual(target.result['actions'],[{'type':'search','value':QUERY}])

if __name__=='__main__':unittest.main()
