import json,tempfile,threading,unittest,urllib.request,urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import server

XML='<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>Original</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>'
class QuietHandler(server.Handler):
 def log_message(self,*args):pass
class ImportHttpFlow(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  p=patch.object(server,'CACHE_DIR',Path(self.tmp.name));p.start();self.addCleanup(p.stop)
  self.http=ThreadingHTTPServer(('127.0.0.1',0),QuietHandler)
  threading.Thread(target=self.http.serve_forever,daemon=True).start()
  self.addCleanup(self.http.server_close);self.addCleanup(self.http.shutdown)
  self.base='http://127.0.0.1:'+str(self.http.server_port)
  self.open=urllib.request.build_opener(urllib.request.ProxyHandler({})).open
 def request(self,path,body=None):
  raw=None if body is None else json.dumps(body).encode()
  request=urllib.request.Request(self.base+path,data=raw,headers={'Content-Type':'application/json'})
  try:
   with self.open(request,timeout=5) as response:return response.status,json.load(response)
  except urllib.error.HTTPError as error:return error.code,json.load(error)
 def test_import_read_rename_and_reopen(self):
  status,data=self.request('/api/scores/midi',{'name':'Audit Sonata.mid','xml':XML,'metadata':{'title':'Piano'}})
  self.assertEqual(status,200);ident=data['id']
  status,score=self.request('/api/scores/'+ident)
  self.assertEqual(status,200);self.assertEqual(score['metadata']['title'],'Audit Sonata')
  self.assertIn('<work-title>Audit Sonata</work-title>',score['xml'])
  status,_=self.request('/api/scores/'+ident+'/title',{'title':'新名称 & 版本二'})
  self.assertEqual(status,200)
  status,score=self.request('/api/scores/'+ident)
  self.assertEqual(score['metadata']['title'],'新名称 & 版本二')
  self.assertIn('<work-title>新名称 &amp; 版本二</work-title>',score['xml'])
 def test_invalid_import_does_not_poison_next_request(self):
  self.assertEqual(self.request('/api/scores/midi',{'xml':'invalid'})[0],400)
  self.assertEqual(self.request('/api/scores/midi',{'xml':XML,'name':'Valid.mid','metadata':{}})[0],200)

 def test_renamed_title_survives_recognition_variant_switch(self):
  status,data=self.request('/api/scores/midi',{'name':'Variant.mid','xml':XML,'metadata':{}})
  ident=data['id'];server.store_variant(ident,'standard',XML);server.store_variant(ident,'fine',XML.replace('<step>C</step>','<step>D</step>'))
  self.assertEqual(self.request('/api/scores/'+ident+'/title',{'title':'保留的新曲名'})[0],200)
  status,result=self.request('/api/scores/'+ident+'/variant',{'variant':'fine'})
  self.assertEqual(status,200,result)
  _,score=self.request('/api/scores/'+ident)
  self.assertIn('<step>D</step>',score['xml'])
  self.assertIn('<work-title>保留的新曲名</work-title>',score['xml'])

 def test_truncated_xml_is_rejected_before_it_reaches_library(self):
  status,result=self.request('/api/scores/midi',{'name':'Broken.mid','xml':'<?xml version="1.0"?><score-partwise><part-list>','metadata':{}})
  self.assertEqual(status,400);self.assertIn('结构不完整',result['error'])
  self.assertEqual(list(Path(self.tmp.name).glob('*.json')),[])
