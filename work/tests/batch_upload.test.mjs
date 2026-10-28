import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {once} from 'node:events';

test('folder upload validates and commits atomically; duplicates rejected by server', {timeout:45000}, async()=>{
 const temp=await mkdtemp(join(tmpdir(),'ax-batch-test-')),base='http://127.0.0.1:5312';let server;
 const call=async(path,body,cookie)=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Requested-With':'AXProject',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  server=spawn('dotnet',[resolve('app/backend/bin/batch-debug/AxBackend.dll'),'--urls',base],{cwd:resolve('app/backend'),windowsHide:true,stdio:'ignore',env:{...process.env,ASPNETCORE_ENVIRONMENT:'Development',AX_STATE_PATH:join(temp,'state.json'),AX_KEY_DIR:join(temp,'keys'),AX_ADMIN_LOGIN:'batch-test',AX_ADMIN_PASSWORD:'BatchTestOnly2026!'}});
  let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,150))}assert.ok(ready,'test server started');
  const login=await call('/api/auth/login',{login:'batch-test',password:'BatchTestOnly2026!'});assert.equal(login.status,200);const admin=login.headers.get('set-cookie').split(';')[0];
  const data=await (await call('/api/data',undefined,admin)).json(),spec=await (await call('/api/spec',undefined,admin)).json();
  const row=(table,source,overrides={})=>Object.fromEntries(spec[table].map(({field})=>{let v=overrides[field]??source[field]??'';if(field.endsWith('_at')&&v&&!/(Z|[+-]\d\d:\d\d)$/i.test(String(v)))v=String(v)+'+09:00';return [field,String(v)]}));
  const file=(name,table,source,overrides={})=>({name,table,headers:spec[table].map(x=>x.field),rows:[row(table,source,overrides)]});
  const v=file('folder/vessels.csv','vessels',data.vessels[0],{vessel_id:'TEST-V-01'});
  const b=file('folder/blocks.csv','blocks',data.blocks[0],{block_id:'TEST-B-01',vessel_id:'TEST-V-01'});
  const before=data.vessels.length;
  assert.equal((await call('/api/data/batch',{files:[v]})).status,401);
  const create=await call('/api/admin/users',{login:'batch-viewer',name:'viewer',role:'VIEWER',password:'BatchViewer2026!',active:true,assignments:[]},admin);assert.equal(create.status,200);
  const viewerLogin=await call('/api/auth/login',{login:'batch-viewer',password:'BatchViewer2026!'});const viewer=viewerLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/data/batch',{files:[v]},viewer)).status,403);
  let res=await call('/api/data/batch/validate',{files:[b,v]},admin);assert.equal(res.status,200);assert.equal((await res.json()).saved,false);
  assert.equal((await (await call('/api/data',undefined,admin)).json()).vessels.length,before);
  const repeated={...v,name:'folder/duplicate.csv'};
  res=await call('/api/data/batch',{files:[v,repeated]},admin);assert.equal(res.status,400);
  let errors=(await res.json()).errors;assert.ok(errors.some(e=>e.file==='folder/duplicate.csv'&&e.row===2&&e.field==='vessel_id'));
  assert.equal((await (await call('/api/data',undefined,admin)).json()).vessels.length,before);
  const broken=file('folder/invalid.csv','blocks',data.blocks[0],{block_id:'TEST-B-02',vessel_id:'MISSING'});
  res=await call('/api/data/batch',{files:[v,broken]},admin);assert.equal(res.status,400);errors=(await res.json()).errors;assert.ok(errors.some(e=>e.file==='folder/invalid.csv'&&e.field==='vessel_id'));
  assert.equal((await (await call('/api/data',undefined,admin)).json()).vessels.length,before);
  res=await call('/api/data/batch',{files:[b,v]},admin);assert.equal(res.status,200);assert.equal((await res.json()).saved,true);
  let after=await (await call('/api/data',undefined,admin)).json();assert.equal(after.vessels.length,before+1);assert.ok(after.blocks.some(x=>x.block_id==='TEST-B-01'));
  assert.equal((await call('/api/data/batch',{files:[v]},admin)).status,400);
  const aud=await (await call('/api/admin/audit?action=upload:batch',undefined,admin)).json();assert.equal(aud.length,1);
  const actual=file('folder/actual.csv','production_actual',data.production_actual[0],{actual_id:'TEST-DUPLICATE',record_source:'OTHER'});
  res=await call('/api/data/upload',{table:actual.table,headers:actual.headers,rows:actual.rows},admin);assert.equal(res.status,400);assert.ok((await res.json()).errors.some(e=>e.rule==='중복 실적'));
  const fresh=file('folder/new-actual.csv','production_actual',data.production_actual[0],{actual_id:'TEST-ACTUAL-01',accepted_qty_delta:'0.123456'});
  const dup=file('folder/new-actual-2.csv','production_actual',data.production_actual[0],{actual_id:'TEST-ACTUAL-02',accepted_qty_delta:'0.123456',record_source:'DIFFERENT'});
  res=await call('/api/data/batch',{files:[fresh,dup]},admin);assert.equal(res.status,400);errors=(await res.json()).errors;assert.ok(errors.some(e=>e.file==='folder/new-actual-2.csv'&&e.rule==='중복 실적'));
  after=await (await call('/api/data',undefined,admin)).json();assert.ok(!after.production_actual.some(x=>x.actual_id==='TEST-ACTUAL-01'));
  // Two concurrent saves both passed independent preparation; the server lock must allow only one.
  const results=await Promise.all([call('/api/data/batch',{files:[fresh]},admin),call('/api/data/batch',{files:[dup]},admin)]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,400]);
  after=await (await call('/api/data',undefined,admin)).json();assert.equal(after.production_actual.filter(x=>['TEST-ACTUAL-01','TEST-ACTUAL-02'].includes(x.actual_id)).length,1);
 }finally{if(server?.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped}assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));await rm(temp,{recursive:true,force:true})}
});
