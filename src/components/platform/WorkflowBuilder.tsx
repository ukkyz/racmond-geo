"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { ModuleHeader } from "@/components/platform/PlatformShell";
import { Button, Badge } from "@/components/ui";
import {
  NODE_CATALOG,
  catalogFor,
  defaultWorkflow,
  executionOrder,
  makeEdge,
  makeNode,
  type NodeData,
  type NodeKind,
} from "@/lib/platform/workflows";

const LATENCY: Record<NodeKind, number> = {
  trigger: 200,
  condition: 150,
  http: 420,
  delay: 1200,
  transform: 220,
  ai: 800,
  cli: 1000,
  notify: 250,
  group: 300,
};

function Handles({ source = true, target = true }: { source?: boolean; target?: boolean }) {
  return (
    <>
      {target ? <Handle type="target" position={Position.Left} /> : null}
      {source ? <Handle type="source" position={Position.Right} /> : null}
    </>
  );
}

function WfNode({ data, selected }: NodeProps) {
  const d = data as NodeData & { onToggle?: () => void };
  const cat = catalogFor(d.kind);
  const color = cat?.color ?? "#8b5cf6";

  if (d.kind === "group") {
    const collapsed = Boolean(d.collapsed);
    return (
      <div className="flow-group-node">
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <button
          type="button"
          onClick={() => d.onToggle?.()}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-[var(--glass-card-hover)]"
        >
          <svg
            viewBox="0 0 16 16"
            className={`h-3.5 w-3.5 transition-transform ${collapsed ? "" : "rotate-90"}`}
            fill="none"
          >
            <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">{d.label}</span>
          <span className="ml-auto rounded-md bg-purple-500/18 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-text)]">
            {collapsed ? "collapsed" : "expanded"}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flow-action-node${selected ? " flow-action-node-selected" : ""}`}
      style={{ borderColor: selected ? color : undefined }}
    >
      <Handles />
      <div className="flex items-center gap-2">
        <span
          className="grid h-6 w-6 flex-none place-items-center rounded-lg text-[12px]"
          style={{ background: `${color}22`, color }}
        >
          {cat?.icon ?? "•"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
            {d.label}
          </p>
          <p className="truncate text-[10.5px] text-[var(--text-muted)]">
            {Object.values(d.params).slice(0, 1).join(" · ") || d.description}
          </p>
        </div>
        <span
          className="ml-auto h-2 w-2 flex-none rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}` }}
        />
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { wf: WfNode };

/** Collapse group children and re-parent their downstream edges. */
function deriveVisible(nodes: Node[], edges: Edge[], collapsed: Set<string>) {
  if (collapsed.size === 0) return { nodes, edges };
  const hidden = new Set<string>();
  edges.forEach((e) => {
    if (collapsed.has(e.source)) hidden.add(e.target);
  });
  const visibleNodes = nodes.filter((n) => !hidden.has(n.id));
  const reparent = new Map<string, string>();
  edges.forEach((e) => {
    if (hidden.has(e.source) && !hidden.has(e.target)) {
      reparent.set(e.target, e.source);
    }
  });
  const visibleEdges = edges.filter(
    (e) => !hidden.has(e.source) && !hidden.has(e.target),
  );
  reparent.forEach((group, target) => {
    if (collapsed.has(group)) {
      const exists = visibleEdges.some(
        (e) => e.source === group && e.target === target,
      );
      if (!exists && group !== target) {
        visibleEdges.push(makeEdge(group, target));
      }
    }
  });
  return { nodes: visibleNodes, edges: visibleEdges };
}

export default function WorkflowBuilder() {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner />
    </ReactFlowProvider>
  );
}

function WorkflowBuilderInner() {
  const initial = useMemo(() => defaultWorkflow(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(["group-ci"]),
  );
  const [runState, setRunState] = useState<
    Record<string, { status: string; latency: number }>
  >({});
  const [running, setRunning] = useState(false);
  const [template, setTemplate] = useState("release");
  const timers = useRef<number[]>([]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, animated: true }, eds)),
    [setEdges],
  );

  const toggleGroup = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, collapsed: !collapsed.has(id) } } : n)),
    );
  }, [collapsed, setNodes]);

  const { screenToFlowPosition } = useReactFlow();

  const onDrop = useCallback(
    (event: ReactDragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/reactflow") as NodeKind;
      if (!kind) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setNodes((ns) => [...ns, makeNode(kind, position)]);
    },
    [screenToFlowPosition, setNodes],
  );

  const visible = useMemo(
    () => deriveVisible(nodes, edges, collapsed),
    [nodes, edges, collapsed],
  );

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const selectedData = (selected?.data ?? null) as (NodeData & { id?: string }) | null;

  const setNodeData = (patch: Partial<NodeData>) => {
    if (!selectedId) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    );
  };

  const setParam = (key: string, value: string) => {
    if (!selectedId) return;
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== selectedId) return n;
        const data = n.data as NodeData;
        return {
          ...n,
          data: { ...data, params: { ...data.params, [key]: value } },
        };
      }),
    );
  };

  const loadTemplate = (which: string) => {
    if (which === "release") {
      const wf = defaultWorkflow();
      setNodes(wf.nodes);
      setEdges(wf.edges);
      setCollapsed(new Set(["group-ci"]));
      setTemplate("release");
    } else {
      setNodes([makeNode("trigger", { x: -40, y: 0 })]);
      setEdges([]);
      setCollapsed(new Set());
      setTemplate("empty");
    }
    setSelectedId(null);
    setRunState({});
  };

  const clearAll = () => {
    setNodes([]);
    setEdges([]);
    setCollapsed(new Set());
    setSelectedId(null);
    setRunState({});
  };

  const runFlow = () => {
    if (running) return;
    const order = executionOrder(nodes, edges);
    setRunning(true);
    setRunState({});
    let i = 0;
    const step = () => {
      if (i >= order.length) {
        setRunning(false);
        return;
      }
      const node = order[i];
      const latency = LATENCY[(node.data as NodeData).kind] ?? 300;
      setRunState((r) => ({ ...r, [node.id]: { status: "running", latency } }));
      const t = window.setTimeout(() => {
        setRunState((r) => ({
          ...r,
          [node.id]: { status: "success", latency },
        }));
        i += 1;
        step();
      }, latency);
      timers.current.push(t);
    };
    step();
  };

  const totalLatency = Object.values(runState).reduce((a, r) => a + r.latency, 0);
  const successCount = Object.values(runState).filter((r) => r.status === "success").length;

  return (
    <div className="fade-in grid gap-5 lg:grid-cols-[220px_1fr_320px]">
      <div className="space-y-5">
        <ModuleHeader
          eyebrow="Module · Automation"
          title="Workflow Builder"
          description="Compose triggers, conditions, actions and AI steps into a DAG. Groups collapse into a single parent."
          actions={null}
        />

        <div className="glass-card rounded-2xl p-3">
          <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Node palette
          </p>
          <div className="space-y-1.5">
            {NODE_CATALOG.map((c) => (
              <button
                key={c.kind}
                type="button"
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData("application/reactflow", c.kind)
                }
                onClick={() =>
                  setNodes((ns) => [...ns, makeNode(c.kind, { x: Math.random() * 200, y: Math.random() * 300 })])
                }
                className="group flex w-full items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-input)] p-2 text-left transition hover:border-[var(--glass-border-strong)] hover:bg-[var(--glass-card-hover)]"
                title={`${c.label} — ${c.description}`}
              >
                <span
                  className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[12px]"
                  style={{ background: `${c.color}22`, color: c.color }}
                >
                  {c.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-[var(--text-primary)]">{c.label}</span>
                  <span className="block truncate text-[10px] text-[var(--text-muted)]">{c.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-3">
          <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Tools
          </p>
          <div className="flex flex-col gap-1.5">
            <Button onClick={runFlow} disabled={running} className="w-full justify-center">
              {running ? "Running…" : "▶ Run workflow"}
            </Button>
            <Button variant="subtle" className="w-full justify-center" onClick={() => loadTemplate("release")}>
              Release template
            </Button>
            <Button variant="ghost" className="w-full justify-center" onClick={clearAll}>
              Clear canvas
            </Button>
          </div>
          <p className="mt-3 px-1 text-[10.5px] text-[var(--text-subtle)]">
            Drag nodes onto the canvas or click to add. Click a node to edit it.
          </p>
        </div>

        {runState && Object.keys(runState).length > 0 ? (
          <div className="glass-card rounded-2xl p-3">
            <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Run trace
            </p>
            <div className="space-y-1">
              {executionOrder(nodes, edges).map((n) => {
                const r = runState[n.id];
                return (
                  <div key={n.id} className="flex items-center gap-2 text-[11.5px]">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        r?.status === "success"
                          ? "bg-emerald-400"
                          : r?.status === "running"
                            ? "bg-fuchsia-400"
                            : "bg-slate-500"
                      }`}
                    />
                    <span className="truncate text-[var(--text-secondary)]">{(n.data as NodeData).label}</span>
                    {r ? (
                      <span className="ml-auto font-mono text-[10.5px] text-[var(--text-muted)]">
                        {r.latency}ms
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 px-1 text-[11px] text-[var(--text-muted)]">
              {successCount} nodes executed · {(totalLatency / 1000).toFixed(2)}s elapsed
            </p>
          </div>
        ) : null}
      </div>

      {/* Canvas */}
      <div className="glass-card relative overflow-hidden rounded-2xl" style={{ minHeight: 560 }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={visible.nodes}
            edges={visible.edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            nodesConnectable
            defaultEdgeOptions={{ type: "smoothstep", animated: running }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="rgba(196,181,253,0.24)" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeStrokeWidth={3}
              nodeColor={(n) => (catalogFor((n.data as NodeData)?.kind)?.color ?? "#8b5cf6")}
              maskColor="rgba(12,5,28,0.72)"
            />
          </ReactFlow>
        </ReactFlowProvider>
        <div className="pointer-events-none absolute left-3 top-3 z-10">
          <Badge tone="slate">{nodes.length} nodes · {edges.length} edges</Badge>
        </div>
      </div>

      {/* Properties */}
      <div className="space-y-4">
        <div className="glass-card rounded-2xl p-4">
          {selectedData ? (
            <>
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="grid h-8 w-8 place-items-center rounded-lg"
                  style={{ background: `${catalogFor(selectedData.kind)?.color}22`, color: catalogFor(selectedData.kind)?.color }}
                >
                  {catalogFor(selectedData.kind)?.icon}
                </span>
                <div>
                  <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                    {catalogFor(selectedData.kind)?.label}
                  </p>
                  <p className="text-[10.5px] text-[var(--text-muted)]">{selectedData.description}</p>
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Label
                </span>
                <input
                  value={selectedData.label}
                  onChange={(e) => setNodeData({ label: e.target.value })}
                  className="glass-input w-full rounded-xl px-3 py-2 text-[12.5px] outline-none"
                />
              </label>
              {selectedData.kind !== "group" ? (
                <div className="mt-3 space-y-2">
                  {Object.entries(selectedData.params).map(([k, v]) => (
                    <label key={k} className="block">
                      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                        {k}
                      </span>
                      <input
                        value={v}
                        onChange={(e) => setParam(k, e.target.value)}
                        className="glass-input w-full rounded-xl px-3 py-2 text-[12px] font-mono outline-none"
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--glass-border)] p-3">
                  <span className="text-[12px] text-[var(--text-muted)]">
                    {selectedData.collapsed ? "Collapsed" : "Expanded"}
                  </span>
                  <Button
                    variant="subtle"
                    onClick={() => selectedId && toggleGroup(selectedId)}
                  >
                    Toggle
                  </Button>
                </div>
              )}
              <p className="mt-3 font-mono text-[10px] text-[var(--text-subtle)]">id: {selectedId}</p>
            </>
          ) : (
            <p className="py-6 text-center text-[12px] text-[var(--text-subtle)]">
              Select a node to edit its properties.
            </p>
          )}
        </div>

        <div className="glass-card rounded-2xl p-4">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Templates
          </p>
          <div className="space-y-1.5">
            {[
              { id: "release", name: "Release pipeline", desc: "Webhook → CI → condition → rollout → notify" },
              { id: "empty", name: "Empty canvas", desc: "Start from a single trigger" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => loadTemplate(t.id)}
                className={`block w-full rounded-xl border p-3 text-left transition ${
                  template === t.id
                    ? "border-purple-500/40 bg-purple-500/10"
                    : "border-[var(--glass-border)] bg-[var(--glass-input)] hover:bg-[var(--glass-card-hover)]"
                }`}
              >
                <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">{t.name}</p>
                <p className="text-[11px] text-[var(--text-muted)]">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Execution model
          </p>
          <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
            Runs walk the DAG in topological order from triggers. Conditions
            branch the trace, and group nodes collapse their sub-flow into a
            single parent — the same convention used by the APM service map.
          </p>
        </div>
      </div>
    </div>
  );
}
