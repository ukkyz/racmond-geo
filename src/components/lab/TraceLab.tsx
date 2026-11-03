'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, BackgroundVariant, Handle, Position, MarkerType, type Node, type NodeProps, type Edge } from '@xyflow/react';
import Link from 'next/link';
import { Badge, Select } from '@/components/ui';
import { LAB_SERVICES, SCENARIOS, flattenSpans, traceDuration, type LabOrder, type LabSpan, type Scenario, type ServiceId } from '@/lib/lab/model';
import { demoSummary } from '@/lib/lab/simulation';
import './lab.css';

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const ms = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`;
function ServiceNode({ data }: NodeProps) {
  const s = data.service as typeof LAB_SERVICES[number];
  return <div className="lab-service" style={{ '--service-color': s.color } as React.CSSProperties}>
    <Handle type="target" position={Position.Left} /><Handle type="source" position={Position.Right} />
    <div className="flex items-center justify-between"><span className="service-icon">{s.short.slice(0, 2).toUpperCase()}</span><span className="lab-mono" style={{ color: s.color, fontSize: 9 }}>{s.language}</span></div>
    <h3>{s.name}</h3><p>{s.id === 'commerce' ? 'One request. One correlated journey.' : s.id === 'crm' ? 'Approve credit · notify customer' : s.id === 'erp' ? 'Reserve stock exactly once' : s.id === 'assets' ? 'Allocate · publish accepted event' : 'Consume · post balanced journal'}</p>
    <div className="store"><span style={{ color: s.color }}>◈</span>{s.store}</div>
  </div>;
}
const nodeTypes = { service: ServiceNode };
const nodes: Node[] = LAB_SERVICES.map((service, i) => ({ id: service.id, type: 'service', position: { x: i * 230 + 20, y: 35 }, data: { service }, draggable: false, selectable: false }));
const edges: Edge[] = LAB_SERVICES.slice(1).map((s, i) => ({ id: `e${i}`, source: LAB_SERVICES[i].id, target: s.id, label: i === 3 ? 'Redis Stream' : 'HTTP + W3C', type: 'smoothstep', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#a78bfa', width: 13, height: 13 }, style: { stroke: i === 3 ? '#2dd4bf' : '#a78bfa', strokeWidth: 1.4, strokeDasharray: i === 3 ? '5 4' : undefined }, labelStyle: { fill: 'var(--text-muted)' }, labelBgStyle: { fill: 'var(--glass-surface-strong)' } }));
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function TraceLab() {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario>('happy');
  const [quantity, setQuantity] = useState(1);
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'waterfall' | 'business' | 'protocol'>('waterfall');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [spanId, setSpanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollCount = useRef(0);
  const selected = orders.find(o => o.id === selectedId);
  const summary = useMemo(() => demoSummary(orders.filter(o => o.mode === mode)), [orders, mode]);
  const currentScenario = SCENARIOS.find(s => s.id === scenario)!;
  const updateOrder = useCallback((order: LabOrder) => setOrders(prev => [order, ...prev.filter(o => o.id !== order.id)].slice(0, 100)), []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/lab', { signal: controller.signal }).then(r => r.json()).then(data => { setOrders(data.orders ?? []); setSelectedId(data.orders?.[0]?.id ?? null); setLiveEnabled(Boolean(data.liveEnabled)); }).catch(e => { if (e.name !== 'AbortError') setError('Could not load the lab history. You can still run a new order.'); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  const refreshOrder = useCallback(async (id: string, orderMode: 'demo' | 'live') => {
    const response = await fetch(`/api/lab/orders/${id}?mode=${orderMode}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to retrieve trace.');
    updateOrder(data.order); return data.order as LabOrder;
  }, [updateOrder]);
  const pollStatus = selected?.status;
  const pollMode = selected?.mode;
  const pollSpanCount = selected?.spans.length ?? 0;
  useEffect(() => {
    if (mode !== 'live' || !selectedId || pollMode !== 'live' || !pollStatus || !['pending', 'completed', 'rejected', 'failed'].includes(pollStatus)) return;
    if ((pollStatus === 'completed' || pollStatus === 'rejected' || pollStatus === 'failed') && pollSpanCount > 0) return;
    pollCount.current = 0;
    const timer = setInterval(async () => {
      if (++pollCount.current > 25) { clearInterval(timer); setError('Trace export is still pending. Check the Collector and Tempo; business processing may already have finished.'); return; }
      try { const updated = await refreshOrder(selectedId, 'live'); if (updated.status !== 'pending' && updated.spans.length) clearInterval(timer); }
      catch (e) { clearInterval(timer); setError((e as Error).message); }
    }, 1800);
    return () => clearInterval(timer);
  }, [mode, selectedId, pollMode, pollStatus, pollSpanCount, refreshOrder]);
  async function run(replay = false) {
    setRunning(true); setError('');
    try {
      const response = await fetch(`/api/lab?mode=${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: replay ? 'duplicate-replay' : scenario, quantity, ...(replay ? { replayOrderId: selected?.id } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? data.errors?.join(' ') ?? 'The order failed.');
      updateOrder(data.order); setSelectedId(data.order.id); setSpanId(null); setTab('waterfall'); setFilter('all');
      if (data.order.mode === 'live') { try { await refreshOrder(data.order.id, 'live'); } catch { /* polling will retry */ } }
    } catch (e) { setError((e as Error).message); } finally { setRunning(false); }
  }
  async function switchMode(next: 'demo' | 'live') {
    if (next === mode) return;
    setError(''); setMode(next); setSelectedId(orders.find(o => o.mode === next)?.id ?? null); setSpanId(null);
    if (next === 'live') {
      try { const r = await fetch('/api/lab/health'); const data = await r.json(); const down = data.services?.filter((s: { available: boolean }) => !s.available) ?? []; if (down.length) setError(`${down.length} live service(s) unavailable. Start the Compose stack; see lab/README.md. Live failures will not fall back to demo data.`); }
      catch { setError('Unable to check live service health.'); }
    }
  }
  const visibleSpans = useMemo(() => selected ? flattenSpans(selected.spans).filter(s => (filter === 'all' || (filter === 'error' ? s.status === 'error' : s.service === filter)) && `${s.operation} ${s.service}`.toLowerCase().includes(query.toLowerCase())) : [], [selected, filter, query]);
  const activeSpan = selected?.spans.find(s => s.spanId === spanId);
  const start = selected?.spans.length ? Math.min(...selected.spans.map(s => s.startMs)) : 0;
  const duration = selected ? traceDuration(selected.spans) : 0;
  return <div className="lab-page fade-in">
    <div className="lab-hero"><div><div className="lab-kicker">Business observability / Trace lab</div><h1>From rack to revenue.<br /><span style={{ color: 'var(--text-muted)' }}>Every hop, accounted for.</span></h1><p>Follow one infrastructure order across five languages, three data engines, and an asynchronous message boundary. Find the bottleneck—not just the symptom.</p></div>
      <div className="flex flex-col items-end gap-3"><div className="lab-segment" aria-label="Telemetry source"><button className={mode === 'demo' ? 'active' : ''} onClick={() => void switchMode('demo')}>Demo environment</button><button className={mode === 'live' ? 'active' : ''} onClick={() => void switchMode('live')}>Live stack ↗</button></div><span className={`lab-source ${mode === 'live' ? 'live' : ''}`}>{mode === 'demo' ? 'Synthetic telemetry · safe to explore' : liveEnabled ? 'Live stack configured · health checked on switch' : 'Live stack not configured'}</span></div>
    </div>
    <div className="lab-panel">
      <div className="lab-panel-head"><div><h2>Racmond commerce estate</h2><p>DCIM meets ERP, CRM and financial operations · synthetic customers only</p></div><Badge tone="violet">5 services · 3 data engines</Badge></div>
      <div className="lab-topology"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: .1 }} nodesDraggable={false} nodesConnectable={false} zoomOnScroll={false} panOnDrag minZoom={.3} maxZoom={1.3} proOptions={{ hideAttribution: true }}><Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--glass-border)" /></ReactFlow></div>
      <div className="lab-controls"><Select className="lab-scenario-select" aria-label="Trace scenario" value={scenario} onChange={e => setScenario(e.target.value as Scenario)}>{SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select><Select className="lab-quantity-select" aria-label="Order quantity" value={quantity} onChange={e => setQuantity(Number(e.target.value))} style={{ minWidth: 90 }}>{[1, 2, 3, 5, 10].map(n => <option value={n} key={n}>{n} × rack</option>)}</Select><button className="lab-button primary" disabled={running} onClick={() => void run()}>{running ? 'Processing order…' : '▶ Run transaction'}</button><button className="lab-button" disabled={running || !selected || selected.status !== 'completed' || selected.mode !== mode} onClick={() => void run(true)}>↻ Replay selected</button><Link href="/runtime" className="lab-link ml-auto">Inspect JVM & Go runtime →</Link></div>
      <div className="px-[18px] pb-4 lab-muted text-[11px]">{currentScenario.description} <span style={{ color: 'var(--accent-text)' }}>Expected: {currentScenario.expected}.</span></div>
    </div>
    {error && <div role="alert" className="lab-notice error mt-4">{error}</div>}
    <div className="lab-stats"><div className="lab-stat"><div className="label">TRANSACTIONS <span>↗</span></div><div className="value">{summary.total}</div><div className="note">In this {mode} session / history</div></div><div className="lab-stat"><div className="label">COMPLETED <span style={{ color: '#2dd4bf' }}>●</span></div><div className="value">{summary.completed}<small>/ {summary.total}</small></div><div className="note">{summary.rejected} expected business rejections</div></div><div className="lab-stat"><div className="label">P95 END-TO-END <span>◷</span></div><div className="value">{summary.p95Ms ? Math.round(summary.p95Ms) : '—'}<small>ms</small></div><div className="note">Completed orders · sample statistic</div></div><div className="lab-stat"><div className="label">CONNECTED CONTEXT <span>⌘</span></div><div className="value">5<small>languages</small></div><div className="note">Next.js · PHP · Rust · Go · Java</div></div></div>
    <div className="lab-grid">
      <aside className="lab-panel lab-history thin-scroll"><div className="lab-panel-head"><h2>Recent transactions</h2><span className="lab-mono lab-muted">{orders.filter(o => o.mode === mode).length}</span></div>{loading ? <div className="lab-empty">Loading history…</div> : orders.filter(o => o.mode === mode).length === 0 ? <div className="lab-empty">No {mode} transactions yet.<br />Run a transaction to begin.</div> : orders.filter(o => o.mode === mode).map(o => <button key={o.id} className={`lab-order ${selectedId === o.id ? 'selected' : ''}`} onClick={() => { setSelectedId(o.id); setSpanId(null); }}><div className="flex items-center justify-between"><strong className="lab-mono">ORD-{o.id.slice(0, 8).toUpperCase()}</strong><span className={`lab-dot ${o.status === 'rejected' || o.status === 'failed' ? 'error' : o.status === 'pending' ? 'pending' : ''}`} /></div><p>{SCENARIOS.find(s => s.id === o.scenario)?.name}</p><div className="flex justify-between mt-2 text-[9px] lab-muted"><span>{o.status}{o.replayed ? ' · replay' : ''}</span><span>{o.spans.length ? ms(traceDuration(o.spans)) : 'awaiting spans'}</span></div></button>)}</aside>
      <section className="lab-panel min-w-0">
        <div className="lab-panel-head"><div><h2>Transaction investigation</h2><p>{selected ? selected.message : 'Select a transaction to inspect its causal journey.'}</p></div><button className="lab-button" disabled={!selected} onClick={() => selected && download(`racmond-${selected.mode}-${selected.id}.json`, selected)}>↓ Export JSON</button></div>
        {selected ? <><div className="lab-trace-summary"><div><dt>Trace ID</dt><dd className="lab-mono" title={selected.traceId}>{selected.traceId.slice(0, 16)}…</dd></div><div><dt>Order value</dt><dd>{money(selected.amountCents)}</dd></div><div><dt>Outcome</dt><dd><Badge tone={selected.status === 'completed' ? 'emerald' : selected.status === 'pending' ? 'amber' : 'rose'}>{selected.status}</Badge></dd></div><div><dt>Environment</dt><dd>{selected.mode === 'demo' ? 'Synthetic demo' : 'Live OTLP'}</dd></div></div>
        <div className="lab-tabs">{([['waterfall', 'Trace waterfall'], ['business', 'Business records'], ['protocol', 'Message context']] as const).map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
        {tab === 'waterfall' && <><div className="flex flex-wrap gap-2 px-4 pt-3"><Select aria-label="Filter spans by service" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto', minWidth: 145, padding: '6px 9px', fontSize: 10 }}><option value="all">All services</option>{LAB_SERVICES.map(s => <option key={s.id} value={s.id}>{s.short}</option>)}<option value="error">Errors only</option></Select><input className="glass-input rounded-md px-3 py-1 text-[10px] flex-1 min-w-32" placeholder="Find an operation…" aria-label="Search trace operations" value={query} onChange={e => setQuery(e.target.value)} /></div>
          <div className="lab-waterfall thin-scroll"><div className="lab-span-header"><span>Service / operation</span><span>0 · {ms(duration)}</span><span className="text-right">Duration</span></div>{visibleSpans.length ? visibleSpans.map(s => { const color = LAB_SERVICES.find(service => service.id === s.service)?.color ?? '#a78bfa'; return <button key={s.spanId} className={`lab-span-row ${s.spanId === spanId ? 'selected' : ''}`} onClick={() => setSpanId(spanId === s.spanId ? null : s.spanId)}><span className="lab-span-name" style={{ paddingLeft: Math.min(s.depth, 5) * 10 }}><i style={{ background: s.status === 'error' ? '#fb7185' : color }} /><span className="truncate">{s.operation}</span></span><span className="lab-span-track"><span className="lab-span-bar" style={{ left: `${(s.startMs - start) / Math.max(duration, 1) * 100}%`, width: `${Math.max(.7, s.durationMs / Math.max(duration, 1) * 100)}%`, background: s.status === 'error' ? '#fb7185' : color }} /></span><span className="lab-span-time" style={{ color: s.status === 'error' ? '#fb7185' : undefined }}>{ms(s.durationMs)}</span></button>; }) : <div className="lab-empty">{selected.spans.length ? 'No spans match these filters.' : 'Waiting for real spans from Tempo. No synthetic spans are substituted.'}</div>}</div>
          {activeSpan && <div className="lab-span-detail"><div className="flex flex-wrap justify-between gap-2"><strong className="text-xs">{activeSpan.operation}</strong><Badge tone={activeSpan.status === 'error' ? 'rose' : 'emerald'}>{activeSpan.kind} · {activeSpan.status}</Badge></div><dl className="lab-attributes"><div><dt>span.id</dt><dd>{activeSpan.spanId}</dd></div><div><dt>parent.span.id</dt><dd>{activeSpan.parentSpanId ?? 'root'}</dd></div>{Object.entries(activeSpan.attributes).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></div>}
        </>}
        {tab === 'business' && <div className="lab-journey"><div className="lab-record"><span className="lab-eyebrow">CRM · customer C-100</span><h3>Credit decision</h3><div className="amount" style={{ color: selected.scenario === 'credit-decline' ? '#fb7185' : '#2dd4bf' }}>{selected.scenario === 'credit-decline' ? 'Declined' : 'Approved'}</div><p>Order {money(selected.amountCents)} against a {money(10000000)} synthetic credit limit. No real customer information is used.</p></div><div className="lab-record"><span className="lab-eyebrow">ERP + ASSETS</span><h3>Reservation & allocation</h3><div className="amount">{selected.assetId ? `${selected.quantity} rack${selected.quantity > 1 ? 's' : ''}` : 'No allocation'}</div><p>{selected.assetId ?? 'Stock or credit check prevented allocation.'}<br />{selected.replayed ? 'Replayed without moving stock twice.' : 'Unique order ID protects the reservation.'}</p></div><div className="lab-record"><span className="lab-eyebrow">ACCOUNTING · USD</span><h3>Balanced journal</h3><div className="amount">{selected.invoiceId ? money(selected.replayed ? 0 : selected.amountCents) : '—'}</div><p>{selected.invoiceId ?? 'No invoice posted.'}<br />{selected.replayed ? 'Incremental debit and credit: $0.00.' : selected.invoiceId ? 'Debit receivables = credit revenue. Tax excluded in this simplified demo.' : 'No financial entries for this outcome.'}</p></div><div className="lab-notice col-span-full">{selected.mode === 'demo' ? 'These records illustrate the simulated journey. Run the Compose stack for persistent MongoDB, PostgreSQL and Redis records.' : 'Identifiers reference live business records. The journal is written transactionally with a unique order constraint; inspect PostgreSQL using the verification queries in lab/README.md.'}</div></div>}
        {tab === 'protocol' && <div className="p-5"><h3 className="text-xs font-semibold mb-2">One context, across process boundaries</h3><p className="text-xs lab-muted leading-7 mb-4">HTTP requests carry a W3C <code>traceparent</code>. The asset service persists that context in the Redis Stream envelope. Accounting extracts it before creating a consumer span, so asynchronous work remains in the same trace.</p><pre className="glass-input rounded-lg p-4 lab-mono overflow-auto leading-6">{JSON.stringify({ traceparent: `00-${selected.traceId}-${selected.spans.find(s => s.kind === 'PRODUCER')?.spanId ?? '0000000000000000'}-01`, 'order.id': selected.id, 'amount.cents': selected.amountCents, currency: 'USD', stream: 'orders.accepted', 'schema.version': 1, 'idempotency.key': selected.id }, null, 2)}</pre><p className="lab-disclaimer">Illustrative envelope for this trace; producer span ID comes from the selected trace when available. Raw message payloads never contain customer PII.</p></div>}
        </> : <div className="lab-empty"><span className="text-3xl block mb-3">⌁</span>Your next investigation starts here.<br />Run a transaction or choose one from the history.</div>}
      </section>
    </div>
    <div className="lab-footer"><span>{mode === 'demo' ? 'Demo history is bounded and process-local. No external services are contacted.' : 'Live data: application services → OTel Collector → Tempo → Racmond.'}</span><Link className="lab-link" href="/strategy">See the leadership decisions behind this lab →</Link></div>
  </div>;
}
