import io,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import media_import

class MediaImports(unittest.TestCase):
 def test_images_are_staged_without_jobs_and_commit_preserves_order(self):
  with tempfile.TemporaryDirectory() as directory,patch.object(media_import,'CACHE',Path(directory)),patch('background_jobs.enqueue',return_value='job') as enqueue:
   a=media_import.receive(io.BytesIO(b'first'),5,'a.jpg',True)['id'];b=media_import.receive(io.BytesIO(b'second'),6,'b.jpg',True)['id']
   enqueue.assert_not_called()
   result=media_import.photo_book({'pages':[b,a],'name':'测试曲谱'})
   manifest=json.loads((Path(directory)/(result['id']+'.photo-book.json')).read_text(encoding='utf-8'))
   self.assertEqual(manifest['pages'],[b,a]);enqueue.assert_called_once()
 def test_incomplete_upload_does_not_create_job(self):
  with tempfile.TemporaryDirectory() as directory,patch.object(media_import,'CACHE',Path(directory)),patch('background_jobs.enqueue') as enqueue:
   with self.assertRaises(ValueError):media_import.receive(io.BytesIO(b'abc'),20,'x.mp4')
   enqueue.assert_not_called();self.assertEqual(list(Path(directory).iterdir()),[])
