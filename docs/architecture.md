# Racmond — Architecture

This document expands on the high-level architecture in the [README](../README.md)
with module-level detail. Every diagram is a mermaid diagram and is also rendered
live in the app at **`/architecture`**.

---

## 1. System context

```mermaid
flowchart LR
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

  browser <-->|"HTTP/SSE"| api
  api --> worker
  api --> pg
  worker -->|"spawn"| docker
  api -.->|"optional"| llm
  browser <-->|"tiles"| osm
```

---

## 2. Module decomposition

```mermaid
flowchart TB
  subgraph Shell["Shared shell"]
    Nav["PlatformNav"]
    Theme["ThemeProvider"]
    UI["ui.tsx design system"]
  end

  subgraph Fleet["DC Monitor — fleet"]
    Dashboard["Dashboard"]
    ServerMap["ServerMap (Leaflet)"]
    Topology["TopologyView (xyflow)"]
    ServerForm["ServerForm"]
    Admin["AdminPanel"]
  end

  subgraph Platform["Platform modules"]
    Overview["Console overview"]
    Docker["Docker Desktop"]
    Workflows["Workflow builder"]
    APM["APM service map"]
    CLI["Local CLI runner"]
    Agent["AI Agent"]
    Arch["Architecture view"]
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
  ServerMap --> Map
```

---

## 3. Why one graph engine everywhere

The fleet topology, the workflow builder and the APM service maps all render
through `@xyflow/react`. That gives us drag/zoom/pan, minimap, controls, edge
animation and node selection for free, and keeps the interaction model
consistent:

```mermaid
flowchart LR
  A["A node has a parent/child relationship"] --> B["Group nodes are collapsible"]
  B --> C["Collapse hides children and re-parents edges"]
  C --> D["Expand restores the sub-tree in place"]
  D --> E["Same behaviour in topology, workflows, APM"]
```

---

## 4. APM hierarchy

The APM service map is explicitly a set of `@xyflow/react` canvases. Each graph
is one *service domain / environment*. Within a graph, nodes form a strict
three-level parent/child hierarchy:

```mermaid
flowchart TB
  SVC["Service (parent)"]
  INST1["Instance 1 (child)"]
  INST2["Instance 2 (child)"]
  OP1["Operation / endpoint (grandchild)"]
  OP2["Operation / endpoint (grandchild)"]

  SVC -->|"expand"| INST1
  SVC -->|"expand"| INST2
  INST1 -->|"expand"| OP1
  INST2 -->|"expand"| OP2

  style SVC fill:#7c3aed,color:#fff
  style INST1 fill:#a855f7,color:#fff
  style INST2 fill:#a855f7,color:#fff
  style OP1 fill:#c4b5fd,color:#2e1065
  style OP2 fill:#c4b5fd,color:#2e1065
```

Edge labels carry **p99 latency**, **error rate** and **throughput** so the map
doubles as a health dashboard.

---

## 5. Workflow execution model

A workflow is a DAG of typed nodes. Groups are collapsible sub-graphs — the same
parent/child convention as APM. Running a workflow walks the DAG in topological
order:

```mermaid
sequenceDiagram
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
  X-->>T: status + latency per node
```

---

## 6. CLI execution flow

The CLI runner is the only module that executes host code. It is deliberately
narrow: a whitelist, a timeout, and a streaming stdout/stderr channel.

```mermaid
sequenceDiagram
  autonumber
  participant U as Browser
  participant R as /api/cli/run
  participant W as Validator
  participant S as spawn()
  participant C as CLI binary

  U->>R: { app, args }
  R->>W: app ∈ CLI_ALLOWLIST?
  alt not allowed
    W-->>U: 403 + reason
  else allowed
    W->>S: spawn(app, args, timeout)
    S->>C: start process
    C-->>U: NDJSON stream (stdout/stderr)
    C-->>U: exit code + duration
  end
```

---

## 7. AI Agent loop

The agent is an *observe → reason → act* loop. Tool calls are sandboxed through
the same CLI runner, so the agent can only do what the operator has whitelisted.

```mermaid
flowchart TD
  Observe["Observe: fleet health, incidents, logs"] --> Reason["Reason: LLM or heuristic engine"]
  Reason -->|"plan"| Plan["Plan remediation steps"]
  Plan --> Decide{Action safe?}
  Decide -->|"yes"| Act["Act via CLI runner / workflow"]
  Decide -->|"no"| Explain["Explain + request approval"]
  Act --> Verify["Verify outcome"]
  Verify --> Observe
  Explain --> Observe
```

---

## 8. Deployment & data

```mermaid
flowchart LR
  subgraph Edge["Edge"]
    TLS["TLS / reverse proxy"]
  end
  subgraph App["App runtime"]
    Next["Next.js server"]
    Pool["CLI process pool"]
  end
  subgraph Data["Data"]
    PG[("PostgreSQL")]
    Bucket["Optional: object storage (logs/traces)"]
  end
  subgraph Host["Host tools"]
    Tools["docker · git · kubectl · npm · …"]
  end

  U["Operator"] --> TLS --> Next
  Next <--> PG
  Next <--> Bucket
  Next --> Pool --> Tools
```
