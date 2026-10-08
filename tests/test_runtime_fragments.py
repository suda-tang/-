import hashlib,json,tempfile,unittest,zipfile
from pathlib import Path
from deploy.restore_runtime import restore

class FragmentRestoreTests(unittest.TestCase):
 def test_fragmented_checkpoint_is_verified_and_reassembled(self):
  with tempfile.TemporaryDirectory() as directory:
   base=Path(directory);target='.sites-runtime/voice-reference/training/checkpoint.pt'
   content=b'authorised training checkpoint';parts=[];assets=[]
   for i,chunk in enumerate([content[:10],content[10:]]):
    path=base/f'part-{i}.zip';name=target+f'.restore-parts/{i:04d}';parts.append(name)
    with zipfile.ZipFile(path,'w') as archive:archive.writestr(name,chunk)
    assets.append({'name':path.name,'url':path.as_uri(),'size':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
   manifest={'assets':assets,'fragments':[{'path':target,'parts':parts,'size':len(content),'sha256':hashlib.sha256(content).hexdigest()}]}
   config=base/'manifest.json';config.write_text(json.dumps(manifest));root=base/'restore';restore(config,root)
   self.assertEqual((root/target).read_bytes(),content)
   self.assertFalse((root/(target+'.restore-parts')).exists())

 def test_fragment_path_cannot_escape_runtime(self):
  with tempfile.TemporaryDirectory() as directory:
   base=Path(directory);config=base/'manifest.json'
   config.write_text(json.dumps({'assets':[],'fragments':[{'path':'.sites-runtime/../outside','parts':[],'size':0,'sha256':''}]}))
   with self.assertRaises(ValueError):restore(config,base/'restore')
   self.assertFalse((base/'restore/outside').exists())

if __name__=='__main__':unittest.main()
