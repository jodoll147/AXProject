// Read-only aggregation. Plans use their KST calendar date; actuals use period end.
function buildPeriodComparison(data, process, from, to, asOf, dateOf){
  const cutoff=dateOf(asOf),daysByDate=new Map(),workRows=[];
  let excluded=0;
  const validQty=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const dayFor=date=>{if(!daysByDate.has(date))daysByDate.set(date,{date,plan:0,plans:0,actual:0,records:0});return daysByDate.get(date)};
  const plans=new Map((data.production_plan||[]).map(p=>[p.work_order_id,p]));
  const actuals=new Map();
  for(const a of data.production_actual||[]){if(!actuals.has(a.work_order_id))actuals.set(a.work_order_id,[]);actuals.get(a.work_order_id).push(a)}
  for(const w of (data.work_orders||[]).filter(w=>process&&w.process_id===process.process_id)){
    if(w.unit!==process.unit){excluded++;continue;}
    const candidate=plans.get(w.work_order_id),inRange=candidate&&candidate.plan_date>=from&&candidate.plan_date<=to;
    const plan=inRange&&candidate.unit===process.unit&&validQty(candidate.planned_qty)?candidate:null;
    if(inRange&&!plan)excluded++;
    if(plan){const day=dayFor(plan.plan_date);day.plan+=plan.planned_qty;day.plans++;}
    let total=0,count=0;
    for(const a of actuals.get(w.work_order_id)||[]){
      if(!Number.isFinite(a.period_end_at)){excluded++;continue;}
      if(a.period_end_at>asOf)continue;
      const date=dateOf(a.period_end_at);if(date<from||date>to)continue;
      if(a.unit!==process.unit||!validQty(a.accepted_qty_delta)){excluded++;continue;}
      const day=dayFor(date);day.actual+=a.accepted_qty_delta;day.records++;total+=a.accepted_qty_delta;count++;
    }
    if(plan||count)workRows.push({w,plan,actual:total,records:count});
  }
  const days=[...daysByDate.values()].sort((a,b)=>a.date.localeCompare(b.date)),observed=days.filter(d=>d.date<=cutoff);
  const planTotal=observed.reduce((s,d)=>s+d.plan,0),planCount=observed.reduce((s,d)=>s+d.plans,0),actualTotal=observed.reduce((s,d)=>s+d.actual,0),actualCount=observed.reduce((s,d)=>s+d.records,0);
  return {days,workRows,excluded,planTotal,planCount,actualTotal,actualCount,comparable:planCount>0&&actualCount>0};
}
