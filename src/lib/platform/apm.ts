// Deterministic APM dataset: services, instances, operations and the
// cross-service call graph. The APM page renders each domain as its own
// @xyflow/react canvas with a parent/child hierarchy.

export interface ApmOp {
  id: string;
  name: string;
  p99: number; // ms
  error: number; // %
  rpm: number;
}

export interface ApmInstance {
  id: string;
  name: string;
  host: string;
  p99: number;
  error: number;
  cpu: number;
  ops: ApmOp[];
}

export interface ApmService {
  id: string;
  name: string;
  language: string;
  p99: number;
  error: number;
  rpm: number;
  instances: ApmInstance[];
}

export interface ApmCall {
  from: string;
  to: string;
  p99: number;
  error: number;
  rpm: number;
}

export interface ApmGraph {
  id: string;
  name: string;
  environment: string;
  description: string;
  services: ApmService[];
  calls: ApmCall[];
}

function mulberry(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const OPS_BY_LANG: Record<string, string[]> = {
  java: ["GET /v1/payments", "POST /v1/payments", "GET /v1/payments/{id}", "POST /v1/refunds"],
  node: ["GET /api/users", "POST /api/orders", "GET /api/orders/{id}", "POST /api/checkout"],
  go: ["GET /healthz", "GET /metrics", "POST /v1/ingest", "GET /v1/query"],
  python: ["GET /ingest", "POST /ingest/batch", "GET /search", "POST /enrich"],
  rust: ["GET /edge/geo", "POST /edge/route", "GET /edge/health", "PUT /edge/config"],
};

interface Seed {
  name: string;
  language: string;
  baseP99: number;
  baseError: number;
  dependsOn: string[];
}

const DOMAINS: {
  id: string;
  name: string;
  environment: string;
  description: string;
  seeds: Seed[];
  calls: { from: string; to: string; p99: number; error: number }[];
}[] = [
  {
    id: "payments",
    name: "Payments domain",
    environment: "production",
    description: "Checkout → payments → ledger → notification",
    seeds: [
      { name: "api-gateway", language: "node", baseP99: 42, baseError: 0.2, dependsOn: ["payments-svc", "identity"] },
      { name: "payments-svc", language: "java", baseP99: 68, baseError: 0.5, dependsOn: ["ledger-svc", "notify-svc"] },
      { name: "ledger-svc", language: "java", baseP99: 35, baseError: 0.1, dependsOn: [] },
      { name: "notify-svc", language: "go", baseP99: 90, baseError: 2.4, dependsOn: [] },
      { name: "identity", language: "python", baseP99: 55, baseError: 0.8, dependsOn: [] },
    ],
    calls: [
      { from: "api-gateway", to: "payments-svc", p99: 42, error: 0.2 },
      { from: "payments-svc", to: "ledger-svc", p99: 28, error: 0.1 },
      { from: "payments-svc", to: "notify-svc", p99: 88, error: 2.1 },
      { from: "api-gateway", to: "identity", p99: 52, error: 0.6 },
    ],
  },
  {
    id: "platform",
    name: "Platform services",
    environment: "production",
    description: "Identity, config, audit and search",
    seeds: [
      { name: "identity-svc", language: "python", baseP99: 58, baseError: 0.6, dependsOn: ["audit-svc"] },
      { name: "config-svc", language: "go", baseP99: 22, baseError: 0.2, dependsOn: [] },
      { name: "audit-svc", language: "rust", baseP99: 31, baseError: 0.1, dependsOn: [] },
      { name: "search-svc", language: "java", baseP99: 120, baseError: 1.1, dependsOn: ["config-svc"] },
    ],
    calls: [
      { from: "identity-svc", to: "audit-svc", p99: 30, error: 0.1 },
      { from: "search-svc", to: "config-svc", p99: 18, error: 0.2 },
      { from: "search-svc", to: "audit-svc", p99: 26, error: 0.3 },
    ],
  },
  {
    id: "edge",
    name: "Edge & delivery",
    environment: "edge",
    description: "CDN, WAF, DNS and geo routing",
    seeds: [
      { name: "cdn-edge", language: "rust", baseP99: 14, baseError: 0.05, dependsOn: ["geo-router"] },
      { name: "waf", language: "go", baseP99: 9, baseError: 0.1, dependsOn: [] },
      { name: "dns", language: "go", baseP99: 4, baseError: 0.02, dependsOn: [] },
      { name: "geo-router", language: "rust", baseP99: 11, baseError: 0.08, dependsOn: ["dns"] },
    ],
    calls: [
      { from: "cdn-edge", to: "geo-router", p99: 11, error: 0.05 },
      { from: "geo-router", to: "dns", p99: 4, error: 0.02 },
    ],
  },
];

export function createApmGraphs(): ApmGraph[] {
  return DOMAINS.map((domain, di) => {
    const rand = mulberry(1000 + di * 97);
    const services: ApmService[] = domain.seeds.map((seed, si) => {
      const ops = OPS_BY_LANG[seed.language] ?? OPS_BY_LANG.node!;
      const instanceCount = 2 + Math.floor(rand() * 2);
      const instances: ApmInstance[] = Array.from({ length: instanceCount }, (_, ii) => {
        const serviceOps: ApmOp[] = ops.map((op, oi) => ({
          id: `${seed.name}-inst${ii}-op${oi}`,
          name: op,
          p99: Number((seed.baseP99 * (0.8 + rand() * 0.7) + oi * 4).toFixed(1)),
          error: Number((seed.baseError * (0.5 + rand())).toFixed(2)),
          rpm: Math.floor(40 + rand() * 900),
        }));
        return {
          id: `${seed.name}-inst${ii}`,
          name: `${seed.name}-${String.fromCharCode(97 + ii)}`,
          host: `10.${20 + si}.${Math.floor(rand() * 250)}.${10 + ii}`,
          p99: Number((seed.baseP99 * (0.9 + rand() * 0.4)).toFixed(1)),
          error: Number((seed.baseError * (0.6 + rand() * 0.6)).toFixed(2)),
          cpu: Number((8 + rand() * 60).toFixed(1)),
          ops: serviceOps,
        };
      });
      return {
        id: seed.name,
        name: seed.name,
        language: seed.language,
        p99: seed.baseP99,
        error: seed.baseError,
        rpm: Math.floor(500 + rand() * 2500),
        instances,
      };
    });
    const calls: ApmCall[] = domain.calls.map((c) => ({
      ...c,
      rpm: Math.floor(200 + rand() * 1200),
    }));
    return {
      id: domain.id,
      name: domain.name,
      environment: domain.environment,
      description: domain.description,
      services,
      calls,
    };
  });
}

/** A Jaeger-style sample trace for the selected service. */
export function sampleTrace(service: ApmService, rand = Math.random) {
  const firstOps = service.instances[0]?.ops ?? [];
  const root = firstOps[0];
  const base = 1000 + Math.floor(rand() * 4000);
  const spans = [
    {
      id: "root",
      service: service.name,
      operation: root?.name ?? "GET /",
      start: base,
      duration: Math.round((root?.p99 ?? 40) * 1000 * (0.8 + rand() * 0.6)),
      error: root?.error ?? 0,
      depth: 0,
    },
  ];
  firstOps.slice(1, 3).forEach((op, i) => {
    spans.push({
      id: `${op.name}`,
      service: service.name,
      operation: op.name,
      start: base + 200 + i * 120,
      duration: Math.round(op.p99 * 1000 * (0.7 + rand() * 0.6)),
      error: op.error,
      depth: 1,
    });
  });
  service.instances.slice(0, 2).forEach((inst, i) => {
    inst.ops.slice(0, 2).forEach((op, j) => {
      spans.push({
        id: `${inst.name}-${op.name}`,
        service: service.name,
        operation: `${inst.name} ${op.name}`,
        start: base + 300 + i * 260 + j * 90,
        duration: Math.round(op.p99 * 1000 * (0.6 + rand() * 0.5)),
        error: op.error,
        depth: 2,
      });
    });
  });
  return spans.sort((a, b) => a.start - b.start);
}

export interface TraceSpan {
  id: string;
  service: string;
  operation: string;
  start: number;
  duration: number;
  error: number;
  depth: number;
}
