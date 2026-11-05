import { randomBytes, randomUUID } from 'node:crypto';
import { LAB_SERVICES, UNIT_PRICE_CENTS, type LabOrder, type LabSpan, type Scenario, type ServiceId } from './model';

/** Explicitly synthetic; never used as a fallback for a failed live stack. */
export function simulateOrder(scenario: Scenario, quantity: number, previous?: LabOrder): LabOrder {
  const replay = scenario === 'duplicate-replay' && previous;
  const id = replay ? previous.id : randomUUID();
  const traceId = randomBytes(16).toString('hex');
  const createdAt = new Date().toISOString();
  const rejected = scenario === 'credit-decline' || scenario === 'stock-conflict';
  const amountCents = (replay ? previous.quantity : quantity) * UNIT_PRICE_CENTS;
  let cursor = 0;
  const spans: LabSpan[] = [];
  const add = (service: ServiceId, operation: string, durationMs: number, parent: string | null = 'root', kind: LabSpan['kind'] = 'INTERNAL', attributes: LabSpan['attributes'] = {}, error = false) => {
    const spanId = spans.length === 0 ? 'root' : randomBytes(8).toString('hex');
    spans.push({ traceId, spanId, parentSpanId: parent, service, operation, kind, startMs: cursor, durationMs, status: error ? 'error' : 'ok', attributes: { 'racmond.demo': true, 'order.id': id, ...attributes } });
    return spanId;
  };
  const creditError = scenario === 'credit-decline';
  const stockError = scenario === 'stock-conflict';
  const http = (service: ServiceId, op: string, ms: number, attrs: LabSpan['attributes']) => {
    const client = add('commerce', `HTTP ${service}`, ms, 'root', 'CLIENT', { 'server.address': service });
    add(service, op, ms - 2, client, 'SERVER', attrs);
    cursor += ms + 3;
  };
  // Reserve the root duration; child starts are relative to the same origin.
  add('commerce', 'POST /api/lab/orders', 1, null, 'SERVER');
  cursor = 8;
  http('crm', 'POST /customers/credit/check', 34, { 'db.system': 'mongodb', 'credit.decision': creditError ? 'declined' : 'approved', 'order.amount_cents': amountCents });
  if (creditError) {
    spans.push({ traceId, spanId: randomBytes(8).toString('hex'), parentSpanId: 'root', service: 'crm', operation: 'credit.limit.exceeded', kind: 'INTERNAL', startMs: 38, durationMs: 2, status: 'error', attributes: { 'racmond.demo': true, 'order.id': id, 'credit.limit_cents': 10000000 } });
  } else {
    http('erp', 'POST /reservations', stockError ? 42 : 61, { 'db.system': 'postgresql', 'inventory.reserved': !stockError, 'inventory.replayed': Boolean(replay) });
    if (stockError) {
      spans.push({ traceId, spanId: randomBytes(8).toString('hex'), parentSpanId: 'root', service: 'erp', operation: 'inventory.insufficient', kind: 'INTERNAL', startMs: cursor - 15, durationMs: 2, status: 'error', attributes: { 'racmond.demo': true, 'order.id': id } });
    } else {
      http('assets', 'POST /allocations', 28, { 'db.system': 'redis', 'asset.id': replay ? previous.assetId! : `RACK-${id.slice(0, 8).toUpperCase()}`, 'idempotent.replay': Boolean(replay) });
      const produce = add('assets', 'orders.accepted publish', 4, 'root', 'PRODUCER', { 'messaging.system': 'redis_streams', 'messaging.destination.name': 'orders.accepted' });
      cursor += 22;
      const consume = add('accounting', 'orders.accepted process', scenario === 'slow-db' ? 914 : 64, produce, 'CONSUMER', { 'messaging.operation.type': 'process', 'idempotent.replay': Boolean(replay) });
      add('accounting', 'INSERT journal_entries', scenario === 'slow-db' ? 850 : 23, consume, 'CLIENT', { 'db.system': 'postgresql', 'journal.balanced': true, 'journal.debits_cents': replay ? 0 : amountCents, 'journal.credits_cents': replay ? 0 : amountCents, 'fault.injected': scenario === 'slow-db' });
      add('accounting', 'invoice.posted publish', 5, consume, 'PRODUCER', { 'messaging.system': 'redis_streams', 'messaging.destination.name': 'invoice.posted' });
      if (scenario === 'gc-pressure') add('accounting', 'bounded allocation workload', 18, consume, 'INTERNAL', { 'workload.max_mib': 24, 'workload.type': 'short-lived' });
      cursor += scenario === 'slow-db' ? 940 : 85;
      add('crm', 'invoice.posted → customer notification', 18, consume, 'CONSUMER', { 'db.system': 'mongodb', 'notification.synthetic': true });
      cursor += 25;
    }
  }
  spans[0].durationMs = cursor;
  spans[0].status = rejected ? 'error' : 'ok';
  return {
    id, scenario, mode: 'demo', status: rejected ? 'rejected' : 'completed', createdAt,
    amountCents, quantity: replay ? previous.quantity : quantity, traceId,
    invoiceId: rejected || stockError ? null : replay ? previous.invoiceId : `INV-${id.slice(0, 8).toUpperCase()}`,
    assetId: rejected ? null : replay ? previous.assetId : `RACK-${id.slice(0, 8).toUpperCase()}`,
    replayed: Boolean(replay),
    message: creditError ? 'Credit limit exceeded. No inventory or asset changes were made.' : stockError ? 'Stock reservation failed. No asset or ledger entries were created.' : replay ? 'Replay recognized. Existing reservation, asset and invoice reused; no second charge.' : 'Order completed. Inventory reserved, asset allocated and a balanced journal posted.',
    spans,
  };
}

export function demoSummary(orders: LabOrder[]) {
  const durations = orders.filter(o => o.status === 'completed').map(o => Math.max(...o.spans.map(s => s.startMs + s.durationMs))).sort((a,b) => a-b);
  return {
    total: orders.length, completed: orders.filter(o => o.status === 'completed').length,
    rejected: orders.filter(o => o.status === 'rejected').length,
    p95Ms: durations.length ? durations[Math.max(0, Math.ceil(durations.length * .95) - 1)] : 0,
    services: LAB_SERVICES.length,
  };
}
