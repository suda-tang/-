"""Offline unit test for scorestarling.py transient-retry behaviour (no network).

Verifies:
  * rpc_safe retries a ReadTimeout once and returns the second result;
  * rpc_safe does NOT retry a non-transient error (ValueError);
  * rpc_safe gives up after `attempts` and re-raises the last transient error;
  * MCP.call routes read-only tools (check_link/get_upload_status/export_score)
    through rpc_safe, and side-effecting ones (transcribe_link/unlock_score)
    through the plain rpc (never retried).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import requests
from scorestarling import MCP, SAFE_CALLS

FAILS = []


def check(name, ok):
    print(('PASS' if ok else 'FAIL'), name)
    if not ok:
        FAILS.append(name)


def bare_mcp():
    return MCP.__new__(MCP)


# 1) rpc_safe retries a transient error and succeeds
m = bare_mcp()
seq = {'n': 0}


def rpc_once_then_ok(method, params=None, notification=False):
    seq['n'] += 1
    if seq['n'] == 1:
        raise requests.exceptions.ReadTimeout('stall')
    return {'method': method}


m.rpc = rpc_once_then_ok
check('rpc_safe retries ReadTimeout and succeeds',
      m.rpc_safe('initialize') == {'method': 'initialize'} and seq['n'] == 2)

# 2) non-transient error is not retried
m2 = bare_mcp()
seq2 = {'n': 0}


def rpc_value_error(method, params=None, notification=False):
    seq2['n'] += 1
    raise ValueError('not retryable')


m2.rpc = rpc_value_error
try:
    m2.rpc_safe('initialize')
    ok = False
except ValueError:
    ok = True
check('rpc_safe does not retry ValueError', ok and seq2['n'] == 1)

# 3) gives up after `attempts` and re-raises the transient error
m3 = bare_mcp()
seq3 = {'n': 0}


def rpc_always_timeout(method, params=None, notification=False):
    seq3['n'] += 1
    raise requests.exceptions.ReadTimeout('always')


m3.rpc = rpc_always_timeout
try:
    m3.rpc_safe('initialize', attempts=3)
    ok = False
except requests.exceptions.ReadTimeout:
    ok = True
check('rpc_safe gives up after attempts', ok and seq3['n'] == 3)

# 4) call() routing: read-only -> rpc_safe, side-effecting -> plain rpc
m4 = bare_mcp()
m4.tools = {
    'check_link': {'inputSchema': {'properties': {'url': {}, 'link': {}, 'instrument': {}}, 'required': []}},
    'transcribe_link': {'inputSchema': {'properties': {'url': {}, 'link': {}, 'provider': {}, 'title': {}}, 'required': []}},
}
seen = {}


def safe(method, params=None, notification=False):
    seen['safe'] = params['name']
    return {'structuredContent': {}}


def plain(method, params=None, notification=False):
    seen['plain'] = params['name']
    return {'structuredContent': {}}


m4.rpc_safe = safe
m4.rpc = plain
m4.call('check_link', url='x', link='x', instrument='piano')
m4.call('transcribe_link', url='x', link='x', provider='piano', title='t')
check('check_link routed through rpc_safe', seen.get('safe') == 'check_link')
check('transcribe_link routed through plain rpc', seen.get('plain') == 'transcribe_link')
check('SAFE_CALLS excludes side-effecting tools',
      'transcribe_link' not in SAFE_CALLS and 'unlock_score' not in SAFE_CALLS)

print()
print('RESULT:', 'ALL PASS' if not FAILS else ('FAILED: ' + ', '.join(FAILS)))
sys.exit(1 if FAILS else 0)
