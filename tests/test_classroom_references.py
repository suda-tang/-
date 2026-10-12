import unittest
from classroom_references import extract_results
class ReferenceTests(unittest.TestCase):
 def test_matching_public_source(self):
  html='<li class="b_algo"><h2><a href="https://www.pep.com.cn/lesson.html">茉莉花教学设计</a></h2><p>七年级音乐教案</p></li>'
  self.assertEqual(len(extract_results(html,'茉莉花')),1)
  self.assertEqual(extract_results(html,'晴'),[])
 def test_unverified_site_not_used_as_teaching_authority(self):
  self.assertEqual(extract_results('<li class="b_algo"><h2><a href="http://127.0.0.1/a">晴教案</a></h2></li>','晴'),[])
if __name__=='__main__':unittest.main()
