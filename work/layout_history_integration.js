function settingsMode(){return new URLSearchParams(location.hash.split('?')[1]||'').get('tab')||'accounts'}
function settingsNavigation(selected){return `<nav class="layout-tabs" aria-label="Settings 메뉴">${[['accounts','역할·계정 관리'],['audit','감사이력'],['layout','공정 배치도 수정']].map(([key,label])=>`<a href="#/settings?tab=${key}" class="${key===selected?'on':''}" ${key===selected?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`}
const renderOriginalSettings=renderSettings;
renderSettings=async function(){
  const root=$('#pg-settings');root.classList.remove('layout-settings-view');
  if(CURRENT_USER.role==='ADMIN'&&settingsMode()==='layout'){renderLayoutSettings();return}
  await renderOriginalSettings();
  if(route.page!=='settings'||CURRENT_USER.role!=='ADMIN'||settingsMode()==='layout')return;
  const audit=$('#audit-filter')?.closest('section');
  root.querySelector('.vhead')?.insertAdjacentHTML('afterend',settingsNavigation(settingsMode()));
  if(audit){for(const section of root.querySelectorAll(':scope > section'))section.hidden=settingsMode()==='audit'?section!==audit:section===audit}
};
const renderOriginalProduct=render;
render=function(){
  const routeKey=route.page==='detail'?route.type+'/'+route.id:'';
  if(historyRoute!==routeKey){stopHistoryReplay();historyRoute=routeKey;readHistoryUrl()}
  t=route.page==='detail'&&historyBounds?historyTime:AS_OF;
  renderOriginalProduct();
  if(route.page==='detail')renderHistoryControls();
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopHistoryReplay();if(route.page==='detail')render()}});
window.addEventListener('pagehide',stopHistoryReplay);
window.addEventListener('hashchange',()=>{stopHistoryReplay();if(route.page==='detail'){readHistoryUrl();render()}});
