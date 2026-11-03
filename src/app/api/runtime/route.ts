import { NextResponse } from 'next/server';
import { labConfig, labFetch } from '@/lib/lab/store';
import { demoRuntime, type RuntimeSnapshot } from '@/lib/lab/runtime';
import { isSameOrigin } from '@/lib/lab/request';
export const dynamic = 'force-dynamic';
const g = globalThis as typeof globalThis & { racmondRuntimeTick?: number; racmondPressureUntil?: number };
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') ?? 'demo';
  if (!['demo', 'live'].includes(mode)) return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 });
  const tick = g.racmondRuntimeTick = (g.racmondRuntimeTick ?? 0) + 1;
  if (mode === 'demo') return NextResponse.json({ snapshots: [demoRuntime('accounting', tick, (g.racmondPressureUntil ?? 0) > Date.now()), demoRuntime('assets', tick, (g.racmondPressureUntil ?? 0) > Date.now())] });
  const config = labConfig();
  const snapshots = await Promise.all((['accounting', 'assets'] as const).map(async service => {
    const base: RuntimeSnapshot = { ...demoRuntime(service, 0), source: 'live', available: false, heapUsed: 0, heapCommitted: 0, heapMax: 0, nonHeapUsed: 0, threads: 0, cpuPercent: 0, allocationBytes: 0, gcCount: 0, gcTimeMs: 0, pools: [], events: [], collectors: [], sampledAt: new Date().toISOString() };
    if (!config.enabled) return { ...base, error: 'Live lab is not configured.' };
    try {
      const res = await labFetch(`${config.urls[service]}/internal/runtime`, {}, 3000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as RuntimeSnapshot;
      if (!Array.isArray(data.pools) || !Array.isArray(data.events) || !Number.isFinite(data.heapUsed)) throw new Error('Invalid runtime payload.');
      return { ...data, service, language: service === 'accounting' ? 'java' : 'go', source: 'live', available: true } as RuntimeSnapshot;
    } catch (error) { return { ...base, error: error instanceof Error ? error.message : 'Runtime unavailable' }; }
  }));
  return NextResponse.json({ snapshots });
}
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Cross-origin workload is not allowed.' }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (body?.mode !== 'demo') return NextResponse.json({ error: 'Use the order lab allocation-pressure scenario for live workloads. This control only affects synthetic data.' }, { status: 400 });
  g.racmondPressureUntil = Date.now() + 20000;
  return NextResponse.json({ ok: true, durationSeconds: 20, source: 'demo' });
}
