import unittest,xml.etree.ElementTree as ET
from score_title import with_title
class ScoreTitles(unittest.TestCase):
 def test_existing_and_missing_titles(self):
  for header in ('','<work/>','<work><work-title/></work>','<work><work-title>Old</work-title></work>'):
   xml='<?xml version="1.0"?><score-partwise>'+header+'<part-list/><part id="P1"><measure number="1"/></part></score-partwise>'
   result=with_title(xml,'新标题 & <二>')
   self.assertEqual(ET.fromstring(result).findtext('work/work-title'),'新标题 & <二>')
   self.assertIn('<part id="P1"><measure number="1"/></part>',result)
   self.assertEqual(with_title(result,'三').count('<work-title>'),1)
 def test_movement_title_follows_rename(self):
  result=with_title('<score-partwise><work><work-title>Old</work-title></work><movement-title>Old</movement-title><part-list/></score-partwise>','New')
  self.assertEqual(ET.fromstring(result).findtext('movement-title'),'New')
 def test_namespace_is_retained(self):
  result=with_title('<m:score-partwise xmlns:m="urn:test"><m:part-list/></m:score-partwise>','New')
  self.assertEqual(ET.fromstring(result).findtext('{urn:test}work/{urn:test}work-title'),'New')
 def test_title_follows_work_number_before_opus(self):
  for number in ('<work-number>Op. 1</work-number>','<work-number/>'):
   result=with_title('<score-partwise><work>'+number+'<opus href="collection.xml"/></work><part-list/></score-partwise>','New')
   self.assertEqual([item.tag for item in ET.fromstring(result).find('work')],['work-number','work-title','opus'])
   self.assertIn(number,result)
