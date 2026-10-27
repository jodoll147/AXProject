const historyBounds=observationBounds(D);
let historyTime=historyBounds?.end??AS_OF,historyOpen=false,historyTimer=null,historySpeed=15,historyRoute='',historyNotice='';
const historyLocal=ms=>new Date(ms+9*36e5).toISOString().slice(0,19);
function stopHistoryReplay(){if(historyTimer)clearInterval(historyTimer);historyTimer=null}
function historyDayRange(){const start=dayStart(historyTime);return {start:Math.max(historyBounds.start,start),end:Math.min(historyBounds.end,start+864e5-1000)}}
function readHistoryUrl(){
 if(!historyBounds)return;
 const raw=new URLSearchParams(location.hash.split('?')[1]||'').get('asOf');
 if(!raw)return;
 const value=Date.parse(raw);
 if(!Number.isFinite(value)||value<historyBounds.start||value>historyBounds.end){historyTime=historyBounds.end;historyNotice='URL의 기준시각이 유효하지 않아 최신 기준으로 표시합니다.';return}
 historyTime=value;historyOpen=true;historyNotice='';
}
function writeHistoryUrl(replace=false){
 const [path,query]=location.hash.split('?'),params=new URLSearchParams(query||'');
 params.set('asOf',new Date(historyTime).toISOString());
 history[replace?'replaceState':'pushState'](null,'',path+'?'+params);
}
function setHistoryTime(value,replace=false){historyTime=value;historyNotice='';writeHistoryUrl(replace);render()}
function renderHistoryControls(){
 if(!historyBounds){$('#pg-detail').insertAdjacentHTML('afterbegin','<section class="history-design"><p>과거 조회 자료 없음 · 유효한 관측 기록이 없습니다.</p></section>');return}
 const past=historyTime<historyBounds.end;
  $('#pg-detail').insertAdjacentHTML('afterbegin',`<section class="history-design ${past?'past':''}" aria-label="상세 조회 기준시각"><div class="history-top"><span class="history-badge">${historyTimer?'재생 중':past?'과거 조회':'최신 기준'}</span><span class="caption">조회 기준</span><strong>${historyLocal(historyTime).replace('T',' ')} KST</strong><button class="btn sm" id="history-toggle">${historyOpen?'시간 선택 닫기':'과거 이력 조회'}</button></div>${historyOpen?`<div class="history-controls"><label>조회 날짜<input id="history-date" type="date" min="${ymd(historyBounds.start)}" max="${ymd(historyBounds.end)}" value="${ymd(historyTime)}"></label><label>조회 시각 · KST<input id="history-time" type="time" step="1" value="${historyLocal(historyTime).slice(11)}"></label><button class="btn accent" id="history-apply">시각 적용</button><button class="btn" id="history-play" ${historyTime>=historyBounds.end?'disabled':''}>${ic(historyTimer?'pause':'play')}${historyTimer?'일시정지':'재생'}</button><label>재생 간격<select id="history-speed">${[5,15,30].map(m=>`<option value="${m}" ${historySpeed===m?'selected':''}>1초마다 ${m}분</option>`).join('')}</select></label></div><p class="history-error" id="history-error" role="alert"></p><input class="history-slider" id="history-range" aria-label="상세 조회 기준시각 이동" type="range" min="${historyDayRange().start}" max="${historyDayRange().end}" value="${historyTime}" step="60000"><div class="history-axis"><span>${iso(historyDayRange().start)}</span><span>${iso(historyDayRange().end)}</span></div><div class="history-foot"><button class="btn sm" id="history-prev" ${historyTime<=historyBounds.start?'disabled':''}>15분 전</button><button class="btn sm" id="history-next" ${historyTime>=historyBounds.end?'disabled':''}>15분 후</button><button class="btn sm" id="history-latest" ${past?'':'disabled'}>최신 기준으로</button><span class="hint">선택 시각까지의 기록만 표시</span></div>`:''}<p class="history-meta">${past?'과거 기준입니다. 이후 실적·사건은 제외하며 최신 예상 완료값은 표시하지 않습니다.':'현재 보유한 데이터의 최신 기준입니다. 실제 현재 시각과 다를 수 있습니다.'}</p></section>`);

  if(historyNotice)$('#pg-detail .history-meta').textContent=historyNotice;
  const meta=$('#pg-detail .history-meta');meta.textContent+=' 현재 적재된 이력으로 재구성하며 당시 데이터 버전을 복원하는 기능은 아닙니다.';
  if(!historyBounds.snapshot)meta.textContent+=' 스냅샷 없음 · 관측 기록 기준입니다.';
  // Keep the selected time when moving among block/work/equipment details.
  $('#pg-detail').querySelectorAll('a[href]').forEach(a=>{if(/^#\/(wo|blk|eq)\//.test(a.getAttribute('href'))){const url=new URL(a.href);url.hash+='?asOf='+encodeURIComponent(new Date(historyTime).toISOString());a.href=url.href}});
  $('#history-toggle').onclick=()=>{stopHistoryReplay();historyOpen=!historyOpen;render()};
  if(!historyOpen)return;
  const apply=value=>{stopHistoryReplay();setHistoryTime(value)};
  $('#history-apply').onclick=()=>{const value=parseHistoryInput($('#history-date').value,$('#history-time').value,historyBounds);if(value===null){stopHistoryReplay();$('#history-error').textContent='허용 범위 내의 유효한 날짜와 시각을 선택하세요. 기존 조회는 유지됩니다.';return}apply(value)};
  $('#history-date').oninput=$('#history-time').oninput=()=>{stopHistoryReplay();$('#history-play').innerHTML=ic('play')+'재생';$('#pg-detail .history-badge').textContent=past?'과거 조회':'최신 기준'};
  $('#history-prev').onclick=()=>apply(historyStep(historyTime,-15,historyBounds));$('#history-next').onclick=()=>apply(historyStep(historyTime,15,historyBounds));$('#history-latest').onclick=()=>apply(historyBounds.end);
  $('#history-range').onchange=e=>apply(Number(e.target.value));
  $('#history-speed').onchange=e=>{historySpeed=Number(e.target.value)};
  $('#history-play').onclick=()=>{if(historyTimer){stopHistoryReplay();render();return}historyTimer=setInterval(()=>{const next=historyStep(historyTime,historySpeed,historyBounds);if(next===historyBounds.end)stopHistoryReplay();setHistoryTime(next,true)},1000);render()};
}
