import io
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import scorestarling as bridge


class Handler:
    def __init__(self, path, payload=None, cookie=''):
        raw=json.dumps(payload or {}).encode()
        self.path=path;self.command='POST' if payload is not None else 'GET'
        self.headers={'Host':'127.0.0.1:5173','Cookie':cookie,'Content-Length':str(len(raw))}
        self.rfile=io.BytesIO(raw);self.wfile=io.BytesIO();self.response_headers={}
    def send_response(self, status):self.status=status
    def send_header(self, k, v):self.response_headers[k]=v
    def end_headers(self):pass


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.private=patch.object(bridge,'PRIVATE',Path(self.tmp.name));self.private.start();self.addCleanup(self.private.stop)
    def test_cookie_rejects_path_traversal(self):
        h=Handler('/api/scorestarling',cookie='scorestarling_session=../../secret')
        self.assertEqual(len(bridge.browser_id(h)),64)
    def test_public_status_never_returns_tokens(self):
        sid='a'*64;bridge.save(sid,{'token':{'access_token':'secret'}})
        h=Handler('/api/scorestarling',cookie='scorestarling_session='+sid);bridge.handle(h,None)
        self.assertNotIn(b'secret',h.wfile.getvalue());self.assertIn('HttpOnly',h.response_headers['Set-Cookie'])
    def test_callback_rejects_wrong_state(self):
        h=Handler('/api/scorestarling/callback?state=wrong&code=wrong');bridge.handle(h,None)
        self.assertEqual(h.status,422)
    def test_job_isolation(self):
        h=Handler('/api/scorestarling?id=ai-other');bridge.handle(h,None)
        self.assertEqual(h.status,404)
    def test_requires_login_before_import(self):
        h=Handler('/api/scorestarling/import',{'url':'https://example.com/a.mp3'});bridge.handle(h,None)
        self.assertEqual(h.status,422)
    def test_phone_reuses_existing_computer_authorisation(self):
        bridge.save('a'*64,{'client_id':'client','token':{'access_token':'private-token'},'expires':time.time()+3600})
        phone=Handler('/api/scorestarling')
        bridge.handle(phone,None)
        result=json.loads(phone.wfile.getvalue())
        self.assertTrue(result['connected']);self.assertEqual(result['scope'],'server')
        self.assertNotIn(b'private-token',phone.wfile.getvalue())
        self.assertEqual(bridge.access_token('b'*64),'private-token')
    def test_server_disconnect_does_not_restore_old_browser_token(self):
        bridge.save('a'*64,{'client_id':'client','token':{'access_token':'old'},'expires':time.time()+3600})
        self.assertTrue(bridge.server_account())
        bridge.handle(Handler('/api/scorestarling/disconnect',{}),None)
        self.assertEqual(bridge.server_account(),{})
        with self.assertRaises(ValueError):bridge.access_token('a'*64)
    def test_shared_refresh_is_saved_once_for_all_devices(self):
        bridge.save('server-account',{'client_id':'client','token':{'access_token':'old','refresh_token':'refresh'},'expires':0})
        class Response:
            ok=True
            def json(self):return {'access_token':'new','refresh_token':'rotated','expires_in':3600}
        with patch.object(bridge,'network') as network:
            network.return_value.post.return_value=Response()
            self.assertEqual(bridge.access_token('a'*64),'new')
            self.assertEqual(bridge.access_token('b'*64),'new')
            self.assertEqual(network.return_value.post.call_count,1)
        self.assertEqual(bridge.load('server-account')['token']['refresh_token'],'rotated')
    def test_rpc_schema_filters_unrecognised_fields(self):
        m=bridge.MCP.__new__(bridge.MCP);m.tools={'test':{'inputSchema':{'properties':{'url':{}},'required':['url']}}}
        m.rpc=lambda method,payload:{'structuredContent':payload}
        out=m.call('test',url='https://example.com',link='ignored')
        self.assertEqual(out['arguments'],{'url':'https://example.com'})
        with self.assertRaises(ValueError):m.call('test')
    def test_locked_export_is_not_discarded_as_error(self):
        m=bridge.MCP.__new__(bridge.MCP);m.tools={'export_score':{'inputSchema':{}}}
        m.rpc=lambda *args:{'isError':True,'structuredContent':{'status':'locked','unlock_credits':15}}
        self.assertEqual(m.call('export_score')['unlock_credits'],15)
    def test_nested_result(self):
        self.assertEqual(bridge.find({'result':[{'score_id':'123'}]},'score_id'),'123')
    def test_locked_export_waits_without_spending(self):
        sid='c'*64;ident='ai-credit-test';bridge.save(sid,{'jobs':{ident:{'title':'曲谱','url':'https://example.com/a.mp3','remoteScore':'remote'}}})
        calls=[]
        class Client:
            def call(self,name,**kwargs):calls.append(name);return {'locked':True,'unlock_credits':15}
        with patch.object(bridge,'MCP',return_value=Client()),patch.object(bridge,'report') as report:
            bridge.run(sid,ident,None)
        self.assertEqual(calls,['export_score'])
        self.assertEqual(bridge.load(sid)['jobs'][ident]['credits'],15)
        self.assertEqual(report.call_args.args[2],'queued')
    def test_changed_credit_price_does_not_unlock(self):
        sid='d'*64;ident='ai-price-test';bridge.save(sid,{'jobs':{ident:{'title':'曲谱','url':'https://example.com/a.mp3','remoteScore':'remote','credits':15,'consent':True}}})
        calls=[]
        class Client:
            def call(self,name,**kwargs):calls.append(name);return {'locked':True,'unlock_credits':20}
        with patch.object(bridge,'MCP',return_value=Client()),patch.object(bridge,'report') as report:
            bridge.run(sid,ident,None)
        self.assertEqual(calls,['export_score']);self.assertEqual(report.call_args.args[2],'failed')
    def test_saved_remote_job_is_polled_without_resubmission(self):
        sid='e'*64;ident='ai-resume-test';bridge.save(sid,{'jobs':{ident:{'title':'曲谱','url':'https://example.com/a.mp3','remoteJob':'job'}}})
        calls=[]
        class Client:
            def call(self,name,**kwargs):
                calls.append(name)
                if name=='get_upload_status':return {'status':'completed','score_id':'score','progress':100}
                return {'locked':True,'unlock_credits':15}
        with patch.object(bridge,'MCP',return_value=Client()),patch.object(bridge,'report'):
            bridge.run(sid,ident,None)
        self.assertEqual(calls,['get_upload_status','export_score'])
    def test_completed_export_writes_library_and_keeps_all_parts(self):
        sid='b'*64;ident='ai-unit-test';bridge.save(sid,{'jobs':{ident:{'title':'测试曲','url':'https://example.com/a.mp3','remoteScore':'remote'}}})
        class Client:
            def call(self,*args,**kwargs):return {'download_url':'https://example.com/a.musicxml'}
        from types import SimpleNamespace
        writes=[];server=SimpleNamespace(CACHE_DIR=Path(self.tmp.name),omr_normalize=SimpleNamespace(REVISION=1),write_cached_score=lambda *a,**kw:writes.append(a))
        xml='<?xml version="1.0"?><score-partwise><part-list/><part id="P1"/><part id="P2"/></score-partwise>'
        with patch.object(bridge,'MCP',return_value=Client()),patch.object(bridge,'download_xml',return_value=xml),patch.object(bridge,'report') as report:
            bridge.run(sid,ident,server)
        self.assertEqual(writes[0][1],xml);self.assertEqual(report.call_args.args[2],'complete')
        self.assertTrue(bridge.load(sid)['jobs'][ident]['digest'])


if __name__=='__main__':unittest.main()
