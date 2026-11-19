import unittest
from types import SimpleNamespace
from server import Handler

class HostAuthorityTests(unittest.TestCase):
    def allowed(self, host, origin=None):
        headers={'Host':host}
        if origin is not None:headers['Origin']=origin
        return Handler.allowed(SimpleNamespace(headers=headers))

    def test_ipv6_with_and_without_port(self):
        for host in ('[::1]', '[::1]:5173', '[2409:8a20:4ed5:da70::d73]', '[2409:8a20:4ed5:da70::d73]:81'):
            self.assertTrue(self.allowed(host,'http://'+host),host)

    def test_known_hosts(self):
        for host in ('localhost','localhost:5173','127.0.0.1','suzhou.super-tang.com'):
            self.assertTrue(self.allowed(host,'http://'+host))

    def test_invalid_authorities_and_origins(self):
        for host in ('', '[::1', 'localhost:bad', 'user@localhost', 'localhost/path', 'unknown.example'):
            self.assertFalse(self.allowed(host),host)
        self.assertFalse(self.allowed('localhost','http://other.example'))
        self.assertFalse(self.allowed('localhost','http://[broken'))
