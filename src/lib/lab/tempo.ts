import { LAB_SERVICES, type LabSpan, type ServiceId } from './model';
interface OtlpValue { stringValue?: string; intValue?: string | number; boolValue?: boolean; doubleValue?: number }
interface OtlpAttribute { key: string; value?: OtlpValue }
interface OtlpSpan { traceId: string; spanId: string; parentSpanId?: string; name: string; kind?: number; startTimeUnixNano: string; endTimeUnixNano: string; attributes?: OtlpAttribute[]; status?: { code?: number } }
export function decodeTempoTrace(payload: unknown): LabSpan[] {
  const valueOf = (a: OtlpAttribute): string | number | boolean => a.value?.stringValue ?? a.value?.boolValue ?? Number(a.value?.intValue ?? a.value?.doubleValue ?? 0);
  const batches = (payload as { batches?: { resource?: { attributes?: OtlpAttribute[] }; scopeSpans?: { spans?: OtlpSpan[] }[] }[] })?.batches ?? [];
  const result: LabSpan[] = [];
  for (const batch of batches) {
    const resource = Object.fromEntries((batch.resource?.attributes ?? []).map(a => [a.key, valueOf(a)]));
    const service = LAB_SERVICES.find(s => s.id === resource['service.name'])?.id ?? 'commerce' as ServiceId;
    for (const { spans = [] } of batch.scopeSpans ?? []) for (const span of spans) {
      const start = Number(BigInt(span.startTimeUnixNano) / BigInt(1000000));
      const end = Number(BigInt(span.endTimeUnixNano) / BigInt(1000000));
      result.push({ traceId: span.traceId, spanId: span.spanId, parentSpanId: span.parentSpanId || null, service, operation: span.name,
        kind: (['INTERNAL','SERVER','CLIENT','PRODUCER','CONSUMER'] as const)[(span.kind ?? 1) - 1] ?? 'INTERNAL',
        startMs: start, durationMs: Math.max(0, end - start), status: span.status?.code === 2 ? 'error' : 'ok',
        attributes: Object.fromEntries((span.attributes ?? []).map(a => [a.key, valueOf(a)])),
      });
    }
  }
  return result.sort((a,b) => a.startMs - b.startMs);
}
