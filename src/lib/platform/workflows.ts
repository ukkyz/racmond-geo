// Types + catalog + templates for the workflow automation builder.
import type { Edge, Node } from "@xyflow/react";

export type NodeKind =
  | "trigger"
  | "condition"
  | "http"
  | "delay"
  | "transform"
  | "ai"
  | "cli"
  | "notify"
  | "group";

export interface NodeData {
  kind: NodeKind;
  label: string;
  description: string;
  params: Record<string, string>;
  collapsed?: boolean;
  children?: number;
  [key: string]: unknown;
}

export const NODE_CATALOG: {
  kind: NodeKind;
  label: string;
  description: string;
  color: string;
  icon: string;
  defaults: Record<string, string>;
}[] = [
  {
    kind: "trigger",
    label: "Trigger",
    description: "Starts the workflow",
    color: "#10b981",
    icon: "⚡",
    defaults: { event: "webhook", source: "/deploy" },
  },
  {
    kind: "condition",
    label: "Condition",
    description: "Branch on a value",
    color: "#f59e0b",
    icon: "⋔",
    defaults: { field: "$.changelog", op: "exists", value: "true" },
  },
  {
    kind: "http",
    label: "HTTP request",
    description: "Call an API",
    color: "#0ea5e9",
    icon: "⇄",
    defaults: { method: "POST", url: "https://api.example.com/build" },
  },
  {
    kind: "delay",
    label: "Delay",
    description: "Wait for a duration",
    color: "#a78bfa",
    icon: "◷",
    defaults: { duration: "30s" },
  },
  {
    kind: "transform",
    label: "Transform",
    description: "Map payload fields",
    color: "#14b8a6",
    icon: "⇄",
    defaults: { script: "$.out = $.in * 2" },
  },
  {
    kind: "ai",
    label: "AI step",
    description: "Ask the agent",
    color: "#22c55e",
    icon: "✦",
    defaults: { task: "Summarize this release" },
  },
  {
    kind: "cli",
    label: "CLI step",
    description: "Run a local command",
    color: "#eab308",
    icon: "⌘",
    defaults: { command: "kubectl rollout status deploy/api" },
  },
  {
    kind: "notify",
    label: "Notify",
    description: "Send a message",
    color: "#ec4899",
    icon: "◴",
    defaults: { channel: "slack", to: "#ops" },
  },
  {
    kind: "group",
    label: "Group",
    description: "Collapsible sub-flow",
    color: "#8b5cf6",
    icon: "▤",
    defaults: {},
  },
];

export function catalogFor(kind: NodeKind) {
  return NODE_CATALOG.find((n) => n.kind === kind);
}

let counter = 1;
export function nextId(prefix: string) {
  return `${prefix}-${counter++}`;
}

export function makeNode(
  kind: NodeKind,
  position: { x: number; y: number },
  overrides: Partial<NodeData> = {},
): Node {
  const cat = catalogFor(kind)!;
  const id = (overrides.id as string | undefined) ?? nextId(kind.slice(0, 3));
  return {
    id,
    type: kind,
    position,
    data: {
      kind,
      label: cat.label,
      description: cat.description,
      params: { ...cat.defaults },
      collapsed: false,
      children: 0,
      ...overrides,
    } satisfies NodeData,
  };
}

export function makeEdge(source: string, target: string, label?: string): Edge {
  return {
    id: `${source}--${target}`,
    source,
    target,
    type: "smoothstep",
    label,
    animated: true,
  };
}

/** A realistic release pipeline used as the default template. */
export function defaultWorkflow(): { nodes: Node[]; edges: Edge[] } {
  const trigger = makeNode("trigger", { x: -560, y: 200 }, {
    id: "trigger",
    label: "Deploy webhook",
    params: { event: "webhook", source: "/deploy" },
  });
  const group = makeNode("group", { x: -240, y: 80 }, {
    id: "group-ci",
    label: "CI pipeline",
    children: 3,
    collapsed: true,
  });
  const build = makeNode("http", { x: 20, y: -10 }, {
    id: "build",
    label: "Build image",
    params: { method: "POST", url: "https://ci.internal/build" },
  });
  const push = makeNode("http", { x: 20, y: 120 }, {
    id: "push",
    label: "Push registry",
    params: { method: "POST", url: "https://registry.internal/push" },
  });
  const delay = makeNode("delay", { x: 20, y: 250 }, {
    id: "cooldown",
    label: "Cooldown",
    params: { duration: "30s" },
  });
  const condition = makeNode("condition", { x: 340, y: 140 }, {
    id: "condition",
    label: "Changelog present?",
    params: { field: "$.changelog", op: "exists", value: "true" },
  });
  const ai = makeNode("ai", { x: 620, y: 40 }, {
    id: "ai",
    label: "Draft release notes",
    params: { task: "Summarize this release" },
  });
  const cli = makeNode("cli", { x: 620, y: 200 }, {
    id: "cli",
    label: "Roll out",
    params: { command: "kubectl rollout status deploy/api" },
  });
  const notify = makeNode("notify", { x: 900, y: 120 }, {
    id: "notify",
    label: "Announce",
    params: { channel: "slack", to: "#ops" },
  });

  return {
    nodes: [trigger, group, build, push, delay, condition, ai, cli, notify],
    edges: [
      makeEdge("trigger", "group-ci"),
      makeEdge("group-ci", "build"),
      makeEdge("group-ci", "push"),
      makeEdge("group-ci", "cooldown"),
      makeEdge("build", "push"),
      makeEdge("push", "condition"),
      makeEdge("cooldown", "condition"),
      makeEdge("condition", "ai", "true"),
      makeEdge("condition", "cli", "false"),
      makeEdge("ai", "notify"),
      makeEdge("cli", "notify"),
    ],
  };
}

/** Topological order starting from trigger nodes. */
export function executionOrder(nodes: Node[], edges: Edge[]): Node[] {
  const ids = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  ids.forEach((id) => {
    adj.set(id, []);
    indeg.set(id, 0);
  });
  edges.forEach((e) => {
    if (!ids.has(e.source) || !ids.has(e.target)) return;
    adj.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  });

  const triggers = nodes.filter((n) => n.data.kind === "trigger");
  const queue = triggers.length ? triggers.map((n) => n.id) : [...ids];
  const order: Node[] = [];
  const visited = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodes.find((n) => n.id === id);
    if (node) order.push(node);
    adj.get(id)?.forEach((next) => {
      indeg.set(next, (indeg.get(next) ?? 0) - 1);
      if ((indeg.get(next) ?? 0) <= 0) queue.push(next);
    });
  }
  return order;
}
