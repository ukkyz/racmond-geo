"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { ModuleHeader } from "@/components/platform/PlatformShell";
import { Button, Badge } from "@/components/ui";
import {
  createApmGraphs,
  sampleTrace,
  type ApmGraph,
  type ApmService,
  type TraceSpan,
} from "@/lib/platform/apm";

const LANG_COLOR: Record<string, string> = {
  java: "#f97316",
  node: "#38bdf8",
  go: "#34d399",
  python: "#fbbf24",
  rust: "#f472b6",
};

type ApmKind = "service" | "instance" | "op";

interface ApmMeta {
  language?: string;
  instances?: number;
  host?: string;
  cpu?: number;
  rpm?: number;
}

interface ApmData {
  kind: ApmKind;
  label: string;
  meta: unknown;
  metric: { p99: number; error: number };
  collapsed?: boolean;
  onToggle?: () => void;
  onOpen?: () => void;
  [key: string]: unknown;
}

function HandleSet({ target, source }: { target?: boolean; source?: boolean }) {
  return (
    <>
      {target ? <Handle type="target" position={Position.Left} /> : null}
      {source ? <Handle type="source" position={Position.Right} /> : null}
    </>
  );
}

function errorColor(error: number) {
  if (error >= 2) return "#ef4444";
  if (error >= 0.8) return "#f59e0b";
  return "#10b981";
}

function ServiceNode({ data, selected }: NodeProps) {
  const d = data as ApmData;
  const m = d.meta as ApmMeta;
  return (
    <div className={`apm-service-node${selected ? " apm-node-selected" : ""}`}>
      <HandleSet target source />
      <button
        type="button"
        onClick={() => d.onToggle?.()}
        className="flex w-full items-center gap-2"
      >
        <svg
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 transition-transform ${d.collapsed ? "" : "rotate-90"}`}
          fill="none"
        >
          <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span
          className="rounded px-1 py-0.5 text-[9px] font-bold uppercase"
          style={{ background: `${LANG_COLOR[m.language ?? ""] ?? "#a855f7"}22`, color: LANG_COLOR[m.language ?? ""] ?? "#a855f7" }}
        >
          {m.language ?? "svc"}
        </span>
        <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{d.label}</span>
      </button>
      <div className="mt-1.5 flex items-center gap-3 px-1 text-[10.5px]">
        <span className="font-mono text-[var(--text-muted)]">p99 {d.metric.p99}ms</span>
        <span className="font-mono" style={{ color: errorColor(d.metric.error) }}>
          err {d.metric.error}%
        </span>
        <span className="ml-auto rounded-md bg-purple-500/15 px-1.5 py-0.5 font-semibold text-[var(--accent-text)]">
          {m.instances ?? 0} inst
        </span>
      </div>
    </div>
  );
}

function InstanceNode({ data, selected }: NodeProps) {
  const d = data as ApmData;
  const m = d.meta as ApmMeta;
  return (
    <div className={`apm-instance-node${selected ? " apm-node-selected" : ""}`}>
      <HandleSet target source />
      <button type="button" onClick={() => d.onToggle?.()} className="flex w-full items-center gap-1.5">
        <svg
          viewBox="0 0 16 16"
          className={`h-3 w-3 transition-transform ${d.collapsed ? "" : "rotate-90"}`}
          fill="none"
        >
          <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{d.label}</span>
      </button>
      <div className="mt-1 flex items-center gap-2 px-1 text-[10px] font-mono">
        <span className="truncate text-[var(--text-muted)]">
          {m.host ?? "—"} · cpu {m.cpu ?? 0}%
        </span>
        <span style={{ color: errorColor(d.metric.error) }}>err {d.metric.error}%</span>
      </div>
    </div>
  );
}

function OpNode({ data, selected }: NodeProps) {
  const d = data as ApmData;
  const rpm = (d.meta as ApmMeta).rpm ?? 0;
  return (
    <div className={`apm-op-node${selected ? " apm-node-selected" : ""}`} style={{ borderColor: errorColor(d.metric.error) }}>
      <HandleSet target={false} source={false} />
      <Handle type="target" position={Position.Left} />
      <button type="button" onClick={() => d.onOpen?.()} className="block w-full text-left">
        <span className="block truncate text-[11.5px] font-medium text-[var(--text-primary)]">{d.label}</span>
        <span className="block font-mono text-[9.5px] text-[var(--text-muted)]">
          p99 {d.metric.p99}ms · {rpm} rpm
        </span>
      </button>
    </div>
  );
}

const nodeTypes: NodeTypes = { service: ServiceNode, instance: InstanceNode, op: OpNode };

function buildGraph(graph: ApmGraph, onToggle: (id: string) => void, onOpen: (svc: ApmService) => void) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  graph.services.forEach((svc, si) => {
    const svcId = `svc:${svc.id}`;
    nodes.push({
      id: svcId,
      type: "service",
      position: { x: -80, y: si * 300 },
      data: {
        kind: "service",
        label: svc.name,
        meta: { language: svc.language, instances: svc.instances.length },
        metric: { p99: svc.p99, error: svc.error },
        collapsed: false,
        onToggle: () => onToggle(svcId),
        onOpen: () => onOpen(svc),
      } satisfies ApmData,
    });

    svc.instances.forEach((inst, ii) => {
      const instId = `inst:${inst.id}`;
      nodes.push({
        id: instId,
        type: "instance",
        position: { x: 240, y: si * 300 + (ii - (svc.instances.length - 1) / 2) * 92 },
        data: {
          kind: "instance",
          label: inst.name,
          meta: { host: inst.host, cpu: inst.cpu },
          metric: { p99: inst.p99, error: inst.error },
          collapsed: false,
          onToggle: () => onToggle(instId),
          onOpen: () => onOpen(svc),
        } satisfies ApmData,
      });
      edges.push({
        id: `${svcId}--${instId}`,
        source: svcId,
        target: instId,
        type: "smoothstep",
        style: { stroke: "rgba(192,132,252,0.5)", strokeWidth: 1.4 },
      });

      inst.ops.forEach((op, oi) => {
        const opId = `op:${op.id}`;
        nodes.push({
          id: opId,
          type: "op",
          position: {
            x: 470,
            y: si * 300 + (ii - (svc.instances.length - 1) / 2) * 92 + oi * 52,
          },
          data: {
            kind: "op",
            label: op.name,
            meta: { rpm: op.rpm },
            metric: { p99: op.p99, error: op.error },
            onOpen: () => onOpen(svc),
          } satisfies ApmData,
        });
        edges.push({
          id: `${instId}--${opId}`,
          source: instId,
          target: opId,
          type: "smoothstep",
          style: { stroke: errorColor(op.error), strokeWidth: 1.2, opacity: 0.7 },
        });
      });
    });
  });

  graph.calls.forEach((call) => {
    const from = `svc:${call.from}`;
    const to = `svc:${call.to}`;
    const latency = call.p99;
    const color = latency <= 30 ? "#10b981" : latency <= 80 ? "#f59e0b" : "#ef4444";
    edges.push({
      id: `call:${call.from}--${call.to}`,
      source: from,
      target: to,
      type: "smoothstep",
      label: `${latency}ms · ${call.error}%`,
      labelStyle: { fill: color, fontSize: 9, fontWeight: 700 },
      labelBgStyle: { fill: "rgba(15,8,32,0.85)" },
      animated: call.error > 1,
      style: { stroke: color, strokeWidth: 1.8, strokeDasharray: "5 4" },
    });
  });

  return { nodes, edges };
}

/** Collapse a node's descendants and re-parent their edges. */
function deriveApm(nodes: Node[], edges: Edge[], collapsed: Set<string>) {
  if (collapsed.size === 0) return { nodes, edges };
  const parent = new Map<string, string>();
  edges.forEach((e) => {
    const d = nodes.find((n) => n.id === e.source)?.data as ApmData | undefined;
    if (d?.kind === "service") parent.set(e.target, e.source);
  });
  const hidden = new Set<string>();
  const mark = (id: string) => {
    for (const [child, p] of parent) {
      if (p === id && !hidden.has(child)) {
        hidden.add(child);
        mark(child);
      }
    }
  };
  collapsed.forEach((id) => mark(id));

  const nearestVisible = (id: string): string => {
    let cur = id;
    while (hidden.has(cur) && parent.has(cur)) cur = parent.get(cur)!;
    return cur;
  };

  const visibleNodes = nodes
    .filter((n) => !hidden.has(n.id))
    .map((n) =>
      collapsed.has(n.id)
        ? { ...n, data: { ...n.data, collapsed: true } }
        : n,
    );
  const visibleEdges = edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target));
  const seen = new Set(visibleEdges.map((e) => `${e.source}--${e.target}`));
  edges.forEach((e) => {
    if (hidden.has(e.source) && !hidden.has(e.target)) {
      const src = nearestVisible(e.source);
      if (src && src !== e.target) {
        const key = `${src}--${e.target}`;
        if (!seen.has(key)) {
          seen.add(key);
          visibleEdges.push({ ...e, source: src, id: `${src}--${e.target}` });
        }
      }
    }
  });
  return { nodes: visibleNodes, edges: visibleEdges };
}

export default function ApmServiceMap() {
  const graphs = useMemo(() => createApmGraphs(), []);
  const [graphId, setGraphId] = useState(graphs[0]?.id ?? "payments");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selectedSvc, setSelectedSvc] = useState<ApmService | null>(null);
  const [showTrace, setShowTrace] = useState(true);

  const graph = graphs.find((g) => g.id === graphId) ?? graphs[0]!;

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const graphData = useMemo(
    () => buildGraph(graph, toggle, (svc) => setSelectedSvc(svc)),
    [graph, toggle],
  );
  const visible = useMemo(
    () => deriveApm(graphData.nodes, graphData.edges, collapsed),
    [graphData, collapsed],
  );

  const kpis = useMemo(() => {
    const services = graph.services;
    const instances = services.reduce((a, s) => a + s.instances.length, 0);
    const ops = services.reduce((a, s) => a + s.instances.reduce((b, i) => b + i.ops.length, 0), 0);
    const avgP99 = services.reduce((a, s) => a + s.p99, 0) / services.length;
    const avgErr = services.reduce((a, s) => a + s.error, 0) / services.length;
    const rpm = services.reduce((a, s) => a + s.rpm, 0);
    return { services: services.length, instances, ops, avgP99, avgErr, rpm };
  }, [graph]);

  const trace: TraceSpan[] = useMemo(
    () => (selectedSvc ? sampleTrace(selectedSvc) : []),
    [selectedSvc],
  );
  const traceMax = trace.reduce((m, s) => Math.max(m, s.duration), 1);

  return (
    <div className="fade-in space-y-5">
      <ModuleHeader
        eyebrow="Module · APM"
        title="Service map & trace explorer"
        description="A Pinpoint / Jaeger-style call graph. Each domain is its own @xyflow/react canvas; nodes form a service → instance → operation hierarchy that expands and collapses. Dashed edges are cross-service calls with p99 latency and error rate."
        actions={
          <Button variant={showTrace ? "subtle" : "ghost"} onClick={() => setShowTrace((v) => !v)}>
            {showTrace ? "Trace panel on" : "Trace panel off"}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Kpi label="Services" value={kpis.services} tone="text-[var(--text-primary)]" />
        <Kpi label="Instances" value={kpis.instances} tone="text-violet-400" />
        <Kpi label="Operations" value={kpis.ops} tone="text-sky-400" />
        <Kpi label="Avg p99" value={`${kpis.avgP99.toFixed(0)}ms`} tone="text-amber-400" />
        <Kpi label="Avg error" value={`${kpis.avgErr.toFixed(1)}%`} tone="text-rose-400" />
        <Kpi label="Requests/min" value={kpis.rpm.toLocaleString()} tone="text-emerald-400" />
      </div>

      <div className="flex flex-wrap gap-2">
        {graphs.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => {
              setGraphId(g.id);
              setCollapsed(new Set());
              setSelectedSvc(null);
            }}
            className={`rounded-xl border px-3.5 py-1.5 text-[12.5px] font-medium transition ${
              graphId === g.id
                ? "border-purple-500/40 bg-gradient-to-r from-violet-600/25 to-fuchsia-600/18 text-[var(--text-primary)]"
                : "border-[var(--glass-border)] bg-[var(--glass-input)] text-[var(--text-muted)] hover:bg-[var(--glass-card-hover)]"
            }`}
          >
            {g.name}
            <span className="ml-2 rounded-md bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-text)]">
              {g.environment}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="glass-card relative overflow-hidden rounded-2xl" style={{ minHeight: 620 }}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={visible.nodes}
              edges={visible.edges}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.12}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              defaultEdgeOptions={{ type: "smoothstep" }}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="rgba(196,181,253,0.24)" />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeStrokeWidth={3}
                nodeColor={(n) => {
                  const d = n.data as ApmData;
                  if (d.kind === "service") return "#a855f7";
                  if (d.kind === "instance") return "#c084fc";
                  return errorColor(d.metric.error);
                }}
                maskColor="rgba(12,5,28,0.72)"
              />
            </ReactFlow>
          </ReactFlowProvider>
          <div className="pointer-events-none absolute left-3 top-3 z-10 space-y-1.5">
            <Badge tone="slate">{graph.name}</Badge>
            <Badge tone="violet">{graph.description}</Badge>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap gap-2 text-[10.5px]">
            <span className="glass-pill rounded-lg px-2.5 py-1 text-[var(--text-secondary)]">● Service</span>
            <span className="glass-pill rounded-lg px-2.5 py-1 text-[var(--text-secondary)]">● Instance</span>
            <span className="glass-pill rounded-lg px-2.5 py-1 text-[var(--text-secondary)]">● Operation</span>
            <span className="glass-pill rounded-lg px-2.5 py-1 text-[var(--text-secondary)]">┄ cross-service call</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
                {selectedSvc ? selectedSvc.name : "Service detail"}
              </h2>
              {selectedSvc ? (
                <button onClick={() => setSelectedSvc(null)} className="action-icon text-[12px]">✕</button>
              ) : null}
            </div>
            {selectedSvc ? (
              <div className="mt-3 space-y-2 text-[12px]">
                <Metric label="Language" value={selectedSvc.language} />
                <Metric label="p99 latency" value={`${selectedSvc.p99} ms`} />
                <Metric label="Error rate" value={`${selectedSvc.error} %`} />
                <Metric label="Throughput" value={`${selectedSvc.rpm} rpm`} />
                <Metric label="Instances" value={String(selectedSvc.instances.length)} />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selectedSvc.instances.slice(0, 4).map((i) => (
                    <Badge key={i.id} tone="violet">{i.name}</Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-[var(--text-muted)]">
                Select a service node (or expand it) to inspect its instances and
                operations, and to open a trace waterfall.
              </p>
            )}
          </div>

          {showTrace && trace.length > 0 ? (
            <div className="glass-card rounded-2xl p-4">
              <h3 className="mb-3 text-[13px] font-semibold text-[var(--text-primary)]">
                Trace waterfall
              </h3>
              <div className="space-y-2">
                {trace.map((span) => (
                  <div key={span.id} className="flex items-center gap-2" style={{ paddingLeft: span.depth * 14 }}>
                    <div className="relative min-w-[120px] flex-1">
                      <div
                        className="absolute top-1.5 bottom-1.5 rounded-md"
                        style={{
                          left: `${(span.start / traceMax) * 100}%`,
                          width: `${Math.max(6, (span.duration / traceMax) * 100)}%`,
                          background: span.error > 1 ? "rgba(239,68,68,0.5)" : "rgba(139,92,246,0.45)",
                          border: "1px solid rgba(196,181,253,0.4)",
                        }}
                      />
                      <p className="relative truncate text-[10.5px] font-mono text-[var(--text-secondary)]">
                        {span.operation}
                      </p>
                    </div>
                    <span className="w-14 flex-none text-right font-mono text-[10px] text-[var(--text-muted)]">
                      {(span.duration / 1000).toFixed(1)}ms
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10.5px] text-[var(--text-subtle)]">
                Bars are positioned by start time; width is proportional to duration.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--glass-divider)] py-2 last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
      <span className="font-mono text-[12px] font-semibold text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
