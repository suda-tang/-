import unittest,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import parse_qs
from unittest.mock import patch
from io import BytesIO
import requests
from PIL import Image,ImageDraw,ImageFont
from search_verification import attempt_image_challenge,recognize

class VerificationTests(unittest.TestCase):
 def test_actual_cpu_ocr_and_http_session(self):
  image=Image.new('RGB',(180,60),'white');draw=ImageDraw.Draw(image);draw.text((15,5),'5278',font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',40),fill='#27313b');buffer=BytesIO();image.save(buffer,format='PNG');picture=buffer.getvalue();submissions=[]
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_GET(self):
    self.send_response(200)
    if self.path=='/captcha.png':self.send_header('Content-Type','image/png');self.end_headers();self.wfile.write(picture);return
    self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Set-Cookie','verify-session=bound');self.end_headers();self.wfile.write('<title>验证码</title><form method="post" action="/submit"><input type="hidden" name="token" value="kept"><input name="captcha"><img src="/captcha.png"></form>'.encode())
   def do_POST(self):
    fields=parse_qs(self.rfile.read(int(self.headers['Content-Length'])).decode());submissions.append(fields)
    valid=fields.get('captcha')==['5278'] and fields.get('token')==['kept'] and 'verify-session=bound' in self.headers.get('Cookie','')
    self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(('<title>搜索结果</title><h3>茉莉花教学设计</h3>' if valid else '<title>验证码</title>').encode())
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
  try:
   with requests.Session() as session,patch('search_verification.SEARCH_HOSTS',{'127.0.0.1'}):
    response=session.get('http://127.0.0.1:'+str(server.server_port)+'/');result,state=attempt_image_challenge(response,session)
    self.assertEqual(state['status'],'passed');self.assertIn('搜索结果',result.text);self.assertEqual(len(submissions),1)
  finally:server.shutdown();server.server_close()
 def test_interactive_challenge_has_no_fake_success(self):
  response=requests.Response();response.url='https://www.so.com/s';response._content='<title>安全验证</title><script src="q360.js"></script>'.encode();response.encoding='utf-8'
  with requests.Session() as session:
   _,status=attempt_image_challenge(response,session)
  self.assertEqual(status['status'],'manual')
 def test_foreign_form_is_not_submitted(self):
  response=requests.Response();response.url='https://www.so.com/s';response._content=b'<form action="https://evil.invalid/"><input name="captcha"><img src="/captcha.png"></form>'
  with requests.Session() as session,patch.object(session,'post') as submit:
   _,status=attempt_image_challenge(response,session);submit.assert_not_called()
  self.assertEqual(status['status'],'manual')
if __name__=='__main__':unittest.main()
