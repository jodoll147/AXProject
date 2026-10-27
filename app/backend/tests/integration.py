import urllib.request,urllib.error,http.cookiejar,json
B='http://127.0.0.1:5199'; H={'X-Requested-With':'AXProject'}
class Session:
 def __init__(self): self.o=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def call(self,path,payload=None,header=True):
  hs=H.copy() if header else {}; body=None
  if payload is not None: body=json.dumps(payload).encode(); hs['Content-Type']='application/json'
  req=urllib.request.Request(B+path,data=body,headers=hs,method='POST' if payload is not None or path=='/api/data/reset' else 'GET')
  try:
   with self.o.open(req) as r: return r.status,json.loads(r.read() or b'null')
  except urllib.error.HTTPError as e:
   try: b=json.loads(e.read() or b'null')
   except: b=None
   return e.code,b
 def get(self,p): return self.call(p)
 def post(self,p,x=None,header=True): return self.call(p,x if x is not None else {},header)
def check(c,m):
 if not c: raise AssertionError(m)
a=Session();check(a.get('/api/data')[0]==401,'anonymous data')
check(a.post('/api/auth/login',{'login':'test-admin','password':'test-only-password-1234'})[0]==200,'admin login')
status,data=a.get('/api/data');check(status==200,'admin data');work=data['work_orders'][0]['work_order_id']
for login,role in [('test-viewer','VIEWER'),('test-worker','WORKER')]:
 status,result=a.post('/api/admin/users',{'login':login,'name':login,'role':role,'password':'test-only-password-1234','active':True,'assignments':[work] if role=='WORKER' else []});check(status==200,'create '+login+' '+str(result))
v=Session();check(v.post('/api/auth/login',{'login':'test-viewer','password':'test-only-password-1234'})[0]==200,'viewer login');check(v.get('/api/data')[0]==200,'viewer read');check(v.get('/api/admin/users')[0]==403,'viewer admin denied');check(v.post('/api/data/reset')[0]==403,'viewer reset denied')
w=Session();check(w.post('/api/auth/login',{'login':'test-worker','password':'test-only-password-1234'})[0]==200,'worker login');check(w.post('/api/work/entry',{'table':'incidents','row':{'work_order_id':'NOT-ASSIGNED'}})[0]==403,'worker unassigned denied')
check(a.post('/api/data/reset',header=False)[0]==400,'csrf header');spec=a.get('/api/spec')[1];headers=[x['field'] for x in spec['production_actual']];source=data['production_actual'][0];row={k:str(source.get(k,'')) for k in headers};row['actual_id']='INTEGRATION-BAD';row['accepted_qty_delta']='-1'
for k in ['period_start_at','period_end_at']:
 if row[k] and not row[k].endswith('+09:00'): row[k]=row[k][:19]+'+09:00'
before=len(data['production_actual']);status,result=a.post('/api/data/upload',{'table':'production_actual','headers':headers,'rows':[row]});check(status==400,'invalid quantity '+str(result));check(len(a.get('/api/data')[1]['production_actual'])==before,'batch unchanged');row['period_start_at']='2026-09-07T08:00:13+09:00';row['period_end_at']='2026-09-07T08:01:27+09:00';row['actual_id']='INTEGRATION-GOOD';row['accepted_qty_delta']='1';row['work_order_id']=work;row['unit']=data['work_orders'][0]['unit'];status,result=w.post('/api/work/entry',{'table':'production_actual','row':row,'id':None});check(status==200,'assigned create '+str(result));row['accepted_qty_delta']='2';status,result=w.post('/api/work/entry',{'table':'production_actual','row':row,'id':'INTEGRATION-GOOD'});check(status==200,'assigned edit '+str(result));check(next(x for x in a.get('/api/data')[1]['production_actual'] if x['actual_id']=='INTEGRATION-GOOD')['period_start_at'].endswith('13+09:00'),'second precision');audit=a.get('/api/admin/audit')[1];check(len(audit)>=5 and 'test-only-password' not in json.dumps(audit),'audit without credentials');print('PASS: unauthenticated access, login, roles, assignments, CSRF, invalid batch, assigned create/edit, audit')

users=a.get('/api/admin/users')[1]; admin=next(x for x in users if x['login']=='test-admin'); viewer=next(x for x in users if x['login']=='test-viewer')
status,_=a.post('/api/admin/users/'+admin['id'],{'login':admin['login'],'name':admin['name'],'role':'VIEWER','password':'','active':True,'assignments':[]});check(status==400,'last admin protection')
status,_=a.post('/api/admin/users/'+viewer['id'],{'login':viewer['login'],'name':viewer['name'],'role':'WORKER','password':'','active':True,'assignments':[work]});check(status==200,'role change');check(v.get('/api/data')[0]==401,'role change invalidates session')
check(v.post('/api/auth/login',{'login':'test-viewer','password':'test-only-password-1234'})[0]==200,'relogin after role change');check(v.get('/api/admin/users')[0]==403,'worker cannot manage roles')
status,items=a.get('/api/admin/audit?action=update');check(status==200 and any(x['action']=='update' for x in items),'audit filter')
status,_=a.post('/api/admin/permissions',{'permissions':{'VIEWER':['read'],'WORKER':['read']}});check(status==200,'disable work permission');check(w.post('/api/work/entry',{'table':'incidents','row':{'work_order_id':work}})[0]==403,'revoked work permission');status,_=a.post('/api/admin/permissions',{'permissions':{'VIEWER':['read'],'WORKER':['read','work']}});check(status==200,'restore work permission')
last=0
for i in range(12): last=Session().post('/api/auth/login',{'login':'invalid','password':'invalid'})[0]
check(last==429,'login rate limit');print('PASS: last admin, session invalidation, audit filter, rate limiting')


