"use client";

import Link from "next/link";
import { useState } from "react";
import { ModuleHeader } from "@/components/platform/PlatformShell";
import { MermaidDiagram } from "@/components/platform/MermaidDiagram";

const DIAGRAMS: { id: string; title: string; chart: string }[] = [
  {
    id: "system",
    title: "System context",
    chart: `flowchart LR
  subgraph Operator["Operators"]
    browser["Browser (React 19 SPA)"]
  end
  subgraph App["Racmond (Next.js 16)"]
    api["Route handlers /api/*"]
    worker["CLI process executor"]
  end
  subgraph Stores["State"]
    pg[("PostgreSQL")]
  end
  subgraph External["External"]
    docker["Docker Engine / CLI"]
    llm["LLM provider"]
    osm["OpenStreetMap"]
  end
  browser <-->|"HTTP / SSE"| api
  api --> worker
  api --> pg
  worker -->|"spawn"| docker
  api -.->|"optional"| llm
  browser <-->|"tiles"| osm`,
  },
  {
    id: "modules",
    title: "Module decomposition",
    chart: `flowchart TB
  subgraph Shell["Shared shell"]
    Nav["PlatformNav"]
    Theme["ThemeProvider"]
    UI["ui.tsx design system"]
  end
  subgraph Fleet["DC Monitor — fleet"]
    Dashboard["Dashboard"]
    ServerMap["ServerMap (Leaflet)"]
    Topology["TopologyView (xyflow)"]
  end
  subgraph Platform["Platform modules"]
    Overview["Console overview"]
    Docker["Docker Desktop"]
    Workflows["Workflow builder"]
    APM["APM service map"]
    CLI["Local CLI runner"]
    Agent["AI Agent"]
  end
  subgraph Engine["Rendering engines"]
    Flow["@xyflow/react canvas"]
    Map["react-leaflet"]
  end
  Nav --- Shell
  Fleet --- Platform
  Topology --> Flow
  Workflows --> Flow
  APM --> Flow
  ServerMap --> Map`,
  },
  {
    id: "apm",
    title: "APM parent/child hierarchy",
    chart: `flowchart TB
  SVC["Service (parent)"]
  INST1["Instance 1 (child)"]
  INST2["Instance 2 (child)"]
  OP1["Operation (grandchild)"]
  OP2["Operation (grandchild)"]
  SVC -->|"expand / collapse"| INST1
  SVC -->|"expand / collapse"| INST2
  INST1 --> OP1
  INST2 --> OP2
  style SVC fill:#7c3aed,color:#fff
  style INST1 fill:#a855f7,color:#fff
  style INST2 fill:#a855f7,color:#fff
  style OP1 fill:#c4b5fd,color:#2e1065
  style OP2 fill:#c4b5fd,color:#2e1065`,
  },
  {
    id: "workflow",
    title: "Workflow execution model",
    chart: `sequenceDiagram
  autonumber
  participant T as Trigger
  participant C as Condition
  participant A as Action
  participant G as Group (sub-flow)
  participant X as Executor
  T->>X: node ready
  X->>C: evaluate branch
  alt true
    C->>A: execute action
    A-->>X: payload
    X->>G: enter group
    G->>G: run sub-nodes
    G-->>X: result
  else false
    C-->>X: skip downstream
  end
  X-->>T: status + latency per node`,
  },
  {
    id: "cli",
    title: "CLI execution flow",
    chart: `sequenceDiagram
  autonumber
  participant U as Browser
  participant R as /api/cli/run
  participant W as Validator
  participant S as spawn()
  participant C as CLI binary
  U->>R: { app, args }
  R->>W: app in CLI_ALLOWLIST?
  alt not allowed
    W-->>U: 403 + reason
  else allowed
    W->>S: spawn(app, args, timeout)
    S->>C: start process
    C-->>U: NDJSON stream
    C-->>U: exit code + duration
  end`,
  },
  {
    id: "agent",
    title: "AI Agent loop",
    chart: `flowchart TD
  Observe["Observe: fleet health, incidents"] --> Reason["Reason: LLM or heuristic engine"]
  Reason --> Plan["Plan remediation steps"]
  Plan --> Decide{Action safe?}
  Decide -->|"yes"| Act["Act via CLI runner / workflow"]
  Decide -->|"no"| Explain["Explain + request approval"]
  Act --> Verify["Verify outcome"]
  Verify --> Observe
  Explain --> Observe`,
  },
  {
    id: "deploy",
    title: "Deployment & data",
    chart: `flowchart LR
  subgraph Edge["Edge"]
    TLS["TLS / reverse proxy"]
  end
  subgraph App["App runtime"]
    Next["Next.js server"]
    Pool["CLI process pool"]
  end
  subgraph Data["Data"]
    PG[("PostgreSQL")]
  end
  subgraph Host["Host tools"]
    Tools["docker · git · kubectl · npm · …"]
  end
  U["Operator"] --> TLS --> Next
  Next <--> PG
  Next --> Pool --> Tools`,
  },
];

const MODULE_LINKS = [
  { href: "/console", name: "Console overview" },
  { href: "/", name: "DC Monitor fleet" },
  { href: "/docker", name: "Docker Desktop" },
  { href: "/workflows", name: "Workflow builder" },
  { href: "/apm", name: "APM service map" },
  { href: "/cli", name: "Local CLI runner" },
  { href: "/agent", name: "AI Agent" },
];

export default function ArchitectureView() {
  const [active, setActive] = useState(DIAGRAMS[0]!.id);
  const current = DIAGRAMS.find((d) => d.id === active) ?? DIAGRAMS[0]!;

  return (
    <div className="fade-in space-y-5">
      <ModuleHeader
        eyebrow="Documentation · Architecture"
        title="System architecture"
        description="Live mermaid diagrams describing the platform, its modules and the execution flows. The same diagrams live in docs/architecture.md and the README."
      />

      <div className="glass-card overflow-hidden rounded-2xl">
        <div className="flex flex-wrap gap-1 border-b border-[var(--glass-divider)] p-2">
          {DIAGRAMS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setActive(d.id)}
              className={`rounded-xl px-3 py-1.5 text-[12.5px] font-medium transition ${
                active === d.id
                  ? "bg-gradient-to-r from-violet-600/25 to-fuchsia-600/18 text-[var(--text-primary)] border border-purple-500/35"
                  : "text-[var(--text-muted)] hover:bg-[var(--glass-card-hover)] border border-transparent"
              }`}
            >
              {d.title}
            </button>
          ))}
        </div>
        <div className="bg-[#0a0517] p-4">
          <MermaidDiagram key={current.id} id={current.id} chart={current.chart} />
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Platform modules
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {MODULE_LINKS.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="glass-card-interactive rounded-xl px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)]"
            >
              {m.name}
            </Link>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] text-[var(--text-muted)]">
          Every graph in the product — fleet topology, workflows and the APM
          service maps — renders through the same <code className="font-mono text-sky-300">@xyflow/react</code> engine.
        </p>
      </div>
    </div>
  );
}
