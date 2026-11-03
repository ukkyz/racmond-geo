import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrderInput, flattenSpans, traceDuration, UNIT_PRICE_CENTS } from '../src/lib/lab/model';
import { simulateOrder, demoSummary } from '../src/lib/lab/simulation';
import { decodeTempoTrace } from '../src/lib/lab/tempo';
import { demoRuntime } from '../src/lib/lab/runtime';
import { DECISIONS, riceScore } from '../src/lib/lab/strategy';

test('order validation rejects fractional/negative/oversized quantities and unknown scenarios', () => {
  for (const quantity of [-1, 0, 11, 1.5, NaN, '1']) assert.ok(validateOrderInput({ quantity }).errors.length);
  assert.ok(validateOrderInput({ scenario: 'drop-table' }).errors.length);
  assert.deepEqual(validateOrderInput({ quantity: 10, scenario: 'happy' }).errors, []);
  assert.ok(validateOrderInput({ scenario: 'duplicate-replay' }).errors.length);
});
test('a healthy order crosses five services and a producer/consumer boundary', () => {
  const order = simulateOrder('happy', 3);
  assert.equal(order.status, 'completed'); assert.equal(order.amountCents, 3 * UNIT_PRICE_CENTS);
  assert.equal(new Set(order.spans.map(s => s.service)).size, 5);
  assert.match(order.traceId, /^[a-f0-9]{32}$/);
  assert.ok(order.spans.some(s => s.kind === 'PRODUCER'));
  const consumer = order.spans.find(s => s.service === 'accounting' && s.kind === 'CONSUMER')!;
  assert.equal(consumer.parentSpanId, order.spans.find(s => s.service === 'assets' && s.kind === 'PRODUCER')!.spanId);
  const journal = order.spans.find(s => s.operation === 'INSERT journal_entries')!;
  assert.equal(journal.attributes['journal.debits_cents'], journal.attributes['journal.credits_cents']);
});
test('credit decline stops before inventory, asset or ledger writes', () => {
  const order = simulateOrder('credit-decline', 1);
  assert.equal(order.status, 'rejected'); assert.equal(order.invoiceId, null); assert.equal(order.assetId, null);
  assert.deepEqual([...new Set(order.spans.map(s => s.service))], ['commerce','crm']);
});
test('inventory conflict never allocates assets or posts money', () => {
  const order = simulateOrder('stock-conflict', 2);
  assert.equal(order.status, 'rejected'); assert.equal(order.invoiceId, null);
  assert.ok(!order.spans.some(s => s.service === 'assets' || s.service === 'accounting'));
});
test('replay preserves order, invoice and asset identity while creating a new trace', () => {
  const original = simulateOrder('happy', 2), replay = simulateOrder('duplicate-replay', 10, original);
  assert.equal(replay.id, original.id); assert.equal(replay.invoiceId, original.invoiceId); assert.equal(replay.assetId, original.assetId);
  assert.equal(replay.amountCents, original.amountCents); assert.notEqual(replay.traceId, original.traceId);
  const journal = replay.spans.find(s => s.operation === 'INSERT journal_entries')!;
  assert.equal(journal.attributes['journal.debits_cents'], 0); assert.equal(journal.attributes['journal.credits_cents'], 0);
});
test('latency fault yields a measurable slow database span', () => {
  const order = simulateOrder('slow-db', 1);
  assert.ok(traceDuration(order.spans) > 1000);
  assert.equal(order.spans.find(s => s.operation === 'INSERT journal_entries')!.durationMs, 850);
});
test('waterfall flattening is deterministic, parent-first and cycle-safe', () => {
  const spans = simulateOrder('happy', 1).spans;
  const flat = flattenSpans(spans);
  assert.equal(flat.length, spans.length); assert.equal(flat[0].spanId, 'root');
  assert.equal(new Set(flat.map(s => s.spanId)).size, spans.length);
  const cycle = spans.slice(0,2); cycle[0].parentSpanId = cycle[1].spanId;
  assert.equal(flattenSpans(cycle).length, 2);
});
test('Tempo decoder handles nanosecond times, zero/false attributes and missing parents', () => {
  const spans = decodeTempoTrace({ batches: [{ resource: { attributes: [{ key:'service.name', value:{ stringValue:'accounting' } }] }, scopeSpans: [{ spans: [{ traceId:'a'.repeat(32),spanId:'b'.repeat(16),name:'test',kind:5,startTimeUnixNano:'1000000000',endTimeUnixNano:'1005000000',attributes:[{key:'replayed',value:{boolValue:false}},{key:'count',value:{intValue:'0'}}],status:{code:2} }] }] }] });
  assert.equal(spans[0].service,'accounting'); assert.equal(spans[0].durationMs,5); assert.equal(spans[0].kind,'CONSUMER'); assert.equal(spans[0].status,'error'); assert.equal(spans[0].attributes.replayed,false); assert.equal(spans[0].attributes.count,0);
  assert.deepEqual(decodeTempoTrace({}),[]);
});
test('runtime demo is explicit and never includes negative heap or pause values', () => {
  for (const service of ['accounting','assets'] as const) for (let tick=0;tick<100;tick++) {
    const sample=demoRuntime(service,tick,true); assert.equal(sample.source,'demo'); assert.ok(sample.heapUsed>0); assert.ok(sample.gcCount>=0); assert.ok(sample.events.every(e=>e.durationMs>=0));
  }
});
test('summary statistics only represent completed orders', () => {
  const orders=[simulateOrder('happy',1),simulateOrder('slow-db',1),simulateOrder('credit-decline',1)];
  const summary=demoSummary(orders); assert.equal(summary.completed,2); assert.equal(summary.rejected,1); assert.ok(summary.p95Ms>1000);
});
test('leadership backlog has unique IDs, release gates and bounded estimates', () => {
  assert.equal(new Set(DECISIONS.map(d=>d.id)).size,DECISIONS.length);
  for(const d of DECISIONS){assert.ok(d.acceptance && d.metric && d.dissent);assert.ok(d.effort>0);assert.ok(riceScore(d)>0);}
  assert.ok(DECISIONS.find(d=>d.id==='R-01')?.priority==='P0');
});
test('same-origin guard accepts the public preview host and rejects foreign origins', async () => {
  const { isSameOrigin } = await import('../src/lib/lab/request');
  const req = (origin?: string, host = 'localhost:3000', forwarded?: string) => new Request('http://localhost:3000/api/lab', { headers: { host, ...(origin ? { origin } : {}), ...(forwarded ? { 'x-forwarded-host': forwarded } : {}) } });
  assert.equal(isSameOrigin(req()), true);
  assert.equal(isSameOrigin(req('http://localhost:3000')), true);
  assert.equal(isSameOrigin(req('https://3000-sandbox.e2b.app', 'internal:3000', '3000-sandbox.e2b.app')), true);
  assert.equal(isSameOrigin(req('https://evil.example', '3000-sandbox.e2b.app', '3000-sandbox.e2b.app')), false);
  assert.equal(isSameOrigin(req('not-a-url')), false);
});
test('replay input requires a UUID and does not silently accept arbitrary IDs', () => {
  assert.ok(validateOrderInput({ scenario: 'duplicate-replay', replayOrderId: 'abc' }).errors.length);
  assert.deepEqual(validateOrderInput({ scenario: 'duplicate-replay', replayOrderId: '123e4567-e89b-42d3-a456-426614174000' }).errors, []);
});
