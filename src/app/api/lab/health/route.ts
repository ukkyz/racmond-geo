import { NextResponse } from 'next/server';
import { labConfig, labFetch } from '@/lib/lab/store';
import { LAB_SERVICES } from '@/lib/lab/model';
export const dynamic = 'force-dynamic';
export async function GET() {
  const config = labConfig();
  const services = await Promise.all(LAB_SERVICES.map(async service => {
    if (!config.enabled) return { id: service.id, available: false, status: 'not configured' };
    if (service.id === 'commerce') return { id: service.id, available: true, status: 'healthy' };
    try {
      const res = await labFetch(`${config.urls[service.id as 'crm' | 'erp' | 'assets' | 'accounting']}/health`, {}, 2500);
      return { id: service.id, available: res.ok, status: res.ok ? 'healthy' : `HTTP ${res.status}` };
    } catch { return { id: service.id, available: false, status: 'unreachable' }; }
  }));
  return NextResponse.json({ liveEnabled: config.enabled, services });
}
