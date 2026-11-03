import { NextResponse } from 'next/server';
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { demoOrders, labConfig, labFetch, rememberOrder } from '@/lib/lab/store';
import { simulateOrder } from '@/lib/lab/simulation';
import { validateOrderInput, UNIT_PRICE_CENTS, type LabOrder } from '@/lib/lab/model';
import { isSameOrigin } from '@/lib/lab/request';
export const dynamic = 'force-dynamic';
export async function GET() {
  const config = labConfig();
  if (!demoOrders.size) {
    for (const scenario of ['happy', 'slow-db', 'credit-decline'] as const) {
      const order = simulateOrder(scenario, 1);
      order.createdAt = new Date(Date.now() - (3 - demoOrders.size) * 60000).toISOString();
      rememberOrder(order);
    }
  }
  return NextResponse.json({ liveEnabled: config.enabled, orders: [...demoOrders.values()].reverse(), storage: 'Process-local demo history (last 100); business records in the live stack are persistent.' });
}
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Cross-origin order is not allowed.' }, { status: 403 });
  const parsed = validateOrderInput(await req.json().catch(() => null));
  if (parsed.errors.length) return NextResponse.json({ errors: parsed.errors }, { status: 422 });
  const mode = new URL(req.url).searchParams.get('mode') ?? 'demo';
  if (mode !== 'demo' && mode !== 'live') return NextResponse.json({ error: 'Mode must be demo or live.' }, { status: 400 });
  if (mode === 'demo') {
    const previous = parsed.replayOrderId ? demoOrders.get(parsed.replayOrderId) : undefined;
    if (parsed.scenario === 'duplicate-replay' && (!previous || previous.status !== 'completed')) return NextResponse.json({ error: 'Choose a completed demo order to replay.' }, { status: 409 });
    const order = simulateOrder(parsed.scenario, parsed.quantity, previous);
    rememberOrder(order);
    return NextResponse.json({ order }, { status: 201 });
  }
  const config = labConfig();
  if (!config.enabled) return NextResponse.json({ error: 'The live stack is not configured. Start lab/compose.yaml and set LAB_ENABLED=true. Demo mode remains available.' }, { status: 503 });
  const previous = parsed.replayOrderId ? await labFetch(`${config.urls.crm}/orders/${parsed.replayOrderId}`).then(r => r.ok ? r.json() : null).catch(() => null) : null;
  if (parsed.scenario === 'duplicate-replay' && !previous) return NextResponse.json({ error: 'The original live order could not be found.' }, { status: 409 });
  const id = previous?.id ?? crypto.randomUUID();
  const quantity = previous?.quantity ?? parsed.quantity;
  const amountCents = quantity * UNIT_PRICE_CENTS;
  const tracer = trace.getTracer('racmond.trace-lab');
  return tracer.startActiveSpan('POST /api/lab/orders', { kind: SpanKind.SERVER }, async span => {
    const traceId = span.spanContext().traceId;
    span.setAttribute('order.id', id); span.setAttribute('racmond.scenario', parsed.scenario);
    const order: LabOrder = { id, quantity, amountCents, scenario: parsed.scenario, mode: 'live', status: 'pending', createdAt: new Date().toISOString(), traceId, invoiceId: null, assetId: null, replayed: Boolean(previous), message: 'Order accepted; waiting for the asynchronous accounting consumer.', spans: [] };
    const body = JSON.stringify({ id, quantity, amountCents, scenario: parsed.scenario });
    const headers = { 'Content-Type': 'application/json' };
    let publicationAttempted = false;
    try {
      for (const [service, path] of [['crm', 'orders'], ['erp', 'reservations'], ['assets', 'allocations']] as const) {
        if (service === 'assets') publicationAttempted = true;
        const response = await labFetch(`${config.urls[service]}/${path}`, { method: 'POST', headers, body });
        if (!response.ok) {
          if ((service === 'crm' || service === 'erp') && [409, 422].includes(response.status)) {
            let stored = await labFetch(`${config.urls.crm}/orders/${id}`).then(r => r.ok ? r.json() : null).catch(() => null);
            if (stored) {
              if (service === 'erp' && stored.status === 'pending') {
                const reason = (await response.text()).slice(0, 250) || 'Inventory policy rejected this order.';
                await labFetch(`${config.urls.crm}/orders/${id}/reject`, { method: 'POST', headers, body: JSON.stringify({ reason, status: 'rejected' }) }).catch(() => null);
                stored = await labFetch(`${config.urls.crm}/orders/${id}`).then(r => r.ok ? r.json() : stored).catch(() => stored);
              }
              Object.assign(order, { status: stored.status === 'rejected' ? 'rejected' : 'failed', message: stored.message ?? 'Business policy rejected this order.' });
              span.setStatus({ code: SpanStatusCode.ERROR, message: 'Business rejection' }); span.end();
              return NextResponse.json({ order }, { status: 201 });
            }
          }
          throw new Error(`${service} returned ${response.status}: ${(await response.text()).slice(0, 250)}`);
        }
        if (service === 'assets') { const allocated = await response.json(); order.assetId = allocated.assetId; }
      }
      span.end();
      return NextResponse.json({ order }, { status: 202 });
    } catch (error) {
      // Best-effort compensations. Failed/restarted services can leave a pending order for operator reconciliation.
      await Promise.all([
        publicationAttempted ? Promise.resolve(null) : labFetch(`${config.urls.erp}/reservations/${id}`, { method: 'DELETE' }).catch(() => null),
        labFetch(`${config.urls.crm}/orders/${id}/reject`, { method: 'POST', headers, body: JSON.stringify({ reason: publicationAttempted ? 'Publication outcome unknown; operator reconciliation required.' : 'Upstream service unavailable; reservation compensation requested.', status: publicationAttempted ? 'pending' : 'failed' }) }).catch(() => null),
      ]);
      span.recordException(error as Error); span.setStatus({ code: SpanStatusCode.ERROR }); span.end();
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Order failed', traceId, orderId: id }, { status: 502 });
    }
  });
}
