import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({Date,Number,Math});vm.runInContext(readFileSync('work/history_state.js','utf8'),context);
const {observationBounds,parseHistoryInput,historyStep}=context;
const k=s=>Date.parse(s+'+09:00');
test('observation range uses all history types and snapshot cap, excluding plans/forecasts',()=>{
 const bounds=observationBounds({work_history:[{event_at:200}],production_actual:[{period_start_at:80,period_end_at:250}],rework:[{start_at:50,end_at:900}],equipment_snapshot:[{as_of:300}],work_orders:[{planned_start_at:1,forecast_end_at:9999}]});
 assert.deepEqual({...bounds},{start:50,end:300,snapshot:true});
 assert.equal(observationBounds({work_orders:[{planned_start_at:1}]}),null);
 assert.deepEqual({...observationBounds({incidents:[{opened_at:10,resolved_at:20}]})},{start:10,end:20,snapshot:false});
});
test('KST date and seconds validation preserve bounds and reject invalid inputs',()=>{
 const b={start:k('2026-09-16T08:00:00'),end:k('2026-09-16T12:00:00')};
 assert.equal(parseHistoryInput('2026-09-16','08:00:00',b),b.start);
 assert.equal(parseHistoryInput('2026-09-16','12:00:00',b),b.end);
 for(const [date,time] of [['2026-09-16','12:00:01'],['2026-09-16','07:59:59'],['','09:00'],['2026-02-30','09:00'],['2026-09-16','25:00']])assert.equal(parseHistoryInput(date,time,b),null);
});
test('playback and step actions clamp exactly to either range boundary',()=>{
 const b={start:100,end:1000000};assert.equal(historyStep(200,-15,b),b.start);assert.equal(historyStep(900000,15,b),b.end);assert.equal(historyStep(100,5,b),300100);
});
test('work state filters actuals, events and incident resolution by cutoff',()=>{
 const template=readFileSync('work/screen_template.html','utf8'),fn=template.slice(template.indexOf('function woAt(w){'),template.indexOf('function eqAt(e){'));
 const c=vm.createContext({incidentResolved:context.incidentResolved,HIS:{W:[{event_at:100,event_type:'START'},{event_at:300,event_type:'COMPLETE'}]},ACT:{W:[{period_end_at:200,accepted_qty_delta:4},{period_end_at:400,accepted_qty_delta:6}]},INC_BY_WO:{W:[{opened_at:250,resolved_at:350,category:'EQUIPMENT'}]},EVENT_STATUS:{START:'IN_PROGRESS',COMPLETE:'COMPLETED'},WO_LOOK:{IN_PROGRESS:['run','play','작업 중'],COMPLETED:['ok','check','완료']},CAT:{EQUIPMENT:{tone:'fault',icon:'wrench',label:'고장'}},t:200});
 vm.runInContext(fn,c);const w={work_order_id:'W',planned_qty:10,planned_end_at:500};
 let s=c.woAt(w);assert.equal(s.acc,4);assert.equal(s.incs.length,0);assert.equal(s.status,'IN_PROGRESS');
 c.t=300;s=c.woAt(w);assert.equal(s.acc,4);assert.equal(s.open.length,1);assert.equal(s.status,'COMPLETED');
 c.t=350;assert.equal(c.woAt(w).open.length,0);
});
test('missing resolution timestamps do not resolve open incidents',()=>{
 assert.equal(context.incidentResolved({resolved_at:null},100),false);
 assert.equal(context.incidentResolved({},100),false);
 assert.equal(context.incidentResolved({resolved_at:100},100),true);
});
test('equipment uses half-open intervals and never fills ambiguous gaps with latest state',()=>{
 const template=readFileSync('work/screen_template.html','utf8'),fn=template.slice(template.indexOf('function eqAt(e){'),template.indexOf('const eqLook='));
 const c=vm.createContext({fresh:()=>{},memo:{eq:new Map()},t:200,AS_OF:500,SNAP:{E:{status:'FAULT'}},INTV:{E:[{start_at:100,end_at:200,status:'IDLE'},{start_at:200,end_at:300,status:'RUNNING'}]}});
 vm.runInContext(fn,c);assert.equal(c.eqAt({equipment_id:'E'}).status,'RUNNING');
 c.t=300;c.memo.eq.clear();assert.equal(c.eqAt({equipment_id:'E'}).status,null);
 c.t=250;c.INTV.E.push({start_at:220,end_at:280,status:'FAULT'});c.memo.eq.clear();assert.equal(c.eqAt({equipment_id:'E'}).status,null);
 c.t=500;c.memo.eq.clear();assert.equal(c.eqAt({equipment_id:'E'}).status,'FAULT');
});
