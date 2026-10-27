import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const input = process.argv[2] || resolve(root, 'app/backend/local-data.json');
const data = JSON.parse(readFileSync(input, 'utf8'));
let html = readFileSync(resolve(root, 'work/screen_template.html'), 'utf8').replaceAll('\r\n','\n');
for(const [marker,files] of [['/*__PLAN_ACTUAL_STYLE__*/',['work/plan_actual_view.css']],['/*__PLAN_ACTUAL_SCRIPT__*/',['work/period_comparison.js','work/plan_actual_view.js']]]){
  if(!html.includes(marker))throw new Error('Comparison template marker missing: '+marker);
  html=html.replace(marker,files.map(file=>readFileSync(resolve(root,file),'utf8')).join('\n'));
}
html=html.replace('/*__LAYOUT_HISTORY_SCRIPT__*/',readFileSync(resolve(root,'work/history_state.js'),'utf8')).replace('/*__LAYOUT_HISTORY_STYLE__*/','');
const replace = (before, after) => {
  if (!html.includes(before)) throw new Error('Missing template anchor: ' + before.slice(0, 75));
  html = html.replace(before, after);
};
replace('const D=/*__DATA__*/null;', `const CURRENT_USER={name:'관리자 시안',role:'ADMIN',assignments:[]};
const CURRENT_PERMISSIONS=['read'];
const DATA_STATUS={ready:true,counts:{},requiredTables:[]};
const D=${JSON.stringify({ ...data, _spec: {} }).replaceAll('</', '<\\/')};`);

const layoutStart = html.indexOf('function layoutHTML(blockId){');
const layoutEnd = html.indexOf('function zoneBox(z,blockId){', layoutStart);
if (layoutStart < 0 || layoutEnd < 0) throw new Error('Layout functions not found');
html = html.slice(0, layoutStart) + `function layoutHTML(blockId){return designLayoutHTML(ZONE_ORDER,false,blockId)}
` + html.slice(layoutEnd);
replace('</style>', `
.review-bar{max-width:1520px;margin:16px auto 0;padding:12px 24px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--text-2);font-size:12px}
.review-bar b{color:var(--accent)}.review-bar .btn{height:34px;font-size:12px}.review-bar p{flex:1 1 340px;margin:0;line-height:1.5}.review-bar a{white-space:nowrap}
.review-scope{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0 0 16px;font-size:12px;color:var(--text-2)}.review-scope .btn{margin-left:auto}
.flat-scroll{overflow-x:auto;width:100%}.flat-map{position:relative;margin:auto;border:1px solid var(--line-2);border-radius:12px;background-color:#10171e;max-width:none;box-sizing:content-box}.flat-ruler{position:absolute;inset:0;pointer-events:none;overflow:visible}.flat-ruler text{fill:#a7b7c6;font:11px var(--mono)}.flat-ruler .axis-title{fill:var(--accent);font-size:12px;font-weight:700}.zone-coordinate{position:absolute;bottom:10px;right:10px;pointer-events:none;border:1px solid #3e6072;border-radius:5px;background:#152832;color:#9be7f5;font:600 10.5px var(--mono);padding:4px 6px;white-space:nowrap}.zone-anchor{position:absolute;left:-4px;top:-4px;width:8px;height:8px;background:var(--accent);border:2px solid #10171e;border-radius:50%;pointer-events:none}.flat-key{display:flex;gap:8px 20px;flex-wrap:wrap;margin-top:14px;color:var(--text-2);font-size:11px}.flat-key span{white-space:nowrap}
.flat-location{position:absolute;width:260px;height:160px}.flat-location .zbox{width:100%;height:160px;border:1px solid color-mix(in srgb,var(--c) 65%,var(--line-2));border-left:4px solid var(--c);border-radius:12px;background:linear-gradient(140deg,color-mix(in srgb,var(--c) 12%,var(--panel)),var(--panel));filter:none}
.flat-location .zbox:hover,.flat-location .zbox:focus-visible{transform:none;filter:none;box-shadow:0 0 0 2px var(--accent)}.flat-location .zcontent{position:static;display:flex;height:100%;padding:18px 14px;justify-content:flex-start;gap:14px}.flat-location .zt b{font-size:14px}.flat-location .zt small{font-size:10px}.flat-location .zs{font-size:12px;flex-wrap:wrap}.flat-location .zeq{display:flex;flex-direction:column;align-items:flex-start;gap:5px;margin-top:auto}.flat-location .zalert{right:10px;top:12px}.flat-location .zq{font-size:10.5px}.flat-note{margin:12px 0 0;color:var(--muted);font-size:11px}.flow-focus .lay-wrap{padding:18px 0 4px}
.history-design{margin-bottom:18px;padding:18px 20px;border:1px solid var(--line-2);border-radius:14px;background:var(--panel)}.history-design.past{border-color:#756039;background:linear-gradient(110deg,#231f18,var(--panel) 70%)}
.history-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.history-top .caption{font-size:12px;color:var(--text-2)}.history-top strong{font-size:17px;font-variant-numeric:tabular-nums}.history-top .btn{margin-left:auto}.history-badge{border-radius:6px;padding:5px 8px;background:#16343c;color:var(--accent);font-size:11px;font-weight:650}.past .history-badge{background:#3b2f1c;color:var(--hold)}
.history-controls{display:flex;align-items:end;flex-wrap:wrap;gap:18px;margin-top:20px;padding-top:18px;border-top:1px solid var(--line-2)}.history-controls label{display:flex;flex-direction:column;gap:10px;font-size:12px;color:var(--text-2)}.history-controls input,.history-controls select{height:40px;padding:8px 12px;border:1px solid var(--line-2);border-radius:8px;background:var(--panel-3);color:var(--text);font:inherit}.history-controls input[type=time]{min-width:150px}.history-controls .btn{height:40px}.history-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}.history-foot .hint{margin-left:auto}.history-slider{width:100%;margin-top:18px;accent-color:var(--accent)}.history-message{font-size:12px;color:var(--hold);margin:12px 0 0}.history-error{font-size:12px;color:var(--fault);margin-top:10px}.history-error:empty{display:none}.history-meta{font-size:11px;color:var(--muted);margin-top:12px}.history-axis{display:flex;justify-content:space-between;color:var(--muted);font:11px var(--mono)}
@media(max-width:680px){.review-bar{padding:12px 14px}.history-top strong{font-size:14px}.history-top .btn{margin-left:0}.history-controls{display:grid;grid-template-columns:1fr 1fr;gap:18px 12px}.history-controls input,.history-controls select{min-width:0!important;width:100%}.history-controls .btn{justify-content:center}.history-design{padding:16px}.history-foot .hint{margin-left:0}.review-scope .btn{margin-left:0}}
</style>`);
replace('</style>', readFileSync(resolve(root,'work/ui_layout_preview.css'),'utf8')+'\n</style>');
replace('<div class="view">', `<aside class="review-bar"><p><b>디자인 검토안</b> · 기존 화면 기반 / 샘플 데이터 / 서버 저장 없음</p></aside><div class="view">`);
const extension = readFileSync(resolve(root, 'work/ui_layout_preview.js'), 'utf8')+'\n'+readFileSync(resolve(root, 'work/ui_redesign_preview.js'), 'utf8');
replace('\nroute=parseRoute();render();\n</script>', '\n' + extension + '\nroute=parseRoute();render();\n</script>');
writeFileSync(resolve(root, 'outputs/조선_AX_화면_재설계.html'), html);
console.log('Updated outputs/조선_AX_화면_재설계.html');
