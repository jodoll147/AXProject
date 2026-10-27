// Settings layout editor is an in-memory design prototype, never a server writer.
let layoutDraft=D.zones.map(z=>({...z})),layoutSelected=D.zones[0]?.zone_id||'',layoutSnap=true,layoutNotice='',layoutNoticeError=false;
const layoutDemoAudits=[];
function layoutChanges(){return layoutDraft.filter(z=>{const saved=D.zones.find(s=>s.zone_id===z.zone_id);return saved&&(z.x!==saved.x||z.y!==saved.y)})}
function designMapGeometry(zones,editing){
  const valid=zones.filter(z=>Number.isFinite(z.x)&&Number.isFinite(z.y));if(!valid.length)return null;
  const minX=Math.floor(Math.min(0,...valid.map(z=>z.x))/100)*100,minY=Math.floor(Math.min(0,...valid.map(z=>z.y))/100)*100;
  const maxX=Math.ceil((Math.max(...valid.map(z=>z.x))+280)/100)*100,maxY=Math.ceil((Math.max(...valid.map(z=>z.y))+180)/100)*100;
  const ox=editing?56:24,oy=editing?44:24;
  return {valid,minX,minY,maxX,maxY,ox,oy,width:maxX-minX+ox+20,height:maxY-minY+oy+24,sx:x=>ox+x-minX,sy:y=>oy+y-minY};
}
function designLayoutHTML(zones,editing=false,blockId=null){
  const g=designMapGeometry(zones,editing);if(!g)return '<div class="empty">표시할 구역 좌표가 없습니다.</div>';
  const {valid,minX,minY,maxX,maxY,ox,oy,width,height,sx,sy}=g;
  let ruler='';
  if(editing){
    const gridId='settings-layout-grid',ticks=[];
    for(let x=minX;x<=maxX;x+=100)ticks.push(`<line x1="${sx(x)}" y1="${oy}" x2="${sx(x)}" y2="${sy(maxY)}" stroke="#364653"/><text x="${sx(x)}" y="32" text-anchor="middle">${x}</text>`);
    for(let y=minY;y<=maxY;y+=100)ticks.push(`<line x1="${ox}" y1="${sy(y)}" x2="${sx(maxX)}" y2="${sy(y)}" stroke="#364653"/><text x="44" y="${sy(y)+4}" text-anchor="end">${y}</text>`);
    ruler=`<svg class="flat-ruler" width="${width}" height="${height}" role="img" aria-label="구역 편집 좌표. X 오른쪽, Y 아래쪽. 격자 20, 주 눈금 100."><defs><pattern id="${gridId}" width="20" height="20" x="${ox}" y="${oy}" patternUnits="userSpaceOnUse"><path d="M20 0 H0 V20" fill="none" stroke="#253440" stroke-width=".6"/></pattern></defs><rect x="${ox}" y="${oy}" width="${maxX-minX}" height="${maxY-minY}" fill="url(#${gridId})"/>${ticks.join('')}<path d="M${sx(maxX)} ${oy} H${ox} V${sy(maxY)}" fill="none" stroke="#718798" stroke-width="1.5"/><text x="${sx(maxX)-8}" y="16" text-anchor="end" class="axis-title">X →</text><text x="12" y="24" class="axis-title">Y ↓</text></svg>`;
  }
  const cards=valid.map(z=>{
    const left=sx(z.x),top=sy(z.y);
    if(!editing)return `<div class="flat-location" style="left:${left}px;top:${top}px">${zoneBox(z,blockId)}</div>`;
    const process=PROCS.find(p=>p.zone_id===z.zone_id),saved=D.zones.find(s=>s.zone_id===z.zone_id),changed=saved&&(z.x!==saved.x||z.y!==saved.y);
    return `<div class="flat-location layout-edit-card ${z.zone_id===layoutSelected?'chosen':''}" data-edit-zone="${esc(z.zone_id)}" tabindex="0" role="button" aria-label="${esc(z.zone_id)} ${esc(z.zone_name)} 선택 및 이동" aria-pressed="${z.zone_id===layoutSelected}" style="left:${left}px;top:${top}px"><div class="zbox run"><div class="zcontent"><span class="zt"><b>${esc(z.zone_id)} ${esc(process?.process_name||z.zone_name)}</b></span><span class="zs">${changed?'저장 전 변경':'저장된 위치'}</span><span class="hint">${esc(z.zone_name)}</span></div></div><span class="zone-coordinate">X ${z.x} · Y ${z.y}</span><i class="zone-anchor" aria-hidden="true"></i></div>`;
  }).join('');
  return `<div class="flat-scroll ${editing?'editor-scroll':''}"><div class="flat-map ${editing?'layout-edit-map':'layout-read-map'}" style="width:${width}px;height:${height}px">${ruler}${cards}</div></div>${editing?'<div class="flat-key"><span>구역 좌상단 ● = 저장 좌표</span><span>격자 20 · 주 눈금 100</span><span>X → 오른쪽 · Y ↓ 아래쪽</span></div>':'<p class="flat-note">교육용 개념 배치 · 실제 공장 도면 아님</p>'}`;
}
function renderLayoutSettings(refocus=null){
  const root=$('#pg-settings'),scroll=root.querySelector('.editor-scroll'),scrollLeft=scroll?.scrollLeft||0,scrollTop=scroll?.scrollTop||0;
  root.classList.add('layout-settings-view');document.title='조선 AX · Settings 디자인';
  const selected=layoutDraft.find(z=>z.zone_id===layoutSelected),saved=D.zones.find(z=>z.zone_id===layoutSelected),changes=layoutChanges();
  root.innerHTML=`<div class="vhead"><div><h2>Settings</h2><p>관리자 · 사용자 권한과 공정 배치 관리</p></div></div><nav class="layout-tabs" aria-label="Settings 메뉴"><button disabled>역할·계정 관리</button><button disabled>감사이력</button><button class="on" aria-current="page">공정 배치도 수정</button></nav><div class="layout-demo-note">관리자 화면 디자인 시안 · 저장은 현재 미리보기에서만 유지되며 새로고침하면 초기화됩니다. 원본 CSV와 서버 데이터는 변경되지 않습니다.</div><div class="layout-toolbar"><span class="source">적재 데이터 <b>zones</b> · ${layoutDraft.length}개 구역</span><span class="layout-pending ${changes.length?'':'clean'}" id="layout-pending">${changes.length?'저장 전 변경 '+changes.length+'건':'저장된 배치'}</span><button class="btn" id="layout-undo" ${changes.length?'':'disabled'}>변경 되돌리기</button><button class="btn accent" id="layout-save" ${changes.length?'':'disabled'}>배치 저장</button></div><div class="layout-editor-grid"><section class="card layout-canvas-panel"><div class="layout-canvas-head"><h3>배치 편집</h3><label class="layout-snap"><input id="layout-snap" type="checkbox" ${layoutSnap?'checked':''}>격자에 맞추기 · 20</label></div>${designLayoutHTML(layoutDraft,true)}<p class="editor-instructions">구역을 선택한 뒤 드래그하거나 오른쪽에서 좌표를 입력하세요. 방향키로도 이동할 수 있습니다. 저장하기 전에는 메인 배치가 바뀌지 않습니다.</p></section><aside class="card layout-inspector"><h3>선택한 구역</h3>${selected?`<div class="zone-id">${esc(selected.zone_id)}</div><div class="zone-name">${esc(selected.zone_name)}</div><form class="layout-coordinate-form" id="layout-coordinate-form"><label>X 좌표<input name="x" type="number" step="any" value="${selected.x}" required></label><label>Y 좌표<input name="y" type="number" step="any" value="${selected.y}" required></label><button class="btn" type="submit">좌표 적용</button></form><p class="small">좌표 적용은 편집 중인 배치에만 적용합니다. 상단의 배치 저장을 눌러 반영하세요.</p><div class="layout-change"><b>저장된 좌표 → 편집 좌표</b><p>(${saved.x}, ${saved.y}) → (${selected.x}, ${selected.y})</p></div>`:'<p class="hint">편집할 구역이 없습니다.</p>'}<p class="layout-status ${layoutNoticeError?'error':''}" role="status">${esc(layoutNotice)}</p></aside></div><section class="card layout-change-list"><header class="card-h"><h2>변경 내역</h2><span class="hint">저장 전 확인</span></header><div class="tbl-wrap"><table class="tbl"><thead><tr><th>구역</th><th>기존 X</th><th>기존 Y</th><th>변경 X</th><th>변경 Y</th></tr></thead><tbody>${changes.map(z=>{const old=D.zones.find(s=>s.zone_id===z.zone_id);return `<tr><td>${esc(z.zone_id)} ${esc(z.zone_name)}</td><td>${old.x}</td><td>${old.y}</td><td>${z.x}</td><td>${z.y}</td></tr>`}).join('')||'<tr><td colspan="5">아직 변경한 구역이 없습니다.</td></tr>'}</tbody></table></div></section>${layoutDemoAudits.length?`<p class="layout-preview-foot">시안 저장 기록 · 최근 변경 구역 ${layoutDemoAudits.at(-1).after.map(z=>esc(z.zone_id)).join(', ')} · 실제 감사 저장은 제품 적용 단계에서 연결합니다.</p>`:''}`;
  const newScroll=root.querySelector('.editor-scroll');if(newScroll){newScroll.scrollLeft=scrollLeft;newScroll.scrollTop=scrollTop}
  $('#layout-snap').onchange=e=>{layoutSnap=e.target.checked};
  $('#layout-undo').onclick=()=>{layoutDraft=D.zones.map(z=>({...z}));layoutNotice='저장된 배치로 되돌렸습니다.';layoutNoticeError=false;renderLayoutSettings()};
  $('#layout-save').onclick=()=>{
    const dirty=layoutChanges();if(!dirty.length)return;
    const before=dirty.map(z=>{const old=D.zones.find(s=>s.zone_id===z.zone_id);return {zone_id:old.zone_id,x:old.x,y:old.y}});
    for(const z of dirty){const target=D.zones.find(s=>s.zone_id===z.zone_id);target.x=z.x;target.y=z.y}
    layoutDemoAudits.push({before,after:dirty.map(z=>({zone_id:z.zone_id,x:z.x,y:z.y}))});layoutNotice='시안에 저장했습니다. 메인에서 배치를 확인하세요.';layoutNoticeError=false;renderLayoutSettings();
  };
  const form=$('#layout-coordinate-form');if(form)form.onsubmit=e=>{e.preventDefault();const x=Number(form.elements.x.value),y=Number(form.elements.y.value);if(!form.elements.x.value.trim()||!form.elements.y.value.trim()||!Number.isFinite(x)||!Number.isFinite(y)){layoutNotice='유효한 X, Y 좌표를 입력하세요.';layoutNoticeError=true;renderLayoutSettings();return}selected.x=x;selected.y=y;layoutNotice='편집 배치에 적용했습니다. 배치 저장을 눌러 반영하세요.';layoutNoticeError=false;renderLayoutSettings()};
  root.querySelectorAll('[data-edit-zone]').forEach(card=>{
    const id=card.dataset.editZone;
    card.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key))return;e.preventDefault();layoutSelected=id;if(e.key.startsWith('Arrow')){const z=layoutDraft.find(z=>z.zone_id===id),step=(layoutSnap?20:1)*(e.shiftKey?5:1);if(e.key==='ArrowLeft')z.x-=step;if(e.key==='ArrowRight')z.x+=step;if(e.key==='ArrowUp')z.y-=step;if(e.key==='ArrowDown')z.y+=step}layoutNotice='구역을 선택했습니다. 변경 후 배치 저장을 눌러 반영하세요.';layoutNoticeError=false;renderLayoutSettings(id)};
    card.onpointerdown=e=>{
      if(e.button!==0)return;e.preventDefault();layoutSelected=id;card.focus();card.setPointerCapture(e.pointerId);
      const zone=layoutDraft.find(z=>z.zone_id===id),startX=zone.x,startY=zone.y,clientX=e.clientX,clientY=e.clientY,map=card.parentElement,scale=map.getBoundingClientRect().width/map.offsetWidth;
      const geo=designMapGeometry(layoutDraft,true);let nextX=startX,nextY=startY,moved=false;
      card.classList.add('dragging');
      card.onpointermove=ev=>{const dx=(ev.clientX-clientX)/scale,dy=(ev.clientY-clientY)/scale;if(Math.abs(dx)+Math.abs(dy)<3&&!moved)return;moved=true;nextX=layoutSnap?Math.round((startX+dx)/20)*20:Math.round(startX+dx);nextY=layoutSnap?Math.round((startY+dy)/20)*20:Math.round(startY+dy);card.style.left=geo.sx(nextX)+'px';card.style.top=geo.sy(nextY)+'px';card.querySelector('.zone-coordinate').textContent=`X ${nextX} · Y ${nextY}`};
      const finish=cancel=>{card.onpointermove=card.onpointerup=card.onpointercancel=null;if(!cancel&&moved){zone.x=nextX;zone.y=nextY;layoutNotice='구역 위치를 변경했습니다. 배치 저장을 눌러 반영하세요.'}else layoutNotice='구역을 선택했습니다.';layoutNoticeError=false;renderLayoutSettings(id)};
      card.onpointerup=()=>finish(false);card.onpointercancel=()=>finish(true);
    };
  });
  if(refocus){const card=[...root.querySelectorAll('[data-edit-zone]')].find(c=>c.dataset.editZone===refocus);card?.focus({preventScroll:true})}
}
