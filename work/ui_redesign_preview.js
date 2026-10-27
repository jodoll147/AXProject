// Independent design-only interactions. Product source and APIs are not changed.
window.fetch=()=>Promise.reject(new Error('디자인 시안에서는 서버 요청을 실행하지 않습니다.'));
let designTime=AS_OF,historyOpen=false,designTimer=null,designRoute='',designSpeed=15;
const stopDesignReplay=()=>{if(designTimer)clearInterval(designTimer);designTimer=null};
const designLocal=ms=>new Date(ms+9*36e5).toISOString().slice(0,19);
const originalDesignRender=render;
render=function(){
  if(designRoute!==location.hash){stopDesignReplay();designRoute=location.hash}
  t=route.page==='detail'?designTime:AS_OF;
  if(route.page==='settings'){renderChrome();renderLayoutSettings();return;}
  if(!['home','query','detail'].includes(route.page)){
    renderChrome();document.querySelector('.page.on').innerHTML='<section class="card"><h2>이번 디자인 검토 범위에 포함되지 않은 화면입니다.</h2><p>상단 조회 탭에서 대상을 선택하세요.</p></section>';return;
  }
  originalDesignRender();
  if(route.page==='home'){
    const head=$('#pg-home .vhead');head.insertAdjacentHTML('afterend',`<div class="review-scope"><span>데이터 기준 <b>${iso(AS_OF)} KST</b></span><span>메인에서는 최신 기준의 운영현황을 확인합니다.</span></div>`);
    return;
  }
  if(route.page==='query'){
    if(Q.view!=='compare')$('#pg-query').insertAdjacentHTML('afterbegin','<div class="review-scope">블록·작업·설비를 선택한 뒤 상세 화면에서 과거 이력을 조회할 수 있습니다.</div>');return;
  }
  const past=designTime<AS_OF;
  $('#pg-detail').insertAdjacentHTML('afterbegin',`<section class="history-design ${past?'past':''}" aria-label="상세 조회 기준시각"><div class="history-top"><span class="history-badge">${designTimer?'재생 중':past?'과거 조회':'최신 기준'}</span><span class="caption">조회 기준</span><strong>${designLocal(designTime).replace('T',' ')} KST</strong><button class="btn sm" id="history-toggle">${historyOpen?'시간 선택 닫기':'과거 이력 조회'}</button></div>${historyOpen?`<div class="history-controls"><label>조회 날짜<input id="history-date" type="date" min="${ymd(START)}" max="${ymd(AS_OF)}" value="${ymd(designTime)}"></label><label>조회 시각 · KST<input id="history-time" type="time" step="1" value="${designLocal(designTime).slice(11)}"></label><button class="btn accent" id="history-apply">시각 적용</button><button class="btn" id="history-play" ${designTime>=AS_OF?'disabled':''}>${ic(designTimer?'pause':'play')}${designTimer?'일시정지':'재생'}</button><label>재생 간격<select id="history-speed">${[5,15,30].map(m=>`<option value="${m}" ${designSpeed===m?'selected':''}>1초마다 ${m}분</option>`).join('')}</select></label></div><p class="history-error" id="history-error" role="alert"></p><input class="history-slider" id="history-range" aria-label="상세 조회 기준시각 이동" type="range" min="${START}" max="${AS_OF}" value="${designTime}" step="60000"><div class="history-axis"><span>${iso(START)}</span><span>${iso(AS_OF)}</span></div><div class="history-foot"><button class="btn sm" id="history-prev" ${designTime<=START?'disabled':''}>15분 전</button><button class="btn sm" id="history-next" ${designTime>=AS_OF?'disabled':''}>15분 후</button><button class="btn sm" id="history-latest" ${past?'':'disabled'}>최신 기준으로</button><span class="hint">선택 시각까지의 기록만 표시</span></div>`:''}<p class="history-meta">${past?'과거 기준입니다. 이후 실적·사건은 제외하며 최신 예상 완료값은 표시하지 않습니다.':'현재 보유한 데이터의 최신 기준입니다. 실제 현재 시각과 다를 수 있습니다.'}</p></section>`);
  $('#history-toggle').onclick=()=>{stopDesignReplay();historyOpen=!historyOpen;render()};
  if(!historyOpen)return;
  const apply=(value)=>{stopDesignReplay();designTime=Math.max(START,Math.min(AS_OF,value));render()};
  $('#history-apply').onclick=()=>{const value=kst($('#history-date').value+'T'+$('#history-time').value);if(!Number.isFinite(value)||value<START||value>AS_OF){stopDesignReplay();$('#history-error').textContent=`${iso(START)} ~ ${iso(AS_OF)} 사이의 시각을 선택하세요.`;return}apply(value)};
  $('#history-date').oninput=$('#history-time').oninput=()=>stopDesignReplay();
  $('#history-prev').onclick=()=>apply(designTime-15*60000);$('#history-next').onclick=()=>apply(designTime+15*60000);$('#history-latest').onclick=()=>apply(AS_OF);
  $('#history-range').onchange=()=>apply(Number($('#history-range').value));
  $('#history-speed').onchange=()=>{designSpeed=Number($('#history-speed').value)};
  $('#history-play').onclick=()=>{if(designTimer){stopDesignReplay();render();return}designTimer=setInterval(()=>{designTime=Math.min(AS_OF,designTime+designSpeed*60000);if(designTime===AS_OF)stopDesignReplay();render()},1000);render()};
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopDesignReplay();if(route.page==='detail')render()}});
document.querySelector('.topnav .right').innerHTML='<span class="hint">화면 디자인 시안</span>';
