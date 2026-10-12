import { useMemo, useState } from 'react'
import {
  AlertTriangle, CalendarDays, CheckCircle2, Circle, Clock3, Flame,
  Layers3, Package, Paintbrush, Ruler, Scissors, Search, Settings2,
  ShieldAlert, Ship, Truck, Wrench,
} from 'lucide-react'
import './QueryView.css'

const toTime = value => value ? new Date(`${String(value).slice(0, 16)}:00+09:00`).getTime() : 0
const datePart = value => String(value || '').slice(0, 10)
const when = (value, today) => {
  if (!value) return '—'
  const text = String(value)
  return datePart(text) === today ? text.slice(11, 16) : `${Number(text.slice(5, 7))}/${Number(text.slice(8, 10))} ${text.slice(11, 16)}`
}
const duration = ms => {
  const minutes = Math.max(0, Math.round(ms / 60000))
  return minutes < 120 ? `${minutes}분` : minutes % 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes / 60}시간`
}
const percent = fraction => fraction == null ? '—' : `${Math.round(fraction * 1000) / 10}%`
const category = {
  EQUIPMENT: { label: '설비 고장', tone: 'danger', Icon: Wrench },
  MATERIAL: { label: '자재 대기', tone: 'warning', Icon: Package },
  QUALITY: { label: '재검사 대기', tone: 'purple', Icon: ShieldAlert },
}
const status = {
  COMPLETED: { label: '완료', tone: 'success', Icon: CheckCircle2 },
  IN_PROGRESS: { label: '작업 중', tone: 'working', Icon: Circle },
  BLOCKED: { label: '보류', tone: 'warning', Icon: AlertTriangle },
  PLANNED: { label: '대기', tone: 'neutral', Icon: Clock3 },
}
const equipmentStatus = {
  RUNNING: ['가동', 'working'], IDLE: ['대기', 'neutral'],
  FAULT: ['고장', 'danger'], MAINTENANCE: ['점검', 'warning'], OFFSHIFT: ['비가동', 'neutral'],
}
const processIcons = [Scissors, Layers3, Flame, Ruler, Paintbrush, Truck]
const tabs = [
  ['work', '작업(블록)', Layers3], ['equipment', '설비', Settings2],
  ['incident', '사건', AlertTriangle], ['delay', '생산 지연', Clock3],
]
const includes = (value, term) => String(value || '').toLowerCase().includes(term)
const compactHours = ms => `${Math.round(ms / 360000) / 10}h`

function Tone({ tone = 'neutral', Icon, children }) {
  return <span className={`q-tone ${tone}`}>{Icon && <Icon size={13} />}{children}</span>
}

function Progress({ value, max = 1, label, tone = 'success' }) {
  return <span className={`q-progress ${tone}`}><span className="q-progress-track"><i style={{ width: `${Math.min(100, value / max * 100)}%` }} /></span><span>{label}</span></span>
}

function ProcessStrip({ orders, processes, filtered }) {
  return <span className="q-process-strip">{processes.map((process, index) => {
    const order = orders.find(item => item.process_id === process.process_id)
    const incident = order?.open[0]
    const tone = incident ? category[incident.category]?.tone : status[order?.status]?.tone || 'neutral'
    const Icon = processIcons[index] || Circle
    return <span key={process.process_id} className={`q-process-cell ${tone}${filtered && order?.matched ? ' matched' : ''}`} title={`${process.process_name} · ${incident ? category[incident.category]?.label : status[order?.status]?.label || '자료 없음'}${order?.overdue ? ' · 기한 지연' : ''}`}><Icon size={14} /></span>
  })}</span>
}

function WorkTable({ rows, model, processes, filtered, openDetail }) {
  const groups = model.data.vessels.map(vessel => ({ vessel, rows: rows.filter(row => row.block.vessel_id === vessel.vessel_id) })).filter(group => group.rows.length)
  return <table className="q-table q-work-table"><thead><tr><th>블록</th><th>공정 진행 (절단 → 이송)</th><th>현재 공정</th><th>진척</th><th>문제</th><th>목표 이송</th>{filtered && <th>해당 작업</th>}</tr></thead><tbody>{groups.map(group => <FragmentGroup key={group.vessel.vessel_id} group={group} processes={processes} filtered={filtered} today={model.day} openDetail={openDetail} />)}</tbody></table>
}

function FragmentGroup({ group, processes, filtered, today, openDetail }) {
  return <>
    <tr className="q-group"><td colSpan={filtered ? 7 : 6}><Ship size={15} /> {group.vessel.vessel_name}<span>{group.rows.length}블록</span></td></tr>
    {group.rows.map(({ block, orders, hits }) => {
      const complete = orders.filter(item => item.status === 'COMPLETED').length
      const current = orders.find(item => item.status === 'IN_PROGRESS' || item.status === 'BLOCKED')
      const next = orders.find(item => item.status === 'PLANNED')
      const issues = orders.flatMap(item => item.open)
      const currentInfo = current?.open[0] ? category[current.open[0].category] : status[current?.status]
      return <tr key={block.block_id} className="q-clickable" onClick={() => openDetail('block', block.block_id)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') openDetail('block', block.block_id) }}>
        <td className="q-id">{block.block_id}</td>
        <td><ProcessStrip orders={orders} processes={processes} filtered={filtered} /></td>
        <td><span className="q-current">{current ? <><Tone tone={currentInfo?.tone} Icon={currentInfo?.Icon}>{currentInfo?.label}</Tone><span>{processes.find(process => process.process_id === current.process_id)?.process_name}</span></> : complete === orders.length ? <Tone tone="success" Icon={CheckCircle2}>이송 완료</Tone> : <><Tone Icon={Clock3}>대기</Tone><span>다음 {processes.find(process => process.process_id === next?.process_id)?.process_name} {when(next?.planned_start_at, today)}</span></>}</span></td>
        <td><Progress value={complete} max={orders.length} label={`${complete}/${orders.length}`} /></td>
        <td><span className="q-issues">{issues.length ? issues.map(issue => <Tone key={issue.incident_id} tone={category[issue.category]?.tone} Icon={category[issue.category]?.Icon}>{issue.incident_id}</Tone>) : orders.some(item => item.overdue) ? <Tone tone="warning">지연</Tone> : '—'}</span></td>
        <td>{when(block.target_transfer_at, today)}</td>
        {filtered && <td>{hits.length}건</td>}
      </tr>
    })}
  </>
}

function EquipmentTable({ rows, model, from, to, openDetail }) {
  const start = from ? toTime(`${from}T00:00`) : Math.min(...model.data.work_history.map(row => toTime(row.event_at)))
  const end = Math.min(model.at, to ? toTime(`${to}T23:59`) : model.at)
  return <table className="q-table"><thead><tr><th>상태</th><th>설비</th><th>설비명</th><th>공정</th><th>점유 작업</th><th>점유율</th><th>가동</th><th>고장</th><th>점검</th><th>관련 사건</th></tr></thead><tbody>{rows.map(equipment => {
    const snapshot = model.snapshots[equipment.equipment_id]
    const [label, tone] = equipmentStatus[snapshot?.status] || ['자료 없음', 'neutral']
    const totals = {}
    for (const interval of model.data.equipment_intervals.filter(row => row.equipment_id === equipment.equipment_id)) {
      const elapsed = Math.max(0, Math.min(toTime(interval.end_at), end) - Math.max(toTime(interval.start_at), start))
      if (elapsed && interval.status !== 'OFFSHIFT') totals[interval.status] = (totals[interval.status] || 0) + elapsed
    }
    const operating = Object.values(totals).reduce((sum, item) => sum + item, 0)
    const related = model.incidents.filter(item => item.equipment_id === equipment.equipment_id && toTime(item.opened_at) <= end).map(item => item.incident_id)
    return <tr key={equipment.equipment_id} className="q-clickable" onClick={() => openDetail('equipment', equipment.equipment_id)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') openDetail('equipment', equipment.equipment_id) }}><td><Tone tone={tone}>{label}</Tone></td><td className="q-id">{equipment.equipment_id}</td><td>{equipment.equipment_name}</td><td>{model.processes[equipment.process_id]?.process_name}</td><td className="q-id">{snapshot?.work_order_id || '—'}</td><td>{percent(operating ? (totals.RUNNING || 0) / operating : null)}</td><td>{compactHours(totals.RUNNING || 0)}</td><td>{compactHours(totals.FAULT || 0)}</td><td>{compactHours(totals.MAINTENANCE || 0)}</td><td>{related.join(', ') || '—'}</td></tr>
  })}</tbody></table>
}

function IncidentTable({ rows, model, openDetail }) {
  return <table className="q-table"><thead><tr><th>상태</th><th>사건</th><th>구분</th><th>호선명</th><th>블록</th><th>작업지시</th><th>설비</th><th>발생</th><th>해소·경과</th><th>담당</th><th>내용</th></tr></thead><tbody>{rows.map(incident => {
    const order = model.byId[incident.work_order_id]
    const resolved = incident.resolved_at && toTime(incident.resolved_at) <= model.at
    const info = category[incident.category]
    return <tr key={incident.incident_id} className="q-clickable" onClick={() => openDetail('work', incident.work_order_id)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') openDetail('work', incident.work_order_id) }}><td><Tone tone={resolved ? 'success' : info?.tone}>{resolved ? '해소' : '미해소'}</Tone></td><td className="q-id">{incident.incident_id}</td><td><Tone tone={info?.tone} Icon={info?.Icon}>{info?.label}</Tone></td><td>{model.vessels[order?.vessel_id]?.vessel_name}</td><td className="q-id">{order?.block_id}</td><td className="q-id">{incident.work_order_id}</td><td className="q-id">{incident.equipment_id || '—'}</td><td>{when(incident.opened_at, model.day)}</td><td>{resolved ? `${when(incident.resolved_at, model.day)} (${duration(toTime(incident.resolved_at) - toTime(incident.opened_at))})` : `${duration(model.at - toTime(incident.opened_at))} 경과`}</td><td>{incident.owner_team}</td><td className="q-description">{incident.summary}</td></tr>
  })}</tbody></table>
}

function DelayTable({ rows, model, openDetail }) {
  return <table className="q-table"><thead><tr><th>구분</th><th>작업지시</th><th>호선명</th><th>블록</th><th>공정</th><th>계획 종료</th><th>완료·예상</th><th>지연</th><th>진척</th><th>원인</th></tr></thead><tbody>{rows.map(order => {
    const end = order.status === 'COMPLETED' ? toTime(order.history.at(-1)?.event_at) : model.at
    const completedLate = order.status === 'COMPLETED'
    const issue = order.open[0]
    const info = issue ? category[issue.category] : status[order.status]
    return <tr key={order.work_order_id} className="q-clickable" onClick={() => openDetail('work', order.work_order_id)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') openDetail('work', order.work_order_id) }}><td><Tone tone={completedLate ? 'success' : info?.tone} Icon={completedLate ? CheckCircle2 : info?.Icon}>{completedLate ? '완료 지연' : info?.label}</Tone></td><td className="q-id">{order.work_order_id}</td><td>{model.vessels[order.vessel_id]?.vessel_name}</td><td className="q-id">{order.block_id}</td><td>{model.processes[order.process_id]?.process_name}</td><td>{when(order.planned_end_at, model.day)}</td><td>{completedLate ? when(order.history.at(-1)?.event_at, model.day) : !issue && order.forecast_end_at ? `예상 ${when(order.forecast_end_at, model.day)}` : '미정'}</td><td>{end > toTime(order.planned_end_at) ? duration(end - toTime(order.planned_end_at)) : '마감 도달'}</td><td><Progress value={order.progress} label={percent(order.progress)} tone={info?.tone} /></td><td><span className="q-issues">{order.incidents.length ? order.incidents.map(incident => <Tone key={incident.incident_id} tone={category[incident.category]?.tone}>{incident.incident_id}</Tone>) : '—'}</span></td></tr>
  })}</tbody></table>
}

export default function QueryView({ model, vessel, setVessel, query, setQuery, queryKind, setQueryKind, openDetail }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const processes = useMemo(() => [...model.data.processes].sort((a, b) => a.sequence_no - b.sequence_no), [model])
  const searchTerm = query.trim().toLowerCase()
  const inRange = value => (!from || datePart(value) >= from) && (!to || datePart(value) <= to)
  const searchHit = (...values) => !searchTerm || values.some(value => includes(value, searchTerm))
  const selectedVessel = id => vessel === 'all' || vessel === id
  const fromDate = model.data.work_history.map(row => datePart(row.event_at)).sort()[0]
  const endDate = model.data.work_orders.map(row => datePart(row.planned_end_at)).sort().at(-1)

  const rows = queryKind === 'work'
    ? model.data.blocks.filter(block => selectedVessel(block.vessel_id)).map(block => {
      const orders = processes.map(process => model.work.find(item => item.block_id === block.block_id && item.process_id === process.process_id)).filter(Boolean)
      const vesselName = model.vessels[block.vessel_id]?.vessel_name
      const broadHit = searchHit(block.block_id, block.block_name, vesselName) && !!searchTerm && [block.block_id, block.block_name, vesselName].some(value => includes(value, searchTerm))
      const hits = orders.filter(order => inRange(order.planned_start_at) && (broadHit || searchHit(order.work_order_id, order.equipment_id, model.processes[order.process_id]?.process_name, order.team_id)))
      return { block, orders: orders.map(order => ({ ...order, matched: hits.includes(order) })), hits }
    }).filter(row => row.hits.length)
    : queryKind === 'equipment'
      ? model.data.equipment.filter(item => searchHit(item.equipment_id, item.equipment_name, model.processes[item.process_id]?.process_name))
      : queryKind === 'incident'
        ? model.incidents.filter(item => selectedVessel(model.byId[item.work_order_id]?.vessel_id) && inRange(item.opened_at) && searchHit(item.incident_id, item.work_order_id, model.byId[item.work_order_id]?.block_id, item.equipment_id, item.summary, item.owner_team)).sort((a, b) => Number(Boolean(a.resolved_at && toTime(a.resolved_at) <= model.at)) - Number(Boolean(b.resolved_at && toTime(b.resolved_at) <= model.at)) || toTime(b.opened_at) - toTime(a.opened_at))
        : model.work.filter(item => selectedVessel(item.vessel_id) && toTime(item.planned_end_at) <= model.at && inRange(item.planned_end_at) && searchHit(item.work_order_id, item.block_id, item.equipment_id, model.vessels[item.vessel_id]?.vessel_name) && (item.overdue || item.status === 'COMPLETED' && toTime(item.history.at(-1)?.event_at) > toTime(item.planned_end_at))).sort((a, b) => Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED') || toTime(a.planned_end_at) - toTime(b.planned_end_at))

  const dateLabel = { work: '계획일', equipment: '집계 기간', incident: '발생일', delay: '계획 종료일' }[queryKind]
  const title = { work: '작업(블록)', equipment: '설비', incident: '사건', delay: '생산 지연' }[queryKind]
  const filtered = Boolean(from || to || searchTerm)
  const chooseTab = kind => { setQueryKind(kind); setQuery('') }
  return <div className="query-view">
    <div className="query-title"><h1>조회</h1><p>호선명·날짜·대상을 골라 목록으로 확인 · 작업은 블록 단위로 묶어 표시 · 행을 누르면 상세</p></div>
    <div className="query-filter">
      <div className="query-field"><label>조회 대상</label><div className="query-tabs">{tabs.map(([kind, label, Icon]) => <button key={kind} type="button" className={queryKind === kind ? 'active' : ''} onClick={() => chooseTab(kind)}><Icon size={15} />{label}</button>)}</div></div>
      <div className="query-field"><label htmlFor="query-vessel">호선명</label><select id="query-vessel" value={vessel} disabled={queryKind === 'equipment'} onChange={event => setVessel(event.target.value)}><option value="all">전체 호선</option>{model.data.vessels.map(item => <option value={item.vessel_id} key={item.vessel_id}>{item.vessel_name}</option>)}</select></div>
      <div className="query-field query-dates"><label>{dateLabel}</label><div><input aria-label="시작일" type="date" value={from} min={fromDate} max={endDate} onChange={event => setFrom(event.target.value)} /><span>~</span><input aria-label="종료일" type="date" value={to} min={fromDate} max={endDate} onChange={event => setTo(event.target.value)} /></div></div>
      <div className="query-field query-presets"><label>기간 선택</label><div><button type="button" onClick={() => { setFrom(model.day); setTo(model.day) }}>오늘</button><button type="button" onClick={() => { setFrom(''); setTo('') }}>전체 기간</button></div></div>
      <div className="query-field query-search"><label htmlFor="query-text">검색</label><div><Search size={15} /><input id="query-text" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="작업지시·블록·설비·사건 번호" /></div></div>
    </div>
    <div className="query-results-title"><h2>{title} 목록</h2><span>{rows.length}{queryKind === 'work' ? '블록' : '건'}</span></div>
    <div className="query-table-wrap">{rows.length === 0 ? <div className="query-empty">조건에 맞는 결과가 없습니다.</div> : queryKind === 'work' ? <WorkTable rows={rows} model={model} processes={processes} filtered={filtered} openDetail={openDetail} /> : queryKind === 'equipment' ? <EquipmentTable rows={rows} model={model} from={from} to={to} openDetail={openDetail} /> : queryKind === 'incident' ? <IncidentTable rows={rows} model={model} openDetail={openDetail} /> : <DelayTable rows={rows} model={model} openDetail={openDetail} />}</div>
  </div>
}

export function BlockDetail({ block, model, openDetail }) {
  if (!block) return <section className="panel">블록을 찾을 수 없습니다.</section>
  const orders = [...model.work.filter(item => item.block_id === block.block_id)].sort((a, b) => model.processes[a.process_id].sequence_no - model.processes[b.process_id].sequence_no)
  const complete = orders.filter(item => item.status === 'COMPLETED').length
  const current = orders.find(item => item.status === 'IN_PROGRESS' || item.status === 'BLOCKED')
  const issues = orders.flatMap(item => item.open)
  return <><div className="page-heading"><div><p className="eyebrow">BLOCK · {block.block_id}</p><h1>{block.block_id} · {block.block_name}</h1><p>{model.vessels[block.vessel_id]?.vessel_name} · 목표 이송 {when(block.target_transfer_at, model.day)}</p></div><Tone tone={issues.length ? 'danger' : complete === orders.length ? 'success' : 'working'}>{issues.length ? `미해소 사건 ${issues.length}건` : complete === orders.length ? '이송 완료' : '진행 중'}</Tone></div><div className="block-summary"><div><small>공정 완료</small><strong>{complete}/{orders.length}</strong></div><div><small>현재 공정</small><strong>{current ? model.processes[current.process_id]?.process_name : complete === orders.length ? '이송 완료' : '대기'}</strong></div><div><small>미해소 사건</small><strong>{issues.length}건</strong></div><div><small>목표 이송</small><strong>{when(block.target_transfer_at, model.day)}</strong></div></div><section className="panel"><h2>공정별 작업</h2><div className="query-table-wrap"><table className="q-table"><thead><tr><th>공정</th><th>작업지시</th><th>설비</th><th>계획 시작</th><th>계획 종료</th><th>진척</th><th>상태</th><th>문제</th></tr></thead><tbody>{orders.map(item => { const issue = item.open[0]; const info = issue ? category[issue.category] : status[item.status]; return <tr key={item.work_order_id} className="q-clickable" onClick={() => openDetail('work', item.work_order_id)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') openDetail('work', item.work_order_id) }}><td>{model.processes[item.process_id]?.process_name}</td><td className="q-id">{item.work_order_id}</td><td className="q-id">{item.equipment_id}</td><td>{when(item.planned_start_at, model.day)}</td><td>{when(item.planned_end_at, model.day)}</td><td><Progress value={item.progress} label={percent(item.progress)} /></td><td><Tone tone={info?.tone} Icon={info?.Icon}>{info?.label}</Tone></td><td>{item.open.map(problem => problem.incident_id).join(', ') || (item.overdue ? '지연' : '—')}</td></tr> })}</tbody></table></div></section></>
}
