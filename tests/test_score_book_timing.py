import unittest
import xml.etree.ElementTree as ET
from score_book import join_scores,repair_legacy_page_padding


def fragment(meter='', page=False, extra=''):
    return '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1">'+('<print new-page="yes"/>' if page else '')+'<attributes><divisions>480</divisions>'+meter+'</attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>720</duration></note>'+extra+'</measure></part></score-partwise>'


class Timing(unittest.TestCase):
    def test_meter_inherits_across_pages(self):
        result=ET.fromstring(join_scores([fragment('<time><beats>3</beats><beat-type>8</beat-type></time>'),fragment(page=True)],'Test'))
        self.assertEqual(result.findall('.//forward'),[])

    def test_explicit_meter_change_is_preserved(self):
        result=ET.fromstring(join_scores([fragment('<time><beats>3</beats><beat-type>8</beat-type></time>'),fragment('<time><beats>4</beats><beat-type>4</beat-type></time>',True)],'Test'))
        self.assertEqual(result.findtext('.//forward/duration'),'1200')

    def test_only_synthetic_trailing_padding_is_repaired(self):
        xml=join_scores([fragment('<time><beats>3</beats><beat-type>8</beat-type></time>'),fragment(page=True)],'Test')
        root=ET.fromstring(xml);m=root.find('part').findall('measure')[1]
        ET.SubElement(ET.SubElement(m,'forward'),'duration').text='1200'
        fixed,count=repair_legacy_page_padding(ET.tostring(root,encoding='unicode'))
        self.assertEqual(count,1);self.assertEqual(ET.fromstring(fixed).findall('.//forward'),[])
        self.assertEqual(repair_legacy_page_padding(fixed)[1],0)

    def test_explicit_rests_and_staff_forward_are_not_removed(self):
        xml=fragment('<time><beats>3</beats><beat-type>8</beat-type></time>',True,'<note><rest/><duration>240</duration></note><forward><duration>960</duration><staff>2</staff></forward>')
        fixed,count=repair_legacy_page_padding(xml)
        self.assertEqual(count,0);self.assertEqual(fixed,xml)

    def test_same_page_forward_is_not_removed(self):
        xml=fragment('<time><beats>3</beats><beat-type>8</beat-type></time>',False,'<forward><duration>1200</duration></forward>')
        self.assertEqual(repair_legacy_page_padding(xml)[1],0)


if __name__=='__main__':unittest.main()
