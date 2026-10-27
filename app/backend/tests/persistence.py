import urllib.request, http.cookiejar, json
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
base='http://127.0.0.1:5199'
req=urllib.request.Request(base+'/api/auth/login',data=json.dumps({'login':'test-admin','password':'test-only-password-1234'}).encode(),headers={'Content-Type':'application/json','X-Requested-With':'AXProject'},method='POST')
with opener.open(req) as response: assert response.status==200
with opener.open(base+'/api/admin/users') as response: users=json.load(response)
with opener.open(base+'/api/admin/audit') as response: audit=json.load(response)
with opener.open(base+'/api/data') as response: data=json.load(response)
assert any(u['login']=='test-worker' for u in users)
assert any(a['action']=='update:production_actual' for a in audit)
assert any(a['actual_id']=='INTEGRATION-GOOD' and a['accepted_qty_delta']==2 for a in data['production_actual'])
print('PASS: account, data and audit survive server restart')
headers={'X-Requested-With':'AXProject','Content-Type':'application/json'}
def post(path):
 req=urllib.request.Request(base+path,data=b'{}',headers=headers,method='POST')
 with opener.open(req) as r: return r.status,json.loads(r.read())
status,_=post('/api/data/reset');assert status==200
with opener.open(base+'/api/data') as r: assert all(not rows for rows in json.load(r).values())
status,_=post('/api/data/restore-sample');assert status==200
with opener.open(base+'/api/data') as r: assert len(json.load(r)['work_orders'])>0
with opener.open(base+'/api/admin/audit') as r: actions=[x['action'] for x in json.load(r)]
assert 'reset' in actions and 'restore-sample' in actions
print('PASS: reset, sample restore and audit in isolated storage')
