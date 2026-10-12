import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, Boxes, CalendarCheck, CheckCircle2, ClipboardList, Clock3, Database, FileText, Hammer, Layers3, Package, Search, Settings2, ShieldAlert, Ship, Wrench } from 'lucide-react'
import QueryView, { BlockDetail } from './QueryView.jsx'
import './App.css'

const time = value => value ? new Date(`${String(value).slice(0, 16)}:00+09:00`).getTime() : 0
const pad = value => String(value).padStart(2, '0')
const showTime = value => value ? `${String(value).slice(5, 10).replace('-', '/')} ${String(value).slice(11, 16)}` : '—'
const percent = value => `${Math.round(value * 1000) / 10}%`
const category = {
  EQUIPMENT: { label: '설비 고장', tone: 'danger', Icon: Wrench },
  MATERIAL: { label: '자재 대기', tone: 'warning', Icon: Package },
  QUALITY: { label: '품질 보류', tone: 'purple', Icon: ShieldAlert },
}
const eventStatus = { START: 'IN_PROGRESS', RESUME: 'IN_PROGRESS', REWORK_DONE: 'IN_PROGRESS', PAUSE: 'BLOCKED', QUALITY_HOLD: 'BLOCKED', COMPLETE: 'COMPLETED' }
const statusLabel = { COMPLETED: '완료', IN_PROGRESS: '작업 중', BLOCKED: '보류', PLANNED: '예정' }
const rowsBy = (rows, field) => Object.fromEntries(rows.map(row => [row[field], row]))

function buildModel(data) {
  const asOf = [...data.equipment_snapshot].sort((a, b) => time(b.as_of) - time(a.as_of))[0]?.as_of
  const at = time(asOf)
  const day = asOf?.slice(0, 10)
  const blocks = rowsBy(data.blocks, 'block_id')
  const processes = rowsBy(data.processes, 'process_id')
  const vessels = rowsBy(data.vessels, 'vessel_id')
  const equipment = rowsBy(data.equipment, 'equipment_id')
  const snapshots = rowsBy(data.equipment_snapshot, 'equipment_id')
  const incidents = data.incidents.filter(item => time(item.opened_at) <= at)
  const work = data.work_orders.map(order => {
    const history = data.work_history.filter(item => item.work_order_id === order.work_order_id && time(item.event_at) <= at).sort((a, b) => time(a.event_at) - time(b.event_at))
    const last = history.at(-1)
    const status = eventStatus[last?.event_type] || 'PLANNED'
    const actual = data.production_actual.filter(item => item.work_order_id === order.work_order_id && time(item.period_end_at) <= at)
    const accepted = actual.reduce((total, item) => total + Number(item.accepted_qty_delta || 0), 0)
    const ownIncidents = incidents.filter(item => item.work_order_id === order.work_order_id)
    const open = ownIncidents.filter(item => !item.resolved_at || time(item.resolved_at) > at)
    return { ...order, status, accepted, progress: Math.min(1, accepted / Number(order.planned_qty || 1)), history, actual, incidents: ownIncidents, open, overdue: time(order.planned_end_at) <= at && status !== 'COMPLETED', vessel_id: blocks[order.block_id]?.vessel_id }
  })
  const byId = rowsBy(work, 'work_order_id')
  const open = incidents.filter(item => !item.resolved_at || time(item.resolved_at) > at)
  return { data, asOf, at, day, blocks, processes, vessels, equipment, snapshots, incidents, open, work, byId }
}

function summaryRecords(model) {
  const { data, work, open, at, day } = model
  const today = work.filter(item => item.planned_start_at?.slice(0, 10) === day)
  const due = work.filter(item => time(item.planned_end_at) <= at)
  const duration = value => { const minutes = Math.round(value / 60000); return minutes < 120 ? `${minutes}분` : minutes % 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes / 60}시간` }
  const unit = { piece: '개', set: '세트', m: 'm', m2: 'm²', point: '개', block: '블록' }
  const facts = [
    ['기준시각', `${model.asOf?.replace('T', ' ')} KST · 최신 데이터 기준`],
    ['운영 현황', `금일 계획 작업 ${today.length}건 중 ${today.filter(item => item.status === 'COMPLETED').length}건 완료. 기한 도래 ${due.length}건 중 ${due.filter(item => item.overdue).length}건 미완료. 미해소 사건 ${open.length}건.`],
  ]
  const asks = []
  for (const incident of open) {
    const order = model.byId[incident.work_order_id]
    if (!order) continue
    const id = order.work_order_id
    if (incident.category === 'EQUIPMENT') facts.push(['설비 고장', `${id}은 ${incident.equipment_id ? `${incident.equipment_id} ` : ''}${incident.summary}. ${String(incident.opened_at).slice(11, 16)}부터 중단, 진척 ${percent(order.progress)}, 관측 고장시간 ${duration(at - time(incident.opened_at))}. [${incident.incident_id}]`])
    else if (incident.category === 'MATERIAL') facts.push(['자재 대기', `${id}은 ${String(incident.opened_at).slice(11, 16)}부터 ${incident.summary}. 진척 ${percent(order.progress)}. 설비 고장에 포함하지 않음. [${incident.incident_id}]`])
    else {
      const inspection = data.inspections.filter(row => row.incident_id === incident.incident_id && time(row.inspected_at) <= at).sort((a, b) => time(a.inspected_at) - time(b.inspected_at)).at(-1)
      const rework = data.rework.filter(row => row.incident_id === incident.incident_id && time(row.start_at) <= at).sort((a, b) => time(a.start_at) - time(b.start_at)).at(-1)
      const repair = rework ? (rework.end_at && time(rework.end_at) <= at ? '보수는 완료했으나 재검사 판정 전이므로' : '보수 진행 중이며') : ''
      facts.push(['품질 보류', `${id}은 ${inspection ? `${inspection.checked_points}개 위치 중 ${inspection.failed_points}개 불합격.` : `${incident.summary}.`} ${repair} 인정수량 ${order.accepted}${unit[order.unit] || order.unit} 유지. [${incident.incident_id}${rework ? ` / ${rework.rework_id}` : ''}]`.replace(/\s+/g, ' ')])
    }
    const requested = { EQUIPMENT: '복구 예상시각', MATERIAL: '자재 공급시각', QUALITY: '재검사 판정' }[incident.category] || '조치 상황'
    asks.push([incident.owner_team, `${id} ${requested} 확인 필요. 자료에 없어 추정하지 않음. [${incident.incident_id}]`])
  }
  for (const incident of model.incidents.filter(item => item.resolved_at && time(item.resolved_at) <= at && item.resolved_at.slice(0, 10) === day)) {
    const order = model.byId[incident.work_order_id]
    if (!order) continue
    const progress = order.status === 'COMPLETED' ? `${showTime(order.history.at(-1)?.event_at)} 완료` : `현재 진척 ${percent(order.progress)}${order.forecast_end_at ? `, 예상 완료 ${showTime(order.forecast_end_at)}` : ''}`
    facts.push(['회복 상황', `${order.work_order_id}의 ${incident.summary} ${String(incident.resolved_at).slice(11, 16)} 해소. ${progress}. [${incident.incident_id}]`])
  }
  return { facts, asks }
}

function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState('home')
  const [vessel, setVessel] = useState('all')
  const [query, setQuery] = useState('')
  const [queryKind, setQueryKind] = useState('work')
  const [detail, setDetail] = useState(null)
  const [editedFacts, setEditedFacts] = useState({})

  useEffect(() => {
    fetch('/api/data').then(async response => {
      if (!response.ok) throw new Error(`데이터 API 오류 (${response.status})`)
      return response.json()
    }).then(setData).catch(cause => setError(cause.message))
  }, [])
  const model = useMemo(() => data ? buildModel(data) : null, [data])
  const summary = useMemo(() => model ? summaryRecords(model) : null, [model])
  const metrics = useMemo(() => {
    if (!model) return null
    const work = model.work.filter(item => vessel === 'all' || item.vessel_id === vessel)
    const today = work.filter(item => item.planned_start_at?.slice(0, 10) === model.day)
    const open = model.open.filter(item => vessel === 'all' || model.byId[item.work_order_id]?.vessel_id === vessel)
    const overdue = work.filter(item => item.overdue)
    const fault = data.equipment_snapshot.filter(item => item.status === 'FAULT')
    const watch = [...new Map([...open.map(item => model.byId[item.work_order_id]), ...overdue].filter(Boolean).map(item => [item.work_order_id, item])).values()]
    return { work, today, done: today.filter(item => item.status === 'COMPLETED'), open, overdue, fault, watch }
  }, [model, vessel, data])

  const move = (next, kind) => { setPage(next); setDetail(null); if (kind) setQueryKind(kind); window.scrollTo(0, 0) }
  const openDetail = (type, id) => { setDetail({ type, id }); setPage('detail'); window.scrollTo(0, 0) }

  if (error) return <div className="system-message"><AlertTriangle />{error}<small>C# 서버가 127.0.0.1:5181에서 실행 중인지 확인하세요.</small></div>
  if (!model || !metrics) return <div className="system-message"><Activity className="spin" />데이터를 불러오는 중입니다.</div>

  const summaryRows = [...summary.facts.map(([label, value], index) => [`f${index}`, label, value]), ...summary.asks.map(([label, value], index) => [`a${index}`, label, value])]

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => move('home')}><span className="brand-icon"><Ship size={25} /></span><span><small>SHIPBUILDING AX</small><strong>블록 운영 모니터링</strong></span></button>
      <nav className="nav"><button className={page === 'home' ? 'active' : ''} onClick={() => move('home')}><Layers3 size={16} />운영현황</button><button className={page === 'query' || page === 'detail' ? 'active' : ''} onClick={() => move('query')}><Search size={16} />조회</button></nav>
      <div className="top-actions"><span className="latest"><Activity size={15} />최신 데이터 {model.asOf?.replace('T', ' ')} KST</span><button onClick={() => move('summary')} className={page === 'summary' ? 'active' : ''}><FileText size={16} />운영요약</button></div>
    </header>

    <main>
      {page === 'home' && <>
        <div className="page-heading"><div><p className="eyebrow">OPERATIONS OVERVIEW</p><h1>운영현황</h1><p>작업과 설비 상태를 최근 기록 기준으로 확인합니다.</p></div><label className="select-label">호선명<select value={vessel} onChange={event => setVessel(event.target.value)}><option value="all">전체 호선</option>{data.vessels.map(item => <option key={item.vessel_id} value={item.vessel_id}>{item.vessel_name}</option>)}</select></label></div>
        <div className="stats-grid">
          <Stat title="금일 계획 중 완료" value={`${metrics.done.length}/${metrics.today.length}`} unit="건" hint="금일 착수 계획 중 완료" tone="success" Icon={CalendarCheck} onClick={() => move('query', 'work')} />
          <Stat title="기한 도래 미완료" value={metrics.overdue.length} unit="건" hint="마감 시각이 지난 작업" tone="warning" Icon={Clock3} onClick={() => move('query', 'delay')} />
          <Stat title="미해소 사건" value={metrics.open.length} unit="건" hint={`설비 ${metrics.open.filter(item => item.category === 'EQUIPMENT').length} · 자재 ${metrics.open.filter(item => item.category === 'MATERIAL').length} · 품질 ${metrics.open.filter(item => item.category === 'QUALITY').length}`} tone="danger" Icon={AlertTriangle} onClick={() => move('query', 'incident')} />
          <Stat title="설비 상태" value={`${metrics.fault.length}/${data.equipment.length}`} unit="대 고장" hint={`가동 ${data.equipment_snapshot.filter(item => item.status === 'RUNNING').length} · 대기 ${data.equipment_snapshot.filter(item => item.status === 'IDLE').length} · 점검 ${data.equipment_snapshot.filter(item => item.status === 'MAINTENANCE').length}`} tone="danger" Icon={Settings2} onClick={() => move('query', 'equipment')} />
        </div>
        <section className="panel flow-panel"><div className="section-head"><div><p className="eyebrow">PROCESS MAP</p><h2><Boxes size={21} />공정 배치도</h2></div><p>공정을 누르면 관련 작업을 볼 수 있습니다.</p></div><div className="flow-grid">{[...data.processes].sort((a, b) => a.sequence_no - b.sequence_no).map((process, index) => {
          const list = metrics.work.filter(item => item.process_id === process.process_id)
          const incident = metrics.open.find(item => model.byId[item.work_order_id]?.process_id === process.process_id)
          const tone = incident ? category[incident.category]?.tone : list.some(item => item.status === 'IN_PROGRESS') ? 'working' : 'neutral'
          const active = list.find(item => item.open.length) || list.find(item => item.status === 'IN_PROGRESS')
          return <button className={`process ${tone}`} key={process.process_id} onClick={() => { setQuery(process.process_name); move('query', 'work') }}><span className="process-index">{pad(index + 1)} / 06</span><span className="process-icon">{incident ? <AlertTriangle size={20} /> : <Hammer size={20} />}</span><strong>{process.zone_id} {process.process_name}</strong><small>{incident ? category[incident.category]?.label : active ? `${active.work_order_id} 작업 중` : '현재 진행 작업 없음'}</small><span className="process-foot">작업 {list.length}건 <ArrowRight size={16} /></span></button>
        })}</div><div className="flow-caption">강재 절단 <ArrowRight size={14} /> 소조립·취부 <ArrowRight size={14} /> 블록 용접 <ArrowRight size={14} /> 치수·용접 검사 <ArrowRight size={14} /> 표면처리·도장 <ArrowRight size={14} /> 블록 이송</div></section>
        <section className="panel"><div className="section-head"><div><p className="eyebrow">ATTENTION</p><h2><AlertTriangle size={21} />주목할 작업 <span className="count">{metrics.watch.length}</span></h2></div><button className="text-button" onClick={() => move('query', 'delay')}>전체 작업 조회 <ArrowRight size={16} /></button></div><div className="watch-grid">{metrics.watch.map(item => { const incident = item.open[0]; const info = incident ? category[incident.category] : { label: '기한 지연', tone: 'warning', Icon: Clock3 }; const Icon = info.Icon; return <button className={`watch ${info.tone}`} key={item.work_order_id} onClick={() => openDetail('work', item.work_order_id)}><span className="watch-top"><Icon size={21} /><b>{info.label}</b></span><strong>{item.block_id} · {model.processes[item.process_id]?.process_name}</strong><small>{incident?.summary || `마감 ${showTime(item.planned_end_at)} 지남`}</small><span className="watch-foot">{item.work_order_id}<span>진척 {percent(item.progress)}</span></span></button> })}</div></section>
      </>}

      {page === 'query' && <QueryView model={model} vessel={vessel} setVessel={setVessel} query={query} setQuery={setQuery} queryKind={queryKind} setQueryKind={setQueryKind} openDetail={openDetail} />}

      {page === 'detail' && detail && <><button className="back" onClick={() => move('query')}><ArrowLeft size={17} /> 조회로 돌아가기</button>{detail.type === 'work' ? <WorkDetail item={model.byId[detail.id]} model={model} openDetail={openDetail} /> : detail.type === 'block' ? <BlockDetail block={model.blocks[detail.id]} model={model} openDetail={openDetail} /> : <EquipmentDetail item={model.equipment[detail.id]} model={model} openDetail={openDetail} />}</>}

      {page === 'summary' && <><div className="page-heading"><div><p className="eyebrow">OPERATIONS REPORT</p><h1>운영요약</h1><p>규칙으로 집계한 사실을 검토하고 수정할 수 있습니다.</p></div><button className="secondary" onClick={() => navigator.clipboard.writeText(summaryRows.map(([key, label, value]) => `${label}\t${editedFacts[key] ?? value}`).join('\n'))}>요약 복사</button></div><div className="summary-layout"><section className="panel"><div className="section-head"><h2><ClipboardList size={21} />규칙 기반 요약</h2><Badge tone="warning">검토 필요</Badge></div><h3 className="summary-subhead">관측 사실</h3><div className="facts">{summary.facts.map(([label, value], index) => { const key = `f${index}`; return <div className="fact" key={key}><b>{label}</b><textarea aria-label={`${label} 수정`} value={editedFacts[key] ?? value} onChange={event => setEditedFacts(current => ({ ...current, [key]: event.target.value }))} rows={2} /></div> })}</div><h3 className="summary-subhead">확인 요청</h3><div className="facts">{summary.asks.map(([label, value], index) => { const key = `a${index}`; return <div className="fact" key={key}><b>{label}</b><textarea aria-label={`${label} 수정`} value={editedFacts[key] ?? value} onChange={event => setEditedFacts(current => ({ ...current, [key]: event.target.value }))} rows={2} /></div> })}</div><div className="fact-rule"><CheckCircle2 size={17} />원본 수치와 사건 번호를 근거로 작성한 규칙 기반 초안입니다.</div></section><aside className="panel ai-panel"><div className="section-head"><h2><FileText size={21} />AI 요약</h2></div><div className="ai-empty" aria-label="AI 요약 결과 비어 있음"></div></aside></div></>}
    </main>
    <footer><Database size={14} />데이터 원본: 02_조선_샘플데이터.xlsx · 최신 스냅샷 기준</footer>
  </div>
}

function Stat({ title, value, unit, hint, tone, Icon, onClick }) { return <button className={`stat ${tone}`} onClick={onClick}><span className="stat-title"><Icon size={18} />{title}</span><span className="stat-value"><strong>{value}</strong><small>{unit}</small></span><span className="stat-hint">{hint}</span></button> }
function Badge({ tone = 'neutral', children }) { return <span className={`badge ${tone}`}>{children}</span> }

function WorkDetail({ item, model, openDetail }) {
  if (!item) return <div className="panel">작업을 찾을 수 없습니다.</div>
  const vessel = model.vessels[item.vessel_id]
  return <><div className="page-heading"><div><p className="eyebrow">WORK ORDER · {item.work_order_id}</p><h1>{item.block_id} · {model.processes[item.process_id]?.process_name}</h1><p>{vessel?.vessel_name} · 작업조 {item.team_id}</p></div><Badge tone={item.open.length ? category[item.open[0].category]?.tone : item.overdue ? 'warning' : 'success'}>{item.open.length ? category[item.open[0].category]?.label : item.overdue ? '기한 지연' : statusLabel[item.status]}</Badge></div><div className="detail-grid"><section className="panel"><h2>계획과 실적</h2><dl><div><dt>계획</dt><dd>{item.planned_qty} {item.unit}</dd></div><div><dt>인정수량</dt><dd>{item.accepted} {item.unit}</dd></div><div><dt>진척</dt><dd>{percent(item.progress)}</dd></div><div><dt>계획 시작</dt><dd>{showTime(item.planned_start_at)}</dd></div><div><dt>계획 완료</dt><dd>{showTime(item.planned_end_at)}</dd></div><div><dt>예상 완료</dt><dd>{showTime(item.forecast_end_at)}</dd></div></dl></section><section className="panel"><h2>사건 및 조치</h2>{item.incidents.length ? item.incidents.map(incident => <div className="detail-event" key={incident.incident_id}><Badge tone={category[incident.category]?.tone}>{category[incident.category]?.label}</Badge><strong>{incident.incident_id} · {incident.summary}</strong><small>{showTime(incident.opened_at)} 발생 · {incident.resolved_at ? `${showTime(incident.resolved_at)} 해소` : '미해소'}</small><p>{incident.action_note || '조치 기록 없음'}</p></div>) : <p className="muted">기록된 사건 없음</p>}</section><section className="panel"><h2>작업 이력</h2>{item.history.map(event => <div className="timeline" key={event.history_id}><span>{showTime(event.event_at)}</span><strong>{event.event_type}</strong><p>{event.note}</p></div>)}</section><section className="panel"><h2>연결 정보</h2><button className="link-row" onClick={() => openDetail('equipment', item.equipment_id)}><Settings2 size={18} />설비 {item.equipment_id}<ArrowRight size={16} /></button><p className="muted">블록 {item.block_id} · 공정 {model.processes[item.process_id]?.process_name}</p></section></div></>
}

function EquipmentDetail({ item, model, openDetail }) {
  if (!item) return <div className="panel">설비를 찾을 수 없습니다.</div>
  const snapshot = model.snapshots[item.equipment_id]
  const intervals = model.data.equipment_intervals.filter(row => row.equipment_id === item.equipment_id && time(row.start_at) <= model.at).sort((a, b) => time(b.start_at) - time(a.start_at)).slice(0, 15)
  return <><div className="page-heading"><div><p className="eyebrow">EQUIPMENT · {item.equipment_id}</p><h1>{item.equipment_name}</h1><p>{model.processes[item.process_id]?.process_name} · {item.zone_id}</p></div><Badge tone={snapshot?.status === 'FAULT' ? 'danger' : 'neutral'}>{snapshot?.status || '자료 없음'}</Badge></div><div className="detail-grid"><section className="panel"><h2>현재 상태</h2><dl><div><dt>설비 ID</dt><dd>{item.equipment_id}</dd></div><div><dt>상태</dt><dd>{snapshot?.status || '—'}</dd></div><div><dt>연결 작업</dt><dd>{snapshot?.work_order_id || '—'}</dd></div><div><dt>기준시각</dt><dd>{showTime(snapshot?.as_of)}</dd></div></dl>{snapshot?.work_order_id && <button className="link-row" onClick={() => openDetail('work', snapshot.work_order_id)}>작업 상세 <ArrowRight size={16} /></button>}</section><section className="panel"><h2>상태 구간</h2>{intervals.map(row => <div className="timeline" key={row.interval_id}><span>{showTime(row.start_at)} → {showTime(row.end_at)}</span><strong>{row.status}</strong><p>{row.work_order_id || row.incident_id || '—'}</p></div>)}</section></div></>
}

export default App
