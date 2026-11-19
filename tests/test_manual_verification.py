import io
import time
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from PIL import Image
import requests
import manual_verification as manual


class ManualVerification(unittest.TestCase):
    def tearDown(self):
        manual.PENDING.clear()

    def test_preserves_session_and_resumes_only_after_success(self):
        image = io.BytesIO();Image.new('RGB', (80, 30), 'white').save(image, format='PNG')
        response = SimpleNamespace(url='https://www.so.com/verify', text='<form method="post" action="/check"><input name="token" type="hidden" value="abc"><input name="captcha"><img src="/captcha.png"></form>')
        session = requests.Session();session.cookies.set('session', 'original')
        fetched = MagicMock();fetched.iter_content.return_value=[image.getvalue()];fetched.__enter__.return_value=fetched
        session.get = MagicMock(return_value=fetched)
        ticket = manual.prepare(response, session)
        self.assertEqual(ticket['status'], 'waiting_user')
        resumed = requests.Session();resumed.post = MagicMock(return_value=SimpleNamespace(raise_for_status=lambda:None, is_redirect=False, text='<title>搜索结果</title>', apparent_encoding='utf8', encoding='utf8'))
        with patch('manual_verification.requests.Session', return_value=resumed):
            self.assertEqual(manual.complete(ticket['id'], '5278')['status'], 'passed')
        self.assertEqual(resumed.cookies.get('session'), 'original')
        self.assertEqual(resumed.post.call_args.kwargs['data'], {'token':'abc','captcha':'5278'})
        self.assertNotIn(ticket['id'], manual.PENDING)

    def test_expired_ticket_is_not_submitted(self):
        manual.PENDING['expired']={'expires':time.time()-1}
        with self.assertRaisesRegex(ValueError, '过期'):
            manual.complete('expired', '5278')

    def test_foreign_form_is_not_offered(self):
        response=SimpleNamespace(url='https://www.so.com/verify',text='<form action="https://evil.example/check"><input name="captcha"><img src="/captcha.png"></form>')
        self.assertIsNone(manual.prepare(response, requests.Session()))


if __name__ == '__main__':unittest.main()
