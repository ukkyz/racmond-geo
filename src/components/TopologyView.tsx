"use client";

import { useEffect, useMemo } from "react";
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
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useTheme } from "@/components/ThemeProvider";
import { ASSET_TYPE_LABEL } from "@/lib/types";
import type { ServerDTO } from "@/lib/types";

type OrgNodeData = {
  label: string;
  sublabel: string;
  kind: "org";
  tone: string;
  [key: string]: unknown;
};
type SiteNodeData = {
  label: string;
  sublabel: string;
  kind: "site";
  tone: string;
  [key: string]: unknown;
};
type ServerNodeData = {
  label: string;
  sublabel: string;
  kind: "server";
  tone: string;
  status: string;
  assetType: string;
  selected: boolean;
  onOpen: () => void;
  [key: string]: unknown;
};

const TONES = {
  org: "#a855f7",
  site: "#c084fc",
  serverPhysical: "#8b5cf6",
  serverVirtual: "#d946ef",
  serverAlert: "#ef4444",
};

function ShellNode({ data }: NodeProps) {
  const d = data as OrgNodeData;
  return (
    <div className="flow-org-node">
      <Handle type="source" position={Position.Right} />
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full shadow-sm"
          style={{ background: d.tone, boxShadow: `0 0 10px ${d.tone}` }}
        />
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          {d.label}
        </span>
      </div>
      <p className="mt-0.5 pl-4 text-[11px] text-[var(--text-muted)]">
        {d.sublabel}
      </p>
    </div>
  );
}

function SiteNode({ data }: NodeProps) {
  const d = data as SiteNodeData;
  return (
    <div className="flow-site-node">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-purple-700 dark:text-purple-200">
          {d.label}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
        {d.sublabel}
      </p>
    </div>
  );
}

function ServerNode({ data, selected }: NodeProps) {
  const d = data as ServerNodeData;
  return (
    <div
      className={`asset-node${selected || d.selected ? " asset-node-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="asset-node-header">
        <span className="truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
          {d.label}
        </span>
        <span
          className="h-2 w-2 flex-none rounded-full"
          style={{ background: d.tone }}
        />
      </div>
      <div className="asset-node-body">
        <p className="truncate text-[11px] text-[var(--text-muted)]">
          {d.sublabel}
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase ${
              d.assetType === "physical"
                ? "border-violet-500/30 bg-violet-500/18 text-violet-700 dark:text-violet-200"
                : "border-fuchsia-500/30 bg-fuchsia-500/18 text-fuchsia-700 dark:text-fuchsia-200"
            }`}
          >
            {d.assetType === "physical" ? "PHY" : "VIRT"}
          </span>
          <span className="truncate text-[10px] text-[var(--text-subtle)]">
            {d.status}
          </span>
        </div>
        <button
          type="button"
          onClick={d.onOpen}
          className="glass-card-interactive mt-2 w-full rounded-lg py-1 text-[10.5px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent-text)]"
        >
          Details
        </button>
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  org: ShellNode,
  site: SiteNode,
  server: ServerNode,
};

function buildGraph(
  servers: ServerDTO[],
  onOpen: (id: number) => void,
  selectedId: number | null,
  isDark: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const byOrg = new Map<string, ServerDTO[]>();
  servers.forEach((s) => {
    const arr = byOrg.get(s.organizationName) ?? [];
    arr.push(s);
    byOrg.set(s.organizationName, arr);
  });

  const orgs = [...byOrg.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  orgs.forEach(([orgName, orgServers], oi) => {
    const orgId = `org-${oi}`;
    const physical = orgServers.filter(
      (s) => s.assetType === "physical",
    ).length;
    nodes.push({
      id: orgId,
      type: "org",
      position: { x: 0, y: oi * 260 },
      data: {
        label: orgName,
        sublabel: `${orgServers.length} assets · ${physical} owned / ${orgServers.length - physical} rented`,
        kind: "org",
        tone: TONES.org,
      } satisfies OrgNodeData,
    } satisfies Node);

    const bySite = new Map<string, ServerDTO[]>();
    orgServers.forEach((s) => {
      const key = s.locationName ?? s.locationLabel ?? "Unassigned site";
      const arr = bySite.get(key) ?? [];
      arr.push(s);
      bySite.set(key, arr);
    });

    const sites = [...bySite.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    );
    sites.forEach(([siteName, siteServers], si) => {
      const siteId = `site-${oi}-${si}`;
      nodes.push({
        id: siteId,
        type: "site",
        position: { x: 280, y: oi * 260 + si * 96 },
        data: {
          label: siteName,
          sublabel: `${siteServers.length} server${siteServers.length > 1 ? "s" : ""}`,
          kind: "site",
          tone: TONES.site,
        } satisfies SiteNodeData,
      } satisfies Node);

      edges.push({
        id: `${orgId}--${siteId}`,
        source: orgId,
        target: siteId,
        type: "smoothstep",
        animated: false,
        style: {
          stroke: isDark ? "rgba(168, 85, 247, 0.52)" : "rgba(124, 58, 237, 0.48)",
          strokeWidth: 1.4,
        },
      });

      siteServers.forEach((s, ki) => {
        const nodeId = `srv-${s.id}`;
        nodes.push({
          id: nodeId,
          type: "server",
          position: {
            x: 560 + (ki % 2) * 240,
            y: oi * 260 + si * 96 + Math.floor(ki / 2) * 96,
          },
          data: {
            label: s.hostname,
            sublabel:
              [s.project, s.tag].filter(Boolean).join(" · ") ||
              s.ipAddress ||
              "—",
            kind: "server",
            tone:
              s.status === "offline"
                ? TONES.serverAlert
                : s.assetType === "physical"
                  ? TONES.serverPhysical
                  : TONES.serverVirtual,
            status: s.status,
            assetType: s.assetType,
            selected: s.id === selectedId,
            onOpen: () => onOpen(s.id),
          } satisfies ServerNodeData,
        } satisfies Node);

        edges.push({
          id: `${siteId}--${nodeId}`,
          source: siteId,
          target: nodeId,
          type: "smoothstep",
          style: {
            stroke:
              s.assetType === "physical"
                ? isDark
                  ? "#8b5cf6"
                  : "#7c3aed"
                : isDark
                  ? "#d946ef"
                  : "#c026d3",
            strokeWidth: 1.2,
            opacity: 0.78,
          },
        });
      });
    });
  });

  return { nodes, edges };
}

function Inner({
  servers,
  selectedId,
  onOpen,
}: {
  servers: ServerDTO[];
  selectedId: number | null;
  onOpen: (id: number) => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const { nodes, edges } = useMemo(
    () => buildGraph(servers, onOpen, selectedId, isDark),
    [servers, onOpen, selectedId, isDark],
  );
  const { fitView } = useReactFlow();

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 60);
    return () => clearTimeout(t);
  }, [fitView, servers]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.15}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      nodesDraggable
      nodesConnectable={false}
      defaultEdgeOptions={{ type: "smoothstep" }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1.2}
        color={isDark ? "rgba(196, 181, 253, 0.22)" : "rgba(124, 58, 237, 0.24)"}
      />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeStrokeWidth={3}
        nodeColor={(n) => {
          if (n.type === "org") return "#a855f7";
          if (n.type === "site") return "#c084fc";
          const d = n.data as ServerNodeData;
          return d.tone;
        }}
        maskColor={
          isDark ? "rgba(12, 5, 28, 0.72)" : "rgba(237, 231, 254, 0.68)"
        }
      />
    </ReactFlow>
  );
}

export default function TopologyView(props: {
  servers: ServerDTO[];
  selectedId: number | null;
  onOpen: (id: number) => void;
}) {
  return (
    <ReactFlowProvider>
      <Inner
        servers={props.servers}
        selectedId={props.selectedId}
        onOpen={props.onOpen}
      />
    </ReactFlowProvider>
  );
}

export { ASSET_TYPE_LABEL };
