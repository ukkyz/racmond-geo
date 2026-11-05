import type { Instrumentation } from 'next';
import { context, trace } from '@opentelemetry/api';
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.OTEL_SDK_DISABLED === 'true' || !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  const { registerNodeTelemetry } = await import('./instrumentation.node');
  await registerNodeTelemetry();
}
export const onRequestError: Instrumentation.onRequestError = (error, request, ctx) => {
  const span = trace.getSpan(context.active());
  span?.recordException(error instanceof Error ? error : new Error(String(error)));
  span?.setAttribute('next.route', request.path); span?.setAttribute('next.route_type', ctx.routeType);
};
