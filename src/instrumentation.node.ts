export async function registerNodeTelemetry() {
  const [{ NodeSDK }, { getNodeAutoInstrumentations }, { OTLPTraceExporter }, { resourceFromAttributes, defaultResource }, { W3CTraceContextPropagator }] = await Promise.all([
    import('@opentelemetry/sdk-node'), import('@opentelemetry/auto-instrumentations-node'), import('@opentelemetry/exporter-trace-otlp-http'), import('@opentelemetry/resources'), import('@opentelemetry/core'),
  ]);
  const sdk = new NodeSDK({
    resource: defaultResource().merge(resourceFromAttributes({ 'service.name': process.env.OTEL_SERVICE_NAME || 'commerce', 'service.namespace': 'racmond-lab' })),
    traceExporter: new OTLPTraceExporter({ url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT!.replace(/\/$/, '')}/v1/traces` }),
    instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false }, '@opentelemetry/instrumentation-http': { ignoreIncomingRequestHook: req => !!req.url?.includes('/api/runtime') || !!req.url?.includes('/_next/') } })],
    textMapPropagator: new W3CTraceContextPropagator(),
  });
  sdk.start();
  process.once('SIGTERM', () => { void sdk.shutdown().finally(() => process.exit(0)); });
}
