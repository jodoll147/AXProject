import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../period_comparison.js',import.meta.url),'utf8');
const compare=vm.runInNewContext(source+';buildPeriodComparison');
const ymd=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(ms);
const at=s=>Date.parse(s+'+09:00'),asOf=at('2026-09-16T12:00:00');
const process={process_id:'P03',unit:'m'};
const work=(id,unit='m',pid='P03')=>({work_order_id:id,process_id:pid,unit});
const plan=(id,date,qty,unit='m')=>({work_order_id:id,plan_date:date,planned_qty:qty,unit});
const actual=(id,end,qty,unit='m')=>({work_order_id:id,period_end_at:at(end),accepted_qty_delta:qty,unit});
const run=data=>compare(data,process,'2026-09-14','2026-09-18',asOf,ymd);

test('multiple works aggregate once, without mixing processes or work units',()=>{
  const result=run({work_orders:[work('A'),work('B'),work('C','m','P04'),work('D','piece')],production_plan:[plan('A','2026-09-14',100),plan('B','2026-09-15',50),plan('C','2026-09-15',900),plan('D','2026-09-15',900)],production_actual:[actual('A','2026-09-14T12:00',40),actual('B','2026-09-15T12:00',25),actual('C','2026-09-15T12:00',900),actual('D','2026-09-15T12:00',900)]});
  assert.equal(result.planTotal,150);assert.equal(result.actualTotal,65);assert.equal(result.workRows.length,2);assert.equal(result.excluded,1);
});

test('future plans stay visible without entering totals, future actuals are absent',()=>{
  const result=run({work_orders:[work('A'),work('B')],production_plan:[plan('A','2026-09-16',100),plan('B','2026-09-17',200)],production_actual:[actual('A','2026-09-16T12:00:00',62.5),actual('A','2026-09-16T12:00:01',500),actual('B','2026-09-17T12:00',200)]});
  assert.equal(result.planTotal,100);assert.equal(result.actualTotal,62.5);assert.equal(result.actualCount,1);assert.equal(result.days.find(d=>d.date==='2026-09-17').plan,200);assert.equal(result.days.find(d=>d.date==='2026-09-17').records,0);
});

test('actuals use KST end dates; independent plan and actual dates are retained',()=>{
  const data={work_orders:[work('A')],production_plan:[plan('A','2026-09-14',100)],production_actual:[actual('A','2026-09-15T00:00',25)]};
  const result=compare(data,process,'2026-09-15','2026-09-15',asOf,ymd);
  assert.equal(result.planCount,0);assert.equal(result.actualTotal,25);assert.equal(result.workRows[0].plan,null);assert.equal(result.days[0].date,'2026-09-15');
});

test('missing actual records remain distinct from recorded zero',()=>{
  const data={work_orders:[work('A')],production_plan:[plan('A','2026-09-16',0)],production_actual:[]};
  assert.equal(run(data).actualCount,0);assert.equal(run(data).comparable,false);
  data.production_actual=[actual('A','2026-09-16T12:00',0)];
  const result=run(data);assert.equal(result.actualCount,1);assert.equal(result.actualTotal,0);assert.equal(result.planCount,1);assert.equal(result.comparable,true);
});

test('incompatible units and nonfinite/negative quantities are excluded explicitly',()=>{
  const result=run({work_orders:[work('A')],production_plan:[plan('A','2026-09-16',100,'piece')],production_actual:[actual('A','2026-09-16T10:00',1,'piece'),actual('A','2026-09-16T10:00',Infinity),actual('A','2026-09-16T10:00',-1),actual('A','2026-09-16T10:00',NaN),actual('A','2026-09-16T12:00',10)]});
  assert.equal(result.excluded,5);assert.equal(result.actualTotal,10);assert.equal(result.planCount,0);
});

test('empty datasets and absent processes do not create rows or totals',()=>{
  const result=run({});assert.equal(result.days.length,0);assert.equal(result.planCount,0);assert.equal(result.actualCount,0);
  assert.equal(compare({work_orders:[work('A')]},undefined,'2026-09-14','2026-09-18',asOf,ymd).days.length,0);
});

test('achievement quantities over plan are not capped',()=>{
  const result=run({work_orders:[work('A')],production_plan:[plan('A','2026-09-16',100)],production_actual:[actual('A','2026-09-16T12:00',125)]});
  assert.equal(result.actualTotal/result.planTotal,1.25);
});

test('query date parsing accepts leap days and rejects invalid calendar dates and reversed ranges',()=>{
  const view=readFileSync(new URL('../plan_actual_view.js',import.meta.url),'utf8');
  const helpers=view.slice(view.indexOf('function isComparisonDate('),view.indexOf('function comparisonNav('));
  const context=vm.createContext({PROCS:[process],PROC:{P03:process},Q:{proc:'P03',from:'2026-09-18',to:'2026-09-14'},AS_OF:asOf,ymd});
  vm.runInContext(helpers,context);
  assert.equal(vm.runInContext("isComparisonDate('2024-02-29')",context),true);
  assert.equal(vm.runInContext("isComparisonDate('2026-02-29')",context),false);
  assert.equal(vm.runInContext("isComparisonDate('2026-09-31')",context),false);
  assert.equal(vm.runInContext('comparisonFiltersFromQuery().from',context),'2026-09-14');
});
