import unittest
from pathlib import Path
from unittest.mock import patch
from title_validation import check

class Recheck(unittest.TestCase):
 def test_hyphen_prefix(self):
  with patch('title_validation.lookup',return_value={'matchedTitle':'可惜不是你','artwork':'cover'}) as lookup:
   result=check({'candidates':[{'text':'可惜不是你-编曲张三','confidence':95,'center':.5,'size':.3}]},Path('.'))
   lookup.assert_called_once_with('可惜不是你',Path('.'));self.assertEqual(result['title'],'可惜不是你')
 def test_failed_ocr_uses_filename(self):
  with patch('title_validation.lookup',side_effect=[{}, {'matchedTitle':'青玉案','artwork':'cover'}]):
   result=check({'candidates':[{'text':'错误标题','confidence':95,'center':.5,'size':.3}],'filename':'青玉案.pdf'},Path('.'))
   self.assertEqual(result['title'],'青玉案');self.assertEqual(result['cover'],'cover')
