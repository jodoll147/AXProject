import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Keep the live screen visually in sync with the final standalone design.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let template = readFileSync(resolve(root, 'work/screen_template.html'), 'utf8').replaceAll('\r\n', '\n')
for(const [marker,files] of [['/*__LAYOUT_HISTORY_STYLE__*/',['work/layout_history.css']],['/*__LAYOUT_HISTORY_SCRIPT__*/',['work/history_state.js','work/layout_editor.js','work/history_view.js','work/layout_history_integration.js']],['/*__PLAN_ACTUAL_STYLE__*/',['work/plan_actual_view.css']],['/*__PLAN_ACTUAL_SCRIPT__*/',['work/period_comparison.js','work/plan_actual_view.js']]]){
  if(!template.includes(marker))throw new Error('Comparison template marker not found: '+marker)
  template=template.replace(marker,files.map(file=>readFileSync(resolve(root,file),'utf8')).join('\n'))
}
const source = 'const D=/*__DATA__*/null;\nconst SPEC=D._spec;delete D._spec;\nconst VALIDATION_DATA=D;'
if (!template.includes(source)) throw new Error('Data placeholder not found in design template')

const dataLoader = `;(async () => {
const rawFetch=window.fetch.bind(window);
window.fetch=(url,options={})=>rawFetch(url,{...options,headers:{...(options.headers||{}),...((options.method||'GET').toUpperCase()!=='GET'?{'X-Requested-With':'AXProject'}:{})}});
const sessionResponse=await fetch('/api/auth/me');
if(!sessionResponse.ok)throw new Error('인증 서버 응답 오류');
const session=await sessionResponse.json();
const CURRENT_USER=session.user;
const CURRENT_PERMISSIONS=session.permissions||[];
const loginPage=document.querySelector('[data-pg="login"]');
document.querySelector('#login-form').onsubmit=async e=>{e.preventDefault();const message=document.querySelector('#login-message');message.textContent='';try{const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:document.querySelector('#login-id').value,password:document.querySelector('#login-password').value})});if(!response.ok){message.textContent=response.status===429?'로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.':'아이디 또는 비밀번호가 올바르지 않습니다.';return}location.hash='#/';location.reload()}catch{message.textContent='서버 연결을 확인하세요.'}};
if(!CURRENT_USER){document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));loginPage.classList.add('on');document.querySelector('#login-message').textContent=session.initialized?'로그인 후 사용할 수 있습니다.':'관리자 계정이 설정되지 않았습니다. 서버 초기 설정을 확인하세요.';return;}
document.querySelector('#account-link').textContent=CURRENT_USER.name+' · 로그아웃';
document.querySelector('#account-link').onclick=async e=>{e.preventDefault();await fetch('/api/auth/logout',{method:'POST'});location.hash='#/login';location.reload()};
const [dataResponse, specResponse, statusResponse] = await Promise.all([fetch('/api/data'), fetch('/api/spec'), fetch('/api/data/status')]);
if (!dataResponse.ok || !specResponse.ok || !statusResponse.ok) throw new Error('데이터 API 응답을 확인하세요.');
const loadedData = await dataResponse.json();
const SPEC = await specResponse.json();
const DATA_STATUS = await statusResponse.json();
const VALIDATION_DATA = loadedData;
const D = DATA_STATUS.ready ? loadedData : Object.fromEntries(Object.keys(loadedData).map(table => [table, []]));`
const errorHandler = `})().catch(error => {
  console.error(error);
  document.querySelector('.view').innerHTML = '<div class="empty">데이터를 불러오지 못했습니다. 백엔드 서버를 확인하고 새로고침하세요.</div>';
});
</script>`
const html = template.replace(source, dataLoader).replace('</script>', errorHandler)
const target = resolve(root, 'app/frontend/index.html')
writeFileSync(target, html)
console.log(`Updated ${target}`)
