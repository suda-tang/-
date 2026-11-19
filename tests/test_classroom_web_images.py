import importlib.util
import io
import unittest
from pathlib import Path
from unittest.mock import Mock,patch
from PIL import Image

spec=importlib.util.spec_from_file_location('classroom_images',Path(__file__).resolve().parents[1]/'scripts/classroom-images.py')
images=importlib.util.module_from_spec(spec);spec.loader.exec_module(images)


class WebImages(unittest.TestCase):
    def test_gallery_reaches_twenty_distinct_downloaded_images(self):
        downloads=[]
        def get(url,**kwargs):
            response=Mock();response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False)
            if 'commons.wikimedia.org' in url:response.json.return_value={'query':{'pages':{}}}
            elif '/artworks/search' in url:
                response.json.return_value={'data':[{'id':i,'image_id':f'{i:08x}-1234','is_public_domain':True,'title':'Piano '+str(i)} for i in range(24)]}
            else:
                ident=int(url.split('/iiif/2/')[1].split('-')[0],16);downloads.append(ident)
                # The first two URLs deliberately return the same actual bitmap.
                color=max(0,ident-1);buffer=io.BytesIO();Image.new('RGB',(32,32),(color*9,color*3,color)).save(buffer,format='JPEG')
                response.iter_content.return_value=[buffer.getvalue()]
            return response
        with patch.object(images.requests,'get',side_effect=get):assets=images.web_gallery(['grand piano keyboard'],20)
        self.assertEqual(len(assets),20)
        self.assertEqual(len({a['src'] for a in assets}),20)
        self.assertGreater(len(downloads),20)
        self.assertTrue(all(a['sourceUrl'] and a['credit'] for a in assets))
    def test_official_thumbnail_host_is_accepted(self):
        metadata=Mock();metadata.json.return_value={'query':{'pages':{'1':{'title':'File:Violin.jpg','imageinfo':[{'size':5000000,'url':'https://upload.wikimedia.org/large.jpg','thumburl':'https://thumb.wikimedia.org/violin.jpg','descriptionurl':'https://commons.wikimedia.org/wiki/File:Violin.jpg','extmetadata':{'LicenseShortName':{'value':'CC BY-SA 4.0'}}}]}}}}
        buffer=io.BytesIO();Image.new('RGB',(20,20)).save(buffer,format='JPEG')
        download=Mock();download.iter_content.return_value=[buffer.getvalue()]
        with patch.object(images.requests,'get',side_effect=[metadata,download]) as request:
            asset=images.commons('violin instrument')
        self.assertTrue(asset['src'].startswith('data:image/jpeg;base64,'))
        self.assertEqual(request.call_args.args[0],'https://thumb.wikimedia.org/violin.jpg')

    def test_subject_filter_rejects_unrelated_results(self):
        self.assertFalse(images.relevant_image('violin instrument','Bow Fiddle Rock East.jpg'))
        self.assertTrue(images.relevant_image('Francisco Tarrega portrait','Portrait of Francisco Tárrega'))

    def test_limited_source_falls_back_to_museum(self):
        asset={'src':'data:image/jpeg;base64,test','sourceUrl':'https://www.artic.edu/artworks/111877'}
        with patch.object(images,'commons',side_effect=ValueError('限流')),patch.object(images,'museum_image',return_value=asset) as museum:
            self.assertEqual(images.web_image('Franz Liszt portrait'),asset)
        museum.assert_called_once_with('Franz Liszt portrait')


class TeachingDiagrams(unittest.TestCase):
    def test_measures_are_not_stacked_at_the_same_beat(self):
        data={'evidence':{'notes':[{'measure':1,'beat':0,'duration':1},{'measure':1,'beat':1,'duration':3,'rest':True},{'measure':2,'beat':0,'duration':1}]}}
        with patch.object(images,'diagram',return_value={'src':'data:image/jpeg;base64,test'}) as draw:
            result=images.resolve({'outlineId':'page','kind':'rhythm'},data)
        self.assertIn('image',result)
        self.assertEqual(draw.call_args.args[1]['notes'][-1]['beat'],4)
    def test_comparison_uses_two_requested_segments(self):
        data={'evidence':{'parts':[{'value':'piano','name':'钢琴'}],'notes':[{'part':'piano','measure':measure,'beat':0,'duration':1,'pitch':{'step':'C','octave':'4'},'staff':'1','voice':'1'} for measure in [1,2,57,58]]}}
        result=images.resolve({'outlineId':'compare','kind':'comparison','measureRanges':[[1,2],[57,58]]},data)
        self.assertIn('image',result)
        self.assertIn('两个片段',result['image']['alt'])
        self.assertTrue(result['image']['src'].startswith('data:image/jpeg;base64,'))

if __name__=='__main__':unittest.main()
