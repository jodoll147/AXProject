import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {once} from 'node:events';

test('layout API: authorization, validation, atomic conflict, audit, restart persistence', {timeout:45000}, async()=>{
 const temp=await mkdtemp(join(tmpdir(),'ax-layout-test-')),base='http://127.0.0.1:5311';
 let server;
 async function start(){
   server=spawn('dotnet',[resolve('app/backend/bin/layout-debug/AxBackend.dll'),'--urls',base],{cwd:resolve('app/backend'),windowsHide:true,env:{...process.env,ASPNETCORE_ENVIRONMENT:'Development',AX_STATE_PATH:join(temp,'state.json'),AX_KEY_DIR:join(temp,'keys'),AX_ADMIN_LOGIN:'layout-test',AX_ADMIN_PASSWORD:'LayoutTestOnly2026!'},stdio:'ignore'});
   for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,150))}throw Error('Test server failed to start');
 }
 async function stop(){if(server?.exitCode===null){const done=once(server,'exit');server.kill();await done}}
 async function call(path,body,cookie){return fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Requested-With':'AXProject',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})}
 async function login(login,password){const r=await call('/api/auth/login',{login,password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]}
 try{
  await start();let admin=await login('layout-test','LayoutTestOnly2026!');
  assert.equal((await call('/api/admin/layout',{zones:[]})).status,401);
  for(const role of ['VIEWER','WORKER']){
    const created=await call('/api/admin/users',{login:role,name:role,role,password:'LayoutRoleTest2026!',active:true,assignments:[]},admin);assert.equal(created.status,200);
    const cookie=await login(role,'LayoutRoleTest2026!');assert.equal((await call('/api/admin/layout',{zones:[]},cookie)).status,403);
  }
  const data=await (await call('/api/data',undefined,admin)).json(),a=data.zones[0],b=data.zones[1];
  const change=(z,x=z.x+20)=>({zoneId:z.zone_id,x,y:z.y,previousX:z.x,previousY:z.y});
  for(const zones of [[],[change(a),change(a)],[{...change(a),zoneId:'UNKNOWN'}],[change(a,10001)]])assert.equal((await call('/api/admin/layout',{zones},admin)).status,400);
  const auditsBefore=await (await call('/api/admin/audit?action=layout:update',undefined,admin)).json();assert.equal(auditsBefore.length,0);
  const rejected=await call('/api/admin/layout',{zones:[change(a),{...change(b),previousX:b.x+1}]},admin);assert.equal(rejected.status,409);
  let after=await (await call('/api/data',undefined,admin)).json();assert.equal(after.zones[0].x,a.x);
  assert.equal((await call('/api/admin/layout',{zones:[change(a),change(b)]},admin)).status,200);
  assert.equal((await call('/api/admin/layout',{zones:[change(a)]},admin)).status,409);
  after=await (await call('/api/data',undefined,admin)).json();assert.equal(after.zones[0].x,a.x+20);assert.equal(after.zones[1].x,b.x+20);assert.deepEqual(after.work_orders,data.work_orders);
  const audits=await (await call('/api/admin/audit?action=layout:update',undefined,admin)).json();assert.equal(audits.length,1);assert.equal(audits[0].target,'zones');assert.equal(audits[0].before[0].x,a.x);assert.equal(audits[0].after[0].x,a.x+20);
  await stop();await start();admin=await login('layout-test','LayoutTestOnly2026!');
  after=await (await call('/api/data',undefined,admin)).json();assert.equal(after.zones[0].x,a.x+20);assert.equal((await (await call('/api/admin/audit?action=layout:update',undefined,admin)).json()).length,1);
 }finally{await stop();assert.ok(resolve(temp).startsWith(resolve(tmpdir())+'\\'));await rm(temp,{recursive:true,force:true})}
});
