import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from score_web_download import download, everyone_page
import ai_web_import


class Response:
    def __init__(self, body=b'', kind='text/html', status=200, location=None):
        self.body = body
        self.status_code = status
        self.headers = {'Content-Type': kind}
        if location:
            self.headers['Location'] = location
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def raise_for_status(self): pass
    def iter_content(self, size): yield self.body


class Downloads(unittest.TestCase):
    def test_other_public_site_page_to_pdf(self):
        session = SimpleNamespace(get=unittest.mock.Mock(side_effect=[
            Response(b'<a href="/files/piano.pdf">Piano PDF</a>'),
            Response(b'%PDF-1.7\nfixture', 'application/pdf')]))
        data, kind, final = download('https://music.example/score', lambda u: None, {}, session)
        self.assertEqual(final, 'https://music.example/files/piano.pdf')
        self.assertEqual(kind, 'application/pdf')

    def test_page_to_pdf_and_redirect(self):
        session = SimpleNamespace(get=unittest.mock.Mock(side_effect=[
            Response(b'<a href="/PDF-1607.html">PDF</a>'),
            Response(b'<a href="https://files.example/score.pdf">Download</a>'),
            Response(status=302, location='/final.pdf'),
            Response(b'%PDF-1.7\nfixture', 'application/pdf')]))
        checked = []
        data, kind, final = download('https://www.everyonepiano.cn/Music-1607.html', checked.append, {}, session)
        self.assertEqual(len(checked), 4)
        self.assertEqual(final, 'https://files.example/final.pdf')
        self.assertTrue(data.startswith(b'%PDF-'))
        self.assertEqual(session.get.call_args.kwargs['headers']['Referer'], 'https://files.example/score.pdf')

    def test_private_redirect_rejected_before_request(self):
        session = SimpleNamespace(get=unittest.mock.Mock(return_value=Response(status=302, location='http://127.0.0.1/secret')))
        def validate(url):
            if '127.0.0.1' in url: raise ValueError('不能下载内网地址')
        with self.assertRaisesRegex(ValueError, '内网'):
            download('https://example.org/a.pdf', validate, {}, session)
        self.assertEqual(session.get.call_count, 1)

    def test_vip_not_submitted(self):
        session = SimpleNamespace(get=lambda *a, **kw: Response('本站提供的PDF文件，只限于VIP用户下载。'.encode()))
        with self.assertRaisesRegex(ValueError, 'VIP'):
            download('https://www.everyonepiano.cn/PDF-1607.html', lambda u: None, {}, session)

    def test_html_cannot_be_pdf(self):
        session = SimpleNamespace(get=lambda *a, **kw: Response(b'<html>Login</html>', 'application/pdf'))
        with self.assertRaisesRegex(ValueError, '未提交识谱'):
            download('https://example.org/a.pdf', lambda u: None, {}, session)

    def test_host_lookalike(self):
        self.assertFalse(everyone_page('https://everyonepiano.cn.evil.org/Music-1.html'))

    def test_import_saves_pdf_and_queues_builtin_omr(self):
        body = json.dumps({'mode': 'import', 'url': 'https://www.everyonepiano.cn/Music-1607.html', 'title': '兰亭序'}).encode()
        handler = SimpleNamespace(headers={'Content-Length': str(len(body))}, rfile=io.BytesIO(body), json_response=lambda value, status=200: (value, status))
        with tempfile.TemporaryDirectory() as folder:
            server = SimpleNamespace(CACHE_DIR=Path(folder), enqueue_recognition=unittest.mock.Mock(return_value={'status': 'queued'}))
            with patch('score_web_download.download', return_value=(b'%PDF-1.7\nfixture', 'application/pdf', 'https://example.org/file.pdf')):
                result, status = ai_web_import.handle(handler, server)
            self.assertEqual(status, 202)
            self.assertEqual((Path(folder)/(result['id']+'.pdf')).read_bytes(), b'%PDF-1.7\nfixture')
            self.assertEqual((Path(folder)/(result['id']+'.name')).read_text(encoding='utf-8'), '兰亭序')
            server.enqueue_recognition.assert_called_once_with(b'%PDF-1.7\nfixture', result['id'])


if __name__ == '__main__': unittest.main()
