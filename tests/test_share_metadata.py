import sys,unittest
from pathlib import Path
from urllib.parse import quote
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from share_metadata import render

class ShareMetadataTest(unittest.TestCase):
 def test_home_has_image_without_tour(self):
  page=render('<head><meta charset="utf-8"><meta name="description" content="old"></head>','/','https://suzhou.super-tang.com')
  self.assertIn('https://suzhou.super-tang.com/assets/suda-share-20261021.jpg',page)
  self.assertIn('content="image/jpeg"',page)
  self.assertIn('rel="image_src"',page)
 def test_static_defaults_do_not_duplicate_personal_preview(self):
  source=(root/'dist/index.html').read_text(encoding='utf8')
  page=render(source,'/?tour=1&mentor='+quote('李老师<&')+'&institution='+quote('测试院校'),'https://suzhou.super-tang.com')
  self.assertEqual(page.count('property="og:image"'),1)
  self.assertEqual(page.count('name="twitter:image"'),1)
  self.assertIn('测试院校',page)
  self.assertNotIn('李老师<&',page)
 def test_cover_is_small_square_jpeg(self):
  from PIL import Image
  p=root/'dist/assets/suda-share-20261021.jpg'
  with Image.open(p) as image:self.assertEqual((image.format,image.size),('JPEG',(360,360)))
  self.assertLess(p.stat().st_size,32000)

if __name__=='__main__':unittest.main()
