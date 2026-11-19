import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import Mock,patch
import online_music as bridge


class OnlineMusic(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.private=patch.object(bridge,'PRIVATE',Path(self.temp.name));self.private.start()
    def tearDown(self):
        self.private.stop();self.temp.cleanup()
    def test_search_does_not_expose_download_urls_or_credentials(self):
        response=Mock();response.json.return_value={'code':200,'data':[{'title':'致爱丽丝','songid':1,'url':'http://music.163.com/song/media/outer/url?id=1.mp3','author':'钢琴演奏'}]}
        with patch.object(bridge.requests,'post',return_value=response):result=bridge.search('致爱丽丝')
        self.assertEqual(len(result['results']),1);self.assertNotIn('audio',result['results'][0]);self.assertNotIn('password',json.dumps(result))
        entry=bridge.read('catalog.json')[result['results'][0]['id']];self.assertTrue(entry['audio'].startswith('https://'))
    def test_search_uses_musicjx_as_primary(self):
        response=Mock();response.json.return_value={'code':200,'data':[]}
        with patch.object(bridge.requests,'post',return_value=response) as search:
            result=bridge.search('测试')
        self.assertEqual(search.call_args.args[0],'https://musicjx.com/')
        self.assertEqual(search.call_args.kwargs['headers']['Referer'],'https://musicjx.com/')
        self.assertEqual(result['provider'],'musicjx')
    def test_primary_failure_uses_public_search(self):
        response=Mock();response.json.return_value={'code':200,'result':{'songs':[{'id':42,'name':'测试曲','artists':[{'name':'演奏者'}]}]}}
        with patch.object(bridge.requests,'post',side_effect=bridge.requests.ConnectionError('unavailable')),patch.object(bridge.requests,'get',return_value=response):
            result=bridge.search('测试曲')
        self.assertTrue(result['fallback'])
        self.assertEqual(result['results'][0]['title'],'测试曲')
        self.assertNotIn('audio',result['results'][0])
    def test_qq_failure_labels_fallback_results_as_netease(self):
        response=Mock();response.json.return_value={'code':200,'result':{'songs':[{'id':77,'name':'说好不哭','artists':[{'name':'测试演唱者'}]}]}}
        with patch.object(bridge.requests,'post',side_effect=bridge.requests.ConnectionError('unavailable')),patch.object(bridge.requests,'get',return_value=response):
            result=bridge.search('说好不哭','qq')
        self.assertEqual(result['requestedPlatform'],'qq')
        self.assertEqual(result['results'][0]['platform'],'netease')
        entry=bridge.read('catalog.json')[result['results'][0]['id']]
        self.assertEqual(entry['platform'],'netease')
    def test_stream_delivers_fast_results_before_slow_channel(self):
        import io
        start=time.monotonic();events=[]
        class Output(io.BytesIO):
            def write(self,value):
                events.append((time.monotonic()-start,json.loads(value)))
                return super().write(value)
        handler=Mock();handler.wfile=Output()
        def source(query,platform,provider,page=1):
            time.sleep(.25 if provider=='musicjx' else .02)
            return {'results':[{'id':provider,'title':'曲名','artist':'演唱者','platform':'netease'}]}
        with patch.object(bridge,'search',side_effect=source):bridge.stream_search(handler,'曲名','netease')
        songs=[(stamp,event) for stamp,event in events if event['type']=='song']
        self.assertEqual(songs[0][1]['item']['id'],'netease')
        self.assertLess(songs[0][0],.20)
        self.assertGreaterEqual(songs[1][0],.24)
        self.assertEqual(events[-1][1],{'type':'done','count':2,'nextPages':{}})
    def test_stream_deduplicates_provider_results(self):
        import io
        handler=Mock();handler.wfile=io.BytesIO()
        with patch.object(bridge,'search',return_value={'results':[{'id':'same','title':'曲名','artist':'演唱者','platform':'netease'}]}):bridge.stream_search(handler,'曲名','netease')
        events=[json.loads(line) for line in handler.wfile.getvalue().splitlines()]
        self.assertEqual(sum(e['type']=='song' for e in events),1)
    def test_search_keeps_all_provider_results_and_requested_page(self):
        response=Mock();response.json.return_value={'code':200,'data':[{'title':'曲目'+str(i),'songid':i,'url':'https://audio.example/'+str(i)+'.mp3'} for i in range(18)]}
        with patch.object(bridge.requests,'post',return_value=response) as request:
            result=bridge.search('曲目','qq','musicjx',3)
        self.assertEqual(len(result['results']),18)
        self.assertEqual(request.call_args.kwargs['data']['page'],3)
        self.assertTrue(result['hasMore'])
    def test_public_search_uses_next_page_offset(self):
        response=Mock();response.json.return_value={'code':200,'result':{'songs':[{'id':42,'name':'曲目'}],'songCount':80}}
        with patch.object(bridge.requests,'get',return_value=response) as request:
            result=bridge.search('曲目','netease','netease',2)
        self.assertEqual(request.call_args.kwargs['params']['offset'],30)
        self.assertTrue(result['hasMore'])
    def test_preview_forwards_range_without_account_session(self):
        import io
        bridge.write_json(bridge.PRIVATE/'catalog.json',{'test':{'audio':'https://audio.example/test.mp3','source':'https://music.example/'}})
        response=Mock();response.is_redirect=False;response.status_code=206;response.headers={'Content-Type':'audio/mpeg','Content-Length':'3','Content-Range':'bytes 0-2/100'};response.iter_content.return_value=[b'abc']
        handler=Mock();handler.path='/api/online-music/preview?id=test';handler.headers={'Range':'bytes=0-2'};handler.wfile=io.BytesIO()
        with patch('ai_web_import.public_url'),patch.object(bridge.requests,'get',return_value=response) as request,patch.object(bridge,'session') as account:
            bridge.preview(handler)
        self.assertEqual(handler.wfile.getvalue(),b'abc')
        self.assertEqual(request.call_args.kwargs['headers']['Range'],'bytes=0-2')
        account.assert_not_called();handler.send_response.assert_called_once_with(206)
    def test_no_cookies_sent_to_foreign_download_site(self):
        session=Mock()
        with self.assertRaisesRegex(ValueError,'不属于'):
            bridge.remote_file(session,'https://other.example/score.xml')
        session.get.assert_not_called()
    def test_completed_task_is_reused(self):
        item={'id':'song-1','title':'Test'};bridge.write_json(bridge.PRIVATE/'catalog.json',{'song-1':item})
        bridge.write_json(bridge.PRIVATE/'jobs.json',{'ai-online-test':{'id':'ai-online-test','item':item,'title':'Test','mode':'piano.full','recording':'piano','status':'complete','scoreId':'score-1'}})
        response=Mock();response.json.return_value={'instruments':[{'styles':[{'id':'piano.full'}]}]}
        with patch.object(bridge.requests,'get',return_value=response),patch.object(bridge,'dispatch') as submit:
            result=bridge.start('song-1','piano.full','piano',Mock())
        self.assertEqual(result['scoreId'],'score-1');submit.assert_not_called()
    def test_interrupted_submission_does_not_duplicate_remote_upload(self):
        bridge.write_json(bridge.PRIVATE/'jobs.json',{'task':{'id':'task','status':'running','title':'Test'}})
        with patch.object(bridge,'state') as state,patch.object(bridge,'dispatch') as dispatch:bridge.resume(Mock())
        self.assertEqual(state.call_args.kwargs['status'],'failed');dispatch.assert_not_called()


if __name__=='__main__':unittest.main()
