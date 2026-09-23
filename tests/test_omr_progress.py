import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server
import threading
from types import SimpleNamespace

class ProgressTest(unittest.TestCase):
    def test_real_log_page_is_not_elapsed_time(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'job').mkdir()
            (root/'job'/'recognition.log').write_text('30 sheets in score.pdf\nINFO [score#12] HEADS\n',encoding='utf-8')
            with patch.object(server,'JOBS_DIR',root):
                result=server.job_progress({'id':'job','status':'running'})
            self.assertEqual(result['page'],12)
            self.assertEqual(result['pages'],30)
            self.assertLess(result['progress'],100)

    def test_missing_log_is_still_running(self):
        result=server.job_progress({'id':'nonexistent','status':'running'})
        self.assertEqual(result['status'],'running')

    def test_multiple_exports_are_saved_as_one_library_score(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);cache=root/'cache';cache.mkdir()
            digest='a'*64
            (cache/(digest+'.name')).write_text('曲集.pdf',encoding='utf-8')
            jobs={'job':{'id':'job','status':'running'}}
            xml='<?xml version="1.0"?><score-partwise version="4.0"/>'
            def run(args,**kwargs):
                target=Path(args[args.index('-output')+1])
                (target/'score.mvt1.musicxml').write_text(xml,encoding='utf-8')
                (target/'score.mvt2.musicxml').write_text(xml,encoding='utf-8')
                return SimpleNamespace(returncode=0)
            with patch.multiple(server,ROOT=root,JOBS_DIR=root/'jobs',CACHE_DIR=cache,JOBS=jobs,LOCK=threading.Lock()),patch.object(server,'prepare_score'),patch.object(server,'audiveris_path',return_value='audiveris'),patch.object(server.subprocess,'run',side_effect=run):
                server.recognize('job',b'pdf',digest)
                self.assertEqual(jobs['job']['status'],'complete')
                self.assertEqual(jobs['job']['metadata']['joined'],'true')
                self.assertEqual(len(list(cache.glob('*.json'))),1)

if __name__=='__main__': unittest.main()
