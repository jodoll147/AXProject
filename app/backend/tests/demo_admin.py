"""Run against a compiled backend DLL; all account state is temporary."""
import http.cookiejar
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

dll = str(Path(sys.argv[1]).resolve())
dotnet = os.environ.get('DOTNET_COMMAND', 'dotnet')
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
base = f'http://127.0.0.1:{port}'

def call(client, path, payload=None):
    request = urllib.request.Request(base + path,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json', 'X-Requested-With': 'AXProject'})
    try:
        with client.open(request) as response:
            return response.status, json.loads(response.read() or b'null')
    except urllib.error.HTTPError as error:
        return error.code, None

def client():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

with tempfile.TemporaryDirectory(prefix='ax-demo-admin-') as temp:
    def start(mode, password='test', login='test-short'):
        process = subprocess.Popen([dotnet, dll, '--urls', base],
            cwd=Path(dll).parent,
            env={**os.environ, 'ASPNETCORE_ENVIRONMENT': 'Production',
                'AX_STATE_PATH': temp + '/state.json', 'AX_KEY_DIR': temp + '/keys',
                'AX_ADMIN_LOGIN': 'existing-admin', 'AX_ADMIN_PASSWORD': 'TestAccountOnly2026!',
                'AX_DEMO_MODE': mode, 'AX_DEMO_ADMIN_LOGIN': login, 'AX_DEMO_ADMIN_PASSWORD': password},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            if process.poll() is not None:
                raise AssertionError('backend stopped during startup')
            try:
                if call(client(), '/api/auth/me')[0] == 200:
                    return process
            except OSError:
                pass
            time.sleep(.1)
        process.terminate()
        process.wait()
        raise AssertionError('backend startup timeout')

    def login(name, password):
        c = client()
        status, _ = call(c, '/api/auth/login', {'login': name, 'password': password})
        return c, status

    process = start('0')
    try:
        assert login('test-short', 'test')[1] == 401, 'normal mode must ignore demo credentials'
        assert login('existing-admin', 'TestAccountOnly2026!')[1] == 200
    finally:
        process.terminate(); process.wait()
    process = start('1')
    try:
        c, status = login('test-short', 'test')
        assert status == 200
        _, users = call(c, '/api/admin/users')
        assert len(users) == 2 and all(u['role'] == 'ADMIN' for u in users)
        assert login('existing-admin', 'TestAccountOnly2026!')[1] == 200
        status, _ = call(c, '/api/admin/users', {'login': 'another', 'name': 'another',
            'role': 'ADMIN', 'password': 'test', 'active': True, 'assignments': []})
        assert status == 400, 'regular account API must retain its password policy'
        saved = Path(temp + '/state.json').read_text()
        assert 'TestAccountOnly2026!' not in saved and '"test"' not in saved
    finally:
        process.terminate(); process.wait()
    process = start('1', password='changed', login='TEST-SHORT')
    try:
        c, status = login('test-short', 'test')
        assert status == 200, 'restart must preserve existing credentials'
        assert len(call(c, '/api/admin/users')[1]) == 2, 'case-insensitive duplicate check'
        _, audits = call(c, '/api/admin/audit')
        assert sum(a['action'] == 'demo:bootstrap' for a in audits) == 1
    finally:
        process.terminate(); process.wait()
print('PASS: demo-only administrator, existing account, password policy, hash storage, idempotent restart')
