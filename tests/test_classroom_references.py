import unittest
import requests
from unittest.mock import patch,Mock
from classroom_references import extract_results,song_title,direct_link,search_job,ENGINE_COOLDOWN
class ReferenceTests(unittest.TestCase):
 def setUp(self):ENGINE_COOLDOWN.clear()
 def tearDown(self):ENGINE_COOLDOWN.clear()
 def test_matching_public_source(self):
  html='<li class="b_algo"><h2><a href="https://www.pep.com.cn/lesson.html">茉莉花教学设计</a></h2><p>七年级音乐教案</p></li>'
  self.assertEqual(len(extract_results(html,'茉莉花')),1)
  self.assertEqual(extract_results(html,'晴'),[])
 def test_query_echo_in_lyrics_title_is_not_a_teaching_reference(self):
  html='<li class="b_algo"><h2><a href="https://www.kugou.com/song/a.html">突然好想你 音乐 教学设计 教案_突然好想你歌词</a></h2></li>'
  self.assertEqual(extract_results(html,'突然好想你'),[])
 def test_readable_lyrics_page_cannot_keep_a_fake_lesson_snippet(self):
  from classroom_references import verify
  response=Mock();response.is_redirect=False;response.headers={'Content-Type':'text/html'}
  response.iter_content.return_value=['<title>突然好想你歌词</title><h1>突然好想你</h1><p>歌曲歌词</p>'.encode()]
  with patch('classroom_references.checked_get',return_value=response):
   result=verify({'url':'https://example.edu/lyrics','title':'突然好想你教学设计'},'突然好想你')
  self.assertIsNone(result)
 def test_sources_are_not_restricted_to_education_domain_list(self):
  html='<li class="b_algo"><h2><a href="https://musicteacher.example/lesson">茉莉花教学设计</a></h2><p>七年级音乐教案</p></li>'
  self.assertEqual(len(extract_results(html,'茉莉花')),1)
 def test_pdf_lesson_body_is_read(self):
  import fitz
  from classroom_references import verify
  doc=fitz.open();page=doc.new_page();page.insert_text((40,40),'Moonlight');page.insert_text((40,70),'教学目标 学情分析 教学过程',fontname='china-s');data=doc.tobytes();doc.close()
  response=Mock();response.is_redirect=False;response.headers={'Content-Type':'application/pdf'};response.iter_content.return_value=[data]
  with patch('classroom_references.checked_get',return_value=response):
   result=verify({'url':'https://musicteacher.example/lesson.pdf','title':'Moonlight 教案'},'Moonlight')
  self.assertTrue(result['verified']);self.assertEqual(result['kind'],'lesson_pdf');self.assertIn('教学目标',result['excerpt']);response.close.assert_called_once()
 def test_unverified_site_not_used_as_teaching_authority(self):
  self.assertEqual(extract_results('<li class="b_algo"><h2><a href="http://127.0.0.1/a">晴教案</a></h2></li>','晴'),[])
 def test_title_from_filename(self):
  self.assertEqual(song_title('周杰伦《兰亭序》Cuppix改编-唯美钢琴独奏_1051876.pdf'),'兰亭序')
 def test_redirect_result_is_retained_for_resolution(self):
  html='<li class="res-list"><h3><a href="https://www.so.com/link?m=abc">保卫黄河教学设计</a></h3></li>'
  self.assertEqual(len(extract_results(html,'保卫黄河')),1)
 def test_incidental_mention_and_search_index_are_excluded(self):
  html='<li class="b_algo"><h2><a href="https://www.pep.com.cn/other">彩云追月教案</a></h2><p>拓展播放月亮代表我的心</p></li>'
  self.assertEqual(extract_results(html,'月亮代表我的心'),[])
  html='<li class="res-list"><h3><a href="https://wenku.so.com/s?q=茉莉花">茉莉花教案</a></h3></li>'
  self.assertEqual(extract_results(html,'茉莉花'),[])
 def test_captcha_is_network_failure_not_no_lesson(self):
  response=Mock();response.text='<title>访问异常页面</title><p>请输入验证码</p>';response.apparent_encoding='utf-8';response.url='https://www.so.com/s?q=茉莉花'
  with patch('classroom_references.requests.Session') as session:
   session.return_value.get.return_value=response;session.return_value.cookies=requests.cookies.RequestsCookieJar()
   results,diagnostic=search_job(('360','https://www.so.com/s',{'q':'茉莉花'}),'茉莉花')
  self.assertEqual(results,[]);self.assertEqual(diagnostic['status'],'unavailable');self.assertIn('验证',diagnostic['detail'])
 def test_blocked_engine_is_not_repeatedly_requested(self):
  response=Mock();response.text='<title>安全验证</title>';response.apparent_encoding='utf-8';response.url='https://www.so.com/s?q=茉莉花'
  with patch('classroom_references.requests.Session') as session:
   session.return_value.get.return_value=response;session.return_value.cookies=requests.cookies.RequestsCookieJar()
   search_job(('360','https://www.so.com/s',{'q':'茉莉花'}),'茉莉花')
   _,diagnostic=search_job(('360','https://www.so.com/s',{'q':'保卫黄河'}),'保卫黄河')
   self.assertEqual(session.return_value.get.call_count,1)
  self.assertGreater(diagnostic['retryAfter'],0)
 def test_mobile_search_uses_canonical_destination_without_heading_anchor(self):
  html="""<div class="c-result" data-log='{"mu":"https://teacher.example/lesson"}'><h3 class="c-title">茉莉花教学设计</h3><p>音乐教案</p></div>"""
  result=extract_results(html,'茉莉花','https://m.baidu.com')
  self.assertEqual(result[0]['url'],'https://teacher.example/lesson')
 def test_mobile_search_rejects_internal_and_search_destinations(self):
  for destination in ('http://127.0.0.1/lesson','https://wk.baidu.com/search?word=茉莉花'):
   import json
   html="""<div class="c-result" data-log='"""+json.dumps({"mu":destination})+"""'><h3 class="c-title">茉莉花教案</h3></div>"""
   self.assertEqual(extract_results(html,'茉莉花','https://m.baidu.com'),[])
 def test_senior_books_without_grade_label_are_searched(self):
  from teaching_catalog import find
  pages={'https://www.renjiaoshe.com/yinyue/':[('音乐鉴赏','https://www.renjiaoshe.com/jiaocai/1.html')],
         'https://www.renjiaoshe.com/jiaocai/1.html':[('茉莉花','https://www.renjiaoshe.com/kewen/2.html')],
         'https://www.renjiaoshe.com/kewen/2.html':[('教案','https://www.renjiaoshe.com/kewen/2_jiaoan.html')],
         'https://www.renjiaoshe.com/kewen/2_jiaoan.html':[('茉莉花教学设计','https://www.renjiaoshe.com/p/3.html')]}
  with patch('teaching_catalog.links',side_effect=lambda url:pages.get(url,[])):
   result=find('茉莉花','高中')
  self.assertEqual(result[0]['url'],'https://www.renjiaoshe.com/p/3.html')
  self.assertEqual(result[0]['referenceStage'],'高中')
 def test_one_blocked_engine_does_not_make_successful_empty_search_a_failure(self):
  import tempfile
  from pathlib import Path
  from classroom_references import find_references
  def search(job,title):
   return [],{'engine':job[0],'status':'unavailable' if job[0]=='360' else 'empty'}
  with tempfile.TemporaryDirectory() as directory,patch('classroom_references.CACHE',Path(directory)),patch('classroom_references.search_job',side_effect=search),patch('teaching_catalog.find',return_value=[]),patch('teaching_catalog.links',return_value=[('教材','https://example.edu/book')]):
   result=find_references('尚未公开教学设计的作品','高中')
  self.assertIn('暂未检索到',result['message'])
  self.assertNotIn('受限',result['message'])
  self.assertTrue(any(d['status']=='unavailable' for d in result['diagnostics']))
 def test_catalog_runs_even_when_general_search_has_candidates(self):
  import tempfile
  from pathlib import Path
  from classroom_references import find_references
  item={'title':'茉莉花教学设计','url':'https://example.edu/lesson','kind':'lesson_page','verified':True}
  with tempfile.TemporaryDirectory() as directory,patch('classroom_references.CACHE',Path(directory)),patch('classroom_references.search_job',return_value=([item],{'engine':'搜索','status':'results'})),patch('teaching_catalog.find',return_value=[item]) as catalog,patch('classroom_references.verify',side_effect=lambda item,title:item):
   result=find_references('茉莉花','高中')
  catalog.assert_called_once_with('茉莉花','高中')
  self.assertEqual(result['matched'],1)
  self.assertEqual(result['verified'],1)
 def test_transient_failures_expire_but_do_not_retry_every_poll(self):
  from classroom_references import needs_refresh,VERSION
  reference={'version':VERSION,'savedAt':1000,'matched':0,'diagnostics':[{'status':'unavailable'}]}
  self.assertFalse(needs_refresh(reference,now=1100))
  self.assertTrue(needs_refresh(reference,now=1301))
 def test_exception_retry_deadline_is_respected(self):
  from classroom_references import needs_refresh,VERSION
  reference={'version':VERSION,'savedAt':1000,'retryAt':1300}
  self.assertFalse(needs_refresh(reference,now=1299))
  self.assertTrue(needs_refresh(reference,now=1300))
 def test_successful_reference_is_reused_and_old_engine_versions_refresh(self):
  from classroom_references import needs_refresh,VERSION
  reference={'version':VERSION,'savedAt':1000,'matched':5}
  self.assertFalse(needs_refresh(reference,now=1500))
  self.assertTrue(needs_refresh(reference,now=87400))
  self.assertTrue(needs_refresh({**reference,'version':'old'},now=1500))
if __name__=='__main__':unittest.main()
