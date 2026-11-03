import { NextResponse } from 'next/server';
import { demoOrders, labConfig, labFetch } from '@/lib/lab/store';
import { decodeTempoTrace } from '@/lib/lab/tempo';
import type { LabOrder } from '@/lib/lab/model';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid order ID.' }, { status: 400 });
  if ((new URL(req.url).searchParams.get('mode') ?? 'demo') === 'demo') {
    const order = demoOrders.get(id);
    return order ? NextResponse.json({ order }) : NextResponse.json({ error: 'Demo order expired. Run a new order.' }, { status: 404 });
  }
  const config = labConfig();
  if (!config.enabled) return NextResponse.json({ error: 'Live lab is not configured.' }, { status: 503 });
  try {
    const response = await labFetch(`${config.urls.crm}/orders/${id}`);
    if (!response.ok) return NextResponse.json({ error: 'Live order not found.' }, { status: response.status });
    const data = await response.json();
    let spans: LabOrder['spans'] = [];
    if (data.traceId && /^[0-9a-f]{32}$/.test(data.traceId)) {
      const traceResponse = await labFetch(`${config.urls.tempo}/api/traces/${data.traceId}`, {}, 4000).catch(() => null);
      if (traceResponse?.ok) spans = decodeTempoTrace(await traceResponse.json());
    }
    const order: LabOrder = { id, scenario: data.scenario, mode: 'live', status: data.status, createdAt: data.createdAt, amountCents: data.amountCents, quantity: data.quantity, traceId: data.traceId, invoiceId: data.invoiceId ?? null, assetId: data.assetId ?? null, replayed: Boolean(data.replayed), message: data.message ?? 'Waiting for spans from the OpenTelemetry Collector…', spans };
    return NextResponse.json({ order });
  } catch { return NextResponse.json({ error: 'The live lab is unavailable. No synthetic data has been substituted.' }, { status: 503 }); }
}
