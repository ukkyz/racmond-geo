# 🛰️ Racmond — Data Center Operations Platform

<p align="center">
  <strong>Racmond</strong> is an operations platform for data-center estates.
  It starts life as <em>DC Monitor</em> — a map-first inventory of every physical
  and virtual machine your organization owns or rents — and grows into a control
  surface for the day-to-day work of running infrastructure: container estates,
  automation, distributed-system tracing, ad-hoc CLI access and an AI agent that
  helps you find and fix problems.
</p>

<p align="center">
  <img alt="Racmond platform" src="docs/assets/platform-banner.svg" width="100%">
</p>

---

## Table of contents

- [What is Racmond?](#what-is-racmond)
- [Feature tour](#feature-tour)
- [High-level architecture](#high-level-architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [HTTP API](#http-api)
- [Scripts](#scripts)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## 🧭 What is Racmond?

Most asset inventories answer *"what do I have?"*. Racmond tries to answer the
next question too: *"what is happening to it, and what should I do about it?"*.

The platform is organised as a set of modules that all share one shell, one
design system and one source of truth for the estate:

| Module | Route | What it does |
| --- | --- | --- |
| **DC Monitor (Fleet)** | `/` | Geo-located inventory of physical & virtual servers on an OpenStreetMap canvas, with ownership, sites, projects, tags and filters. |
| **Overview** | `/console` | A capability hub that links every module and summarises fleet health. |
| **Docker Desktop** | `/docker` | A Docker Desktop-style estate view: containers, images, volumes, networks and Compose projects with live stats and lifecycle actions. |
| **Workflow Builder** | `/workflows` | A no-code automation builder. Compose triggers, conditions, actions and AI steps on a drag-and-drop canvas and simulate a run. |
| **APM Service Map** | `/apm` | A Pinpoint / Jaeger-style call graph. Each graph is its own `@xyflow/react` canvas and nodes form a parent/child hierarchy that expands and collapses. |
| **Local CLI Runner** | `/cli` | Drive any locally installed CLI (`git`, `docker`, `kubectl`, `npm`, …) from the browser. Output streams back live. |
| **AI Agent** | `/agent` | A built-in agent that diagnoses fleet problems, proposes remediation and can run safe actions — with or without an external LLM. |
| **Security & Posture** | `/security` | L6 DevSecOps: vulnerability management with reachability, SBOM browser, compliance state and runtime security events. |
| **Architecture** | `/architecture` | The system architecture rendered as live mermaid diagrams. |

> **Design principle:** every *graph* in the product is a real `@xyflow/react`
> canvas — the fleet topology, the workflow builder and the APM service maps all
> share the same rendering engine, so a mental model learned in one place
> transfers to the others.

---

## ✨ Feature tour

### DC Monitor (the original app)

- 🌍 **Global fleet map** — every server is a pin on OpenStreetMap, clustered for
  readability, with status-coded colors and a fly-to animation when you pick one.
- 🗂️ **Asset topology** — organization → site → server rendered as a layered
  graph you can pan and zoom.
- 🔍 **Faceted filtering** — filter by organization, site, project, tag, asset
  type and status; combined with a free-text search over host, org, IP and more.
- 🧾 **Full CRUD** — create, edit and delete assets through a form that embeds a
  mini-map for picking coordinates.
- 🏛️ **Admin panel** — manage the reference data (organizations, sites, projects,
  tags) that powers ownership and geo-filtering.
- 🌗 **Dark / light glass** — a glassmorphism theme toggle with localStorage
  persistence.

### Docker Desktop module

A familiar container-ops surface: an engine header with live CPU/memory/IO,
tabbed sections for **Containers / Images / Volumes / Networks / Compose**,
start–stop–restart lifecycle actions, per-container stats and a Compose
project list. Everything is backed by a deterministic simulation so the module
is always demoable, with a real `docker` integration seam.

### Workflow automation builder

- A palette of nodes: **Trigger**, **Condition**, **HTTP request**, **Delay**,
  **Transform**, **AI step**, **CLI step**, **Notify**.
- Nodes connect to form a DAG; a properties panel edits each node.
- **Group nodes** collapse a sub-flow into a single expandable parent — the same
  parent/child hierarchy convention used by the APM maps.
- **Simulate** animates execution node-by-node, showing status, latency and the
  payload that flows along each edge.
- Workflows persist to `localStorage` and ship with templates.

### APM service map

- **Pinpoint/Jaeger-style call graphs**: services depend on services, and the
  graph shows latency (p50/p95/p99), error rate and throughput on every edge.
- **Hierarchical nodes**: a *service* expands to show its *instances*; an
  *instance* expands to show its *operations/endpoints*. Collapse a node and
  its children fold away, re-parenting the edges so the map stays readable.
- **Multiple graphs**: switch between environments / service domains — each is
  a separate `@xyflow/react` canvas.
- **Trace explorer**: pick a span to see a Jaeger-style waterfall with per-span
  durations and tags.

### Local CLI runner

Point the runner at anything installed on the host. The server detects
available CLIs, whitelists the ones it is willing to execute and streams
stdout/stderr back to the browser in real time. History, exit codes and a
per-command timeout are included. Configure `CLI_ALLOWLIST` in the environment
to control which binaries are permitted.

### AI Agent

An assistant that lives inside the platform. Give it context (fleet health, an
incident, a workflow) and it can:

- run **diagnostics** against the estate,
- propose **remediation** steps,
- run **safe actions** through the CLI runner (with your approval),
- explain *why* it chose an action.

It works with a configured LLM (OpenAI-compatible `/chat/completions`) and
falls back to a built-in **heuristic reasoning engine** that still produces
useful, evidence-backed diagnosis — so the module is never a dead end.

### Security & posture (L6)

A DevSecOps surface that closes the loop between development, security and
operations:

- **Vulnerability management** with **reachability** ("reachable", "present",
  "unknown") and public-exploit flags, not just CVSS.
- An **AI-triage** mode that ranks findings by business risk.
- A **SBOM browser** per image/service with licenses and linked CVEs.
- **Compliance state** for SOC 2, ISO 27001, HIPAA and PCI-DSS with control
  evidence.
- **Runtime security** events (eBPF-style) for process, network, file, auth and
  config drift.
- One-click **remediate / investigate / accept risk** workflow, with a posture
  score that recomputes as findings are resolved.

Every finding links back to the **service (L3)** and **asset (L1)** that own it,
so security is never detached from the estate.

---

## 🏗️ High-level architecture

Racmond is a **Next.js 16 App Router** single application. The browser hosts the
React SPA shell; the same process runs the API route handlers and the sandboxed
process executor used by the CLI module. State lives in PostgreSQL via Drizzle.

```mermaid
flowchart TB
  subgraph Client["Browser — React 19 SPA shell"]
    direction TB
    Shell["Racmond shell<br/>(nav · theme · routing)"]
    Shell --> Fleet["DC Monitor fleet"]
    Shell --> Docker["Docker Desktop"]
    Shell --> Workflows["Workflow builder"]
    Shell --> APM["APM service map"]
    Shell --> CLI["Local CLI runner"]
    Shell --> Agent["AI Agent console"]
    Engine["@xyflow/react canvas engine<br/>shared by topology / workflows / APM"]
    Fleet -.-> Engine
    Workflows -.-> Engine
    APM -.-> Engine
  end

  subgraph Server["Next.js 16 process"]
    direction TB
    Router["App Router<br/>Server Components + Route Handlers"]
    API["JSON + SSE route handlers<br/>/api/*"]
    ProcessPool["Sandboxed CLI process executor"]
    Drizzle["Drizzle ORM"]
    Router --> API
    API --> ProcessPool
    API --> Drizzle
  end

  subgraph External["Data & external services"]
    direction TB
    PG[("PostgreSQL")]
    DockerEngine["Docker Engine / CLI"]
    LLM["AI provider (OpenAI-compatible)"]
    OSM["OpenStreetMap tile server"]
  end

  Client <-->|"HTTP / fetch / SSE"| Server
  Drizzle <--> PG
  ProcessPool <-->|"child_process"| DockerEngine
  API -->|"optional"| LLM
  Client <-->|"tiles + markers"| OSM
```

### Front-end platform map

```mermaid
flowchart LR
  subgraph Shell["Shared shell"]
    Nav["PlatformNav"]
    Theme["ThemeProvider / glass design system"]
    UI["ui.tsx primitives<br/>Card · Field · Button · Badge"]
  end

  subgraph Modules["Feature modules (client components)"]
    Fleet["Dashboard + ServerMap + TopologyView + ServerForm + AdminPanel"]
    Docker["DockerDesktop"]
    WF["WorkflowBuilder"]
    APM["ApmServiceMap"]
    CLI["CliRunner"]
    Agent["AgentConsole"]
  end

  Nav --- Modules
  Theme --- Modules
  UI --- Modules

  Fleet -->|"leaflet + react-leaflet"| Map["OpenStreetMap"]
  Docker --> Flow
  WF --> Flow
  APM --> Flow
  Flow["@xyflow/react canvas"]
  CLI -->|"SSE"| Routes["Route handlers"]
  Agent --> Routes
```

### The data model

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ SERVERS : owns
  LOCATIONS    ||--o{ SERVERS : hosts
  PROJECTS     ||--o{ SERVERS : groups
  TAGS         ||--o{ SERVERS : labels

  ORGANIZATIONS {
    int id PK
    text name
    text code
  }
  LOCATIONS {
    int id PK
    text name
    text city
    text country
    double latitude
    double longitude
  }
  PROJECTS {
    int id PK
    text name
    text description
  }
  TAGS {
    int id PK
    text name
    text color
  }
  SERVERS {
    int id PK
    text hostname
    int organization_id FK
    double latitude
    double longitude
    asset_type asset_type
    int location_id FK
    int project_id FK
    int tag_id FK
    text ip_address
    text provider
    int cpu_cores
    int memory_gb
    text status
    bool online
    timestamp last_seen_at
    timestamp created_at
    timestamp updated_at
  }
```

### Request lifecycle (fleet map load)

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant C as React shell
  participant R as Route handler
  participant D as Drizzle ORM
  participant P as PostgreSQL

  U->>C: Open / (Global Map)
  C->>C: InventoryProvider mounts
  C->>R: GET /api/servers
  R->>R: seedIfEmpty() (idempotent)
  R->>D: listServers() + getReferenceData() + getStats()
  D->>P: SELECT … LEFT JOIN …
  P-->>D: rows
  D-->>R: ServerDTO[] + reference + stats
  R-->>C: 200 JSON
  C->>C: Filter → render ServerMap (Leaflet)
  C-->>U: Interactive fleet map
```

### Deployment view

```mermaid
flowchart LR
  subgraph Runtime["Single Node runtime"]
    Next["Next.js server<br/>(App Router)"]
    PG[("PostgreSQL")]
    Pool["CLI process pool"]
    Next --- PG
    Next --- Pool
  end
  U["Operator browser"] -->|"443"| Reverse["Reverse proxy / TLS"]
  Reverse --> Next
  PG -.->|"pg_dump · pgbouncer"| Ops["Backups / pooling"]
  Pool -.->|"spawns"| Tools["docker · git · kubectl · npm · …"]
```

---

## 📁 Project structure

```
src/
├── app/                     # Next.js App Router
│   ├── layout.tsx           # Root layout: metadata, theme init, providers
│   ├── page.tsx             # /  → DC Monitor dashboard
│   ├── (platform)/         # Platform module shell + pages
│   │   ├── layout.tsx       # PlatformShell (nav + content)
│   │   ├── console/page.tsx      # /console   capability overview
│   │   ├── docker/page.tsx       # /docker    Docker Desktop
│   │   ├── workflows/page.tsx    # /workflows automation builder
│   │   ├── apm/page.tsx          # /apm       service map
│   │   ├── cli/page.tsx          # /cli       local CLI runner
│   │   ├── agent/page.tsx        # /agent     AI agent console
│   │   ├── security/page.tsx     # /security  L6 security & posture
│   │   └── architecture/page.tsx # /architecture mermaid diagrams
│   └── api/                 # Route handlers
│       ├── servers/…        # CRUD for fleet assets
│       ├── admin/bootstrap  # reference-data creation
│       ├── cli/…            # CLI detection + streaming execution
│       └── health
├── components/             # Shared UI + feature components
│   ├── ui.tsx               # glass design-system primitives
│   ├── ThemeProvider.tsx    # dark/light theme
│   ├── InventoryProvider.tsx# inventory data context
│   ├── Dashboard.tsx        # fleet shell
│   ├── ServerMap.tsx        # Leaflet map
│   ├── TopologyView.tsx     # xyflow fleet graph
│   ├── ServerForm.tsx       # asset form + mini map
│   ├── AdminPanel.tsx       # reference data CRUD
│   └── platform/            # new platform modules
├── db/                     # Drizzle schema + client
├── lib/                    # domain types + data access
└── types/                  # third-party ambient types
docs/                       # architecture docs + assets
drizzle/                    # generated SQL migrations (when run)
```

---

## 🚀 Getting started

### Prerequisites

- **Node.js 20+** (developed on Node 22) and npm
- A **PostgreSQL 15+** instance (local or container)

### 1. Install

```bash
npm ci --legacy-peer-deps
```

> The lockfile pins an older `eslint-config-next` whose peer range conflicts with
> `eslint@9`, so install with `--legacy-peer-deps`.

### 2. Configure the database

Create a database and user, then point the app at it. The default connection
string lives in two places and can be overridden with env vars:

```bash
createdb racmond
psql -d racmond -c "CREATE USER ap_admin WITH PASSWORD 'ap_secret';"
psql -d racmond -c "GRANT ALL PRIVILEGES ON DATABASE racmond TO ap_admin;"
```

### 3. Run migrations (optional)

```bash
npm run db:push
```

If you skip this, the app auto-seeds on first use via `seedIfEmpty()` and will
fail with a clear error if the tables do not exist.

### 4. Start the dev server

```bash
npm run dev
```

Open <http://localhost:3000>. The app seeds 4 organizations, 9 data-center
sites, 3 projects, 5 tags and 48 demo servers on first load.

### 5. (Optional) run the platform modules

Each platform module is self-contained and demoable without extra setup:

- **CLI runner** — works immediately against any binaries already installed on
  the host; set `CLI_ALLOWLIST` to restrict them.
- **AI Agent** — works out of the box with the built-in reasoning engine. To
  use a real LLM, set `AI_API_BASE`, `AI_API_KEY` and `AI_MODEL`.

---

## ⚙️ Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://ap_admin:ap_secret@localhost:5432/racmond` | PostgreSQL connection used by Drizzle. |
| `CLI_ALLOWLIST` | common dev tools | Comma-separated whitelist of binaries the CLI runner may execute. |
| `CLI_TIMEOUT_MS` | `15000` | Per-command wall-clock timeout. |
| `AI_API_BASE` | – | OpenAI-compatible `/chat/completions` base URL. |
| `AI_API_KEY` | – | API key for the AI provider. |
| `AI_MODEL` | – | Model name passed to the provider. |

---

## 🔌 HTTP API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness probe that pings the database. |
| `GET` | `/api/servers` | List all assets + reference data + dashboard stats. |
| `POST` | `/api/servers` | Create an asset (validated server-side). |
| `GET` | `/api/servers/:id` | Fetch one asset. |
| `PATCH` | `/api/servers/:id` | Update an asset. |
| `DELETE` | `/api/servers/:id` | Delete an asset. |
| `POST` | `/api/admin/bootstrap` | Create a reference-data entry (org / site / project / tag). |
| `GET` | `/api/cli/apps` | List CLI binaries detected on the host. |
| `POST` | `/api/cli/run` | Execute a whitelisted CLI command (streamed). |

Validation is centralised in `src/lib/types.ts` (`validateServerInput`) and
enforced on every write path.

---

## 📜 Scripts

| Script | Command | Description |
| --- | --- | --- |
| `dev` | `next dev` | Start the dev server. |
| `build` | `next build` | Production build. |
| `start` | `next start` | Serve a production build. |
| `lint` | `eslint .` | Lint the project. |
| `typecheck` | `tsc --noEmit` | Type-check without emitting. |
| `db:push` | `drizzle-kit push` | Push the schema to the database. |

---

## 🧭 Roadmap

- **Seven-layer observability** — evolve the platform into a full mission-control
  plane (asset → runtime → application → code → data → security → business) with
  a cross-layer AI. See
  [`docs/roadmap-seven-layer-observability.md`](docs/roadmap-seven-layer-observability.md).
- Real Docker Engine integration behind the Docker Desktop module.
- Persistent workflow definitions and a cron/event-driven runner.
- Distributed tracing ingestion (OTLP) feeding the APM service map.
- Vulnerability scanning feeds + policy-as-code (OPA/Rego) behind the Security module.
- Multi-user auth and audit logs for CLI/agent actions.
- Mobile-responsive fleet map with offline asset capture.

---

## 🤝 Contributing

1. Fork and create a feature branch.
2. `npm ci --legacy-peer-deps` then `npm run typecheck` before pushing.
3. Keep the glassmorphism design system (`src/components/ui.tsx`,
   `src/app/globals.css`) as the source of shared styling.
4. Every graph in the product should reuse `@xyflow/react`.
5. Open a pull request from your branch.

---

## 📄 License

MIT — see [LICENSE](LICENSE).
