import hashlib, io, json, tempfile, unittest, zipfile
from pathlib import Path
from deploy.restore_runtime import restore, safe_members

class RuntimeRestoreTests(unittest.TestCase):
 def test_download_verify_and_restore(self):
  with tempfile.TemporaryDirectory() as directory:
   base=Path(directory);source=base/'sample.zip'
   with zipfile.ZipFile(source,'w') as archive:archive.writestr('.sites-runtime/sample/public.txt','public resource')
   manifest={'assets':[{'name':source.name,'url':source.as_uri(),'size':source.stat().st_size,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()}]}
   config=base/'manifest.json';config.write_text(json.dumps(manifest))
   target=base/'target';restore(config,target)
   self.assertEqual((target/'.sites-runtime/sample/public.txt').read_text(),'public resource')

 def test_unsafe_archive_is_rejected(self):
  for name in ['../private.txt','/absolute','C:/private.txt','.sites-runtime/../../private','dist/index.html']:
   with self.subTest(name=name):
    data=io.BytesIO()
    with zipfile.ZipFile(data,'w') as archive:archive.writestr(name,'bad')
    data.seek(0)
    with zipfile.ZipFile(data) as archive:
     with self.assertRaises(ValueError):list(safe_members(archive,Path.cwd()))

if __name__=='__main__':unittest.main()
