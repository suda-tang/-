import unittest,tempfile
from pathlib import Path
from unittest.mock import patch
from title_validation import check,filename_title
class Titles(unittest.TestCase):
 def test_filename_fallback_keeps_name_without_cover(self):
  with patch('title_validation.lookup',return_value={}):
   result=check({'candidates':[{'text':'制谱：张三','confidence':99,'size':.4}],'filename':'梁静茹 - 可惜不是你_123456.pdf'},Path('.'))
   self.assertEqual(result['title'],'梁静茹 - 可惜不是你');self.assertEqual(result['titleSource'],'filename')
 def test_filename_drops_arranger_and_suffix(self):
  self.assertEqual(filename_title('零距离的思念 原调独奏版 化身无编配_123456.pdf'),'零距离的思念')
 def test_credit_is_never_title(self):
  with patch('title_validation.lookup') as lookup:
   r=check({'candidates':[{'text':'制谱：泽大大','confidence':98,'center':.5,'size':.25}]},Path('.'))
   self.assertEqual(r['title'],'');lookup.assert_not_called()
 def test_uncertain_heading_is_not_silently_accepted(self):
  with patch('title_validation.lookup',return_value={}):
   self.assertEqual(check({'candidates':[{'text':'青玉案','confidence':69,'center':.5,'size':.25}]},Path('.'))['title'],'')
 def test_catalogue_confirms_heading(self):
  with patch('title_validation.lookup',return_value={'matchedTitle':'可惜不是你','artwork':'https://cover.example/image.jpg'}):
   r=check({'candidates':[{'text':'可惜不是你','confidence':90,'center':.5,'size':.25}]},Path('.'))
   self.assertEqual(r['titleVerification'],'catalogue')
 def test_cover_confirmed_candidate_wins_over_credit_line(self):
  with patch('title_validation.lookup',return_value={'matchedTitle':'可惜不是你','artwork':'https://cover.example/image.jpg'}):
   r=check({'candidates':[{'text':'作曲：张三','confidence':99,'center':.5,'size':.25},{'text':'可惜不是你','confidence':90,'center':.5,'size':.2}]},Path('.'))
   self.assertEqual(r['title'],'可惜不是你')
 def test_no_cover_keeps_title_unresolved(self):
  with patch('title_validation.lookup',return_value={'matchedTitle':'可惜不是你'}):
   r=check({'candidates':[{'text':'可惜不是你','confidence':90,'center':.5,'size':.25}]},Path('.'))
   self.assertEqual(r['title'],'');self.assertTrue(r['retryTitleOcr'])
class AmbiguousFilenameTests(unittest.TestCase):
 def test_hyphenated_title_is_not_truncated(self):
  self.assertEqual(filename_title('A-lovely-song.mid'),'A-lovely-song')
 def test_catalogue_can_resolve_artist_title_pair(self):
  def lookup(title,cache):
   return {'matchedTitle':'可惜不是你','artwork':'https://example.com/cover.jpg'} if title=='可惜不是你' else {}
  with patch('title_validation.lookup',side_effect=lookup):
   result=check({'filename':'梁静茹 - 可惜不是你.pdf'},Path('.'))
  self.assertEqual(result['title'],'可惜不是你')
 def test_image_alone_never_confirms_title(self):
  with patch('title_validation.lookup',return_value={'artwork':'https://example.com/a.jpg','usedCore':True}):
   result=check({'filename':'测试曲目.pdf'},Path('.'))
  self.assertEqual(result['title'],'测试曲目')
  self.assertEqual(result['titleVerification'],'filename')

if __name__=='__main__':unittest.main()
