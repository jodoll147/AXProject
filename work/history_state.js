// Observation bounds exclude plans and forecast values. All dates are normalized milliseconds.
function observationBounds(data){
  const values=[];
  for(const [table,fields] of Object.entries({work_history:['event_at'],production_actual:['period_start_at','period_end_at'],incidents:['opened_at','resolved_at'],equipment_intervals:['start_at','end_at'],inspections:['inspected_at'],rework:['start_at','end_at'],equipment_snapshot:['as_of']}))
    for(const row of data[table]||[])for(const field of fields)if(Number.isFinite(row[field]))values.push(row[field]);
  const snapshots=(data.equipment_snapshot||[]).map(s=>s.as_of).filter(Number.isFinite);
  if(!values.length)return null;
  const end=Math.max(...(snapshots.length?snapshots:values)),eligible=values.filter(v=>v<=end);
  return {start:Math.min(...eligible),end,snapshot:!!snapshots.length};
}
function parseHistoryInput(date,time,bounds){
  if(!bounds||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}(:\d{2})?$/.test(time))return null;
  const value=Date.parse(date+'T'+time+'+09:00');
  if(!Number.isFinite(value)||new Date(value+9*36e5).toISOString().slice(0,10)!==date||value<bounds.start||value>bounds.end)return null;
  return value;
}
function historyStep(value,minutes,bounds){return Math.max(bounds.start,Math.min(bounds.end,value+minutes*60000))}

function incidentResolved(i,at){return Number.isFinite(i.resolved_at)&&i.resolved_at<=at}
