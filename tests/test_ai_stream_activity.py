import io
import json
import unittest
from unittest.mock import patch
import ai_workspace as ai


class ActivityTests(unittest.TestCase):
    def test_model_stream_reads_small_chunks_and_reports_real_receipt(self):
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def raise_for_status(self):pass
            def iter_lines(self,chunk_size):
                self.chunk_size=chunk_size
                for text in ['{"reply":"','你好','","actions":[]}']:
                    yield b'data: '+json.dumps({'choices':[{'delta':{'content':text,'reasoning_content':'private reasoning'}}]}).encode()
                yield b'data: [DONE]'
        response=Response();activity=[];visible=[]
        ai._stream_progress.notify=activity.append
        try:
            with patch.object(ai.requests,'post',return_value=response):
                ai.post_model_stream([],visible.append)
        finally:ai._stream_progress.notify=None
        self.assertEqual(response.chunk_size,1)
        self.assertEqual(''.join(visible),'你好')
        self.assertTrue(any('已收到' in t for t in activity))
        self.assertFalse(any('private reasoning' in t for t in activity+visible))
    def test_initial_status_is_sent_before_plan_work(self):
        class Handler:
            wfile=io.BytesIO()
            def send_response(self,*args):pass
            def send_header(self,*args):pass
            def end_headers(self):pass
        handler=Handler()
        def fast(*args):
            self.assertIn('正在读取曲库',handler.wfile.getvalue().decode())
            return {'reply':'完成','actions':[]}
        with patch.object(ai,'fast_plan',side_effect=fast):ai.stream_result(handler,{'context':{},'messages':[]})
        rows=[json.loads(line) for line in handler.wfile.getvalue().splitlines()]
        self.assertEqual(rows[0]['type'],'status')
        self.assertEqual(rows[-1]['type'],'result')
        self.assertIsNone(ai._stream_progress.notify)


if __name__=='__main__':unittest.main()
