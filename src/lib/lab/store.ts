import { context, propagation } from '@opentelemetry/api';
import type { LabOrder } from './model';
// Bounded process-local demo history. The Compose stack persists real business data separately.
const globalStore = globalThis as typeof globalThis & { racmondLabOrders?: Map<string, LabOrder> };
export const demoOrders = globalStore.racmondLabOrders ??= new Map<string, LabOrder>();
export function rememberOrder(order: LabOrder) {
  demoOrders.set(order.id, order);
  while (demoOrders.size > 100) demoOrders.delete(demoOrders.keys().next().value!);
}
export function labConfig() {
  return {
    enabled: process.env.LAB_ENABLED === 'true',
    urls: {
      crm: process.env.LAB_CRM_URL || 'http://localhost:8001',
      erp: process.env.LAB_ERP_URL || 'http://localhost:8002',
      assets: process.env.LAB_ASSETS_URL || 'http://localhost:8003',
      accounting: process.env.LAB_ACCOUNTING_URL || 'http://localhost:8004',
      tempo: process.env.LAB_TEMPO_URL || 'http://localhost:3200',
    },
    token: process.env.LAB_INTERNAL_TOKEN || '',
  };
}
export async function labFetch(url: string, init: RequestInit = {}, timeout = 8000) {
  const config = labConfig();
  const headers = new Headers(init.headers);
  if (config.token) headers.set('X-Racmond-Lab-Token', config.token);
  propagation.inject(context.active(), headers, { set: (carrier, key, value) => carrier.set(key, value) });
  return fetch(url, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(timeout) });
}
