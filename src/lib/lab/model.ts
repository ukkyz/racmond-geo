export const LAB_SERVICES = [
  { id: 'commerce', name: 'Commerce gateway', short: 'Gateway', language: 'Next.js', color: '#60a5fa', store: 'HTTP orchestration', port: 3000 },
  { id: 'crm', name: 'Customer & credit', short: 'CRM', language: 'PHP · Laravel', color: '#fb7185', store: 'MongoDB', port: 8001 },
  { id: 'erp', name: 'Inventory & reservations', short: 'ERP', language: 'Rust · Axum', color: '#fbbf24', store: 'PostgreSQL', port: 8002 },
  { id: 'assets', name: 'Asset allocation', short: 'Assets', language: 'Go', color: '#2dd4bf', store: 'Redis Streams', port: 8003 },
  { id: 'accounting', name: 'Double-entry ledger', short: 'Accounting', language: 'Java · Spring Boot', color: '#c084fc', store: 'PostgreSQL', port: 8004 },
] as const;
export type ServiceId = typeof LAB_SERVICES[number]['id'];
export type Scenario = 'happy' | 'slow-db' | 'credit-decline' | 'stock-conflict' | 'duplicate-replay' | 'gc-pressure';
export const SCENARIOS: { id: Scenario; name: string; description: string; expected: string }[] = [
  { id: 'happy', name: 'Rack-to-revenue', description: 'A complete order across all five services and three data engines.', expected: 'Invoice posted · balanced journal' },
  { id: 'slow-db', name: 'Slow accounting database', description: 'Inject 850 ms of database latency into the accounting consumer.', expected: 'One slow PostgreSQL span' },
  { id: 'credit-decline', name: 'Credit limit exceeded', description: 'CRM rejects the order before stock or assets are touched.', expected: 'Early exit · no journal' },
  { id: 'stock-conflict', name: 'Inventory conflict', description: 'ERP cannot reserve the requested stock. No asset is allocated.', expected: 'Reservation rejected' },
  { id: 'duplicate-replay', name: 'Idempotent replay', description: 'Replay the selected order and verify that money and stock do not move twice.', expected: 'Same invoice · no duplicate charge' },
  { id: 'gc-pressure', name: 'Allocation pressure', description: 'Generate bounded, short-lived allocations in Java and Go while processing.', expected: 'Completed order · GC activity' },
];
export const UNIT_PRICE_CENTS = 240000;
export const CREDIT_LIMIT_CENTS = 10000000;
export interface LabSpan {
  traceId: string; spanId: string; parentSpanId: string | null;
  service: ServiceId; operation: string; kind: 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER' | 'INTERNAL';
  startMs: number; durationMs: number; status: 'ok' | 'error';
  attributes: Record<string, string | number | boolean>;
}
export interface LabOrder {
  id: string; scenario: Scenario; mode: 'demo' | 'live'; status: 'completed' | 'rejected' | 'pending' | 'failed';
  createdAt: string; amountCents: number; quantity: number; traceId: string; invoiceId: string | null;
  assetId: string | null; replayed: boolean; message: string; spans: LabSpan[];
}
export function validateOrderInput(value: unknown): { errors: string[]; quantity: number; scenario: Scenario; replayOrderId?: string } {
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const quantity = body.quantity ?? 1;
  const scenario = body.scenario ?? 'happy';
  const errors: string[] = [];
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) errors.push('Quantity must be an integer from 1 to 10.');
  if (!SCENARIOS.some(s => s.id === scenario)) errors.push('Unknown scenario.');
  if (body.replayOrderId !== undefined && (typeof body.replayOrderId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.replayOrderId))) errors.push('Invalid replay order ID.');
  if (scenario === 'duplicate-replay' && !body.replayOrderId) errors.push('Run an order before replaying it.');
  return { errors, quantity: quantity as number, scenario: scenario as Scenario, replayOrderId: body.replayOrderId as string | undefined };
}
export function traceDuration(spans: LabSpan[]): number {
  if (!spans.length) return 0;
  return Math.max(...spans.map(s => s.startMs + s.durationMs)) - Math.min(...spans.map(s => s.startMs));
}
export function flattenSpans(spans: LabSpan[]): (LabSpan & { depth: number })[] {
  const result: (LabSpan & { depth: number })[] = [];
  const visited = new Set<string>();
  const visit = (parent: string | null, depth: number) => {
    spans.filter(s => s.parentSpanId === parent && !visited.has(s.spanId)).sort((a,b) => a.startMs - b.startMs).forEach(s => {
      visited.add(s.spanId); result.push({ ...s, depth }); visit(s.spanId, depth + 1);
    });
  };
  visit(null, 0);
  spans.filter(s => !visited.has(s.spanId)).forEach(s => { visited.add(s.spanId); result.push({ ...s, depth: 0 }); });
  return result;
}
