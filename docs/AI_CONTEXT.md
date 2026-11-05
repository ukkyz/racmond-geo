# Racmond — AI context brief

**Read this first. Last reviewed: 2026-11-04.** This is a ~1,500-word orientation, not generated API documentation. It explains intent and boundaries so an agent can inspect a small, relevant code surface instead of the entire repository. The companion working skill is `.agents/skills/racmond-geo/SKILL.md`.

## 1. The product in plain English

Racmond helps an enterprise understand and operate its data-center estate. Its first identity is **DC Monitor**: every owned or rented physical and virtual machine, placed on a map and connected to an organization, site, project and owner. Its larger identity is an operations control surface: what is running, what is failing, what does it cost, and what can safely be done next?

The distinguishing idea is a continuous chain of context:

**facility → asset → workload → service → request → data → customer / financial outcome.**

An operator should not need five unrelated tools to discover that a slow customer order comes from a database on an overloaded host in a particular facility. Racmond should make that path navigable, with evidence at every hop. OpenTelemetry is the interoperability contract; Grafana is a complementary backend, not a dependency that the whole product must replace.

The first users are infrastructure operators, DevOps/SRE teams and asset owners. CTOs need architectural and security evidence; CFOs need ownership and cost attribution; executives need business impact rather than raw metric volume.

## 2. What exists, and what is only a demonstration

Honesty about data provenance is part of the product.

| Capability | Route | Actual state |
| --- | --- | --- |
| Fleet inventory | `/` | Real CRUD and reference data through Next.js route handlers, Drizzle and PostgreSQL. The browser map uses Leaflet/OpenStreetMap. Without a database the fleet API reports an error rather than pretending to be live. |
| Asset topology | `/` | React Flow organization/site/asset graph derived from inventory. |
| Overview | `/console` | Module launcher; fleet totals come from the inventory API, with an explicitly shown demo fallback. |
| Docker estate | `/docker` | Deterministic simulation with lifecycle interactions; **not a Docker Engine connection**. |
| Workflow builder | `/workflows` | React Flow DAG editor and animated simulation; browser-local persistence, **not a server-side execution engine**. |
| Original APM | `/apm` | Deterministic service/instance/operation graphs and sample waterfalls; **not live OTLP ingestion**. Keep it as a design/reference demo. |
| Trace lab | `/trace-lab` | Explicit synthetic mode works without infrastructure. Optional live mode orchestrates the polyglot stack and reads actual spans from Tempo. Never silently substitutes demo data for a live failure. |
| JVM / Go workbench | `/runtime` | Synthetic runtime history by default; live mode polls measured Java/Go endpoints. Heap/pool charts, GC notifications, counters, filtering by process, pause/resume and export. |
| CLI runner | `/cli` | Real host process execution behind an allowlist. **Not a security sandbox.** The host and environment are exposed to permitted binaries. |
| AI agent | `/agent` | Fleet diagnosis and chat, optional OpenAI-compatible provider, heuristic fallback. Evidence and action approval need further production hardening. |
| Security | `/security` | Seeded vulnerability/SBOM/compliance demonstration, **not a live scanner or compliance certification**. |
| Architecture | `/architecture` | Mermaid design views. Diagrams describe intent as well as implementation; use this brief for the truth matrix. |
| Leadership board | `/strategy` | Synthesized CEO/CTO/CFO/DevOps workshop, RICE-assisted priorities and 90-day sequence. **Not recorded stakeholder approval.** |

## 3. The executable rack-to-revenue lab

`lab/` is a separate local Compose environment. It is a proof of cross-language trace continuity, not a production ERP or accounting product. All customers, prices and notifications are synthetic.

1. **Commerce — Next.js / TypeScript:** Racmond itself is the gateway. It creates a root request span, validates the scenario and orchestrates the order using same-origin browser APIs.
2. **CRM — PHP Laravel:** checks a synthetic customer's credit limit and writes the order to **MongoDB**. A separate worker consumes invoice events and records a synthetic notification.
3. **ERP — Rust / Axum:** reserves stock in **PostgreSQL**. A unique order ID and a transaction prevent duplicate reservation or stock deduction.
4. **Assets — Go:** atomically assigns an asset and publishes `orders.accepted` to **Redis Streams** using a Lua transaction. It exposes measured heap and GC pause information.
5. **Accounting — Java / Spring Boot:** consumes the event, writes an invoice, balanced debit/credit entries and an outbox record in one **PostgreSQL** transaction. An outbox publisher emits `invoice.posted`, which CRM consumes.

Money is integer USD cents. One synthetic rack costs 240,000 cents ($2,400); the demo excludes tax. Debit accounts receivable and credit infrastructure revenue for the same amount. Replaying an order creates a new trace, not a second invoice or stock movement. This is intentionally simpler than a full tax, revenue-recognition, multicurrency or accounts-payable system.

The UI supports healthy orders, slow accounting SQL, credit rejection, stock conflict, replay and bounded Java/Go allocation pressure. Failed business checks are expected outcomes, not infrastructure failures.

### Telemetry contract

Services emit OpenTelemetry to the Collector. HTTP carries W3C `traceparent`. Redis message envelopes explicitly carry `traceparent` and `schema: 1`; consumers extract that context rather than relying on thread-local context across a queue. The Collector exports traces to Tempo and metrics to Prometheus. Grafana is provisioned with both data sources and a runtime dashboard.

Resource service names are exactly `commerce`, `crm`, `erp`, `assets`, `accounting`. Correlate with `order.id`, trace ID, span ID, service and engine—not customer names, email addresses or payment details. Demo spans additionally carry `racmond.demo=true`.

Redis and PostgreSQL provide different guarantees: a database transaction does not automatically include a message broker. The lab uses atomic assignment+publish in Redis, a PostgreSQL transactional outbox, idempotent consumers and pending-entry recovery. It is still a bounded demo: no claim of exactly-once delivery, full saga recovery, production dead-letter handling or financial certification.

## 4. Repository map

- `src/app/(platform)/`: product routes and the shared shell.
- `src/components/platform/PlatformShell.tsx`: top navigation; `ModuleHeader`: consistent module headings.
- `src/components/ui.tsx`, `src/app/globals.css`: shared glass controls and theme tokens. Use these before inventing another design system.
- `src/components/lab/`, `src/lib/lab/`: new trace, runtime and strategy experiences. Pure demo/model code is separated from route handlers and network calls.
- `src/db/schema.ts`, `src/lib/data.ts`: durable fleet schema, queries, seeding and DTO mapping.
- `src/lib/types.ts`: server-side inventory validation. Reuse it on writes.
- `src/app/api/`: HTTP boundaries. New lab credentials and service URLs stay server-side.
- `src/instrumentation.ts` / `.node.ts`: opt-in Node.js OpenTelemetry initialization.
- `lab/`: five-service environment, schema, observability configs and operating instructions.
- `docs/leadership-workshop.md`: decisions, trade-offs and measurable acceptance gates.
- `tests/`: model, telemetry decoding, scenario and invariant checks.

## 5. Engineering rules

Use the installed Next.js 16 documentation before changing framework conventions. Keep client components small enough to reason about; validate untrusted input on the server. Browser code calls relative `/api/...` paths, never a container hostname or localhost backend. Preserve existing URLs and database records.

Every relational graph uses React Flow; maps use Leaflet. Time-series charts are not relational graphs and can use SVG. New surfaces should work in both themes, on narrow screens and with keyboard navigation. Avoid animation as the only indicator of state.

Do not describe a mock as an integration. Do not quietly turn a live failure into demo data. Do not treat a local allowlist as isolation. Authentication, tenant-scoped RBAC, immutable audit and human approvals are prerequisites for a shared privileged deployment. The lab's shared internal token is **service authentication for a local demo**, not end-user identity.

JVM GC notifications and Go pause-ring samples are different measurements. Go's heap has no fixed JVM-style maximum; do not invent one. Cumulative collector time is not the same as individual stop-the-world duration. The workbench deliberately excludes heap dumps, arbitrary MBean operations and forced GC.

## 6. How to work and verify

Start with the skill, then this brief, then the smallest relevant source files. Keep changes vertical: contract → server behavior → UI state → tests → documentation. Check `git status --short` before and after.

```bash
npm ci --legacy-peer-deps
npm run dev                 # binds 0.0.0.0 for live previews
npm run typecheck
npm run lint
npm test
npm run build
```

The local preview's synthetic lab does not require PostgreSQL. The original fleet does. `drizzle/` contains the initial generated migration; `npm run db:push` is the development schema-sync path. `DATABASE_URL` is honored by both the application and Drizzle configuration.

For the real polyglot stack, follow `lab/README.md`. It requires Docker Compose and outbound package/image registry access. Run Compose configuration validation, build every service, then run `bash lab/smoke.sh`. Those are separate claims from passing the Next.js demo tests. `.github/workflows/validate.yml` performs exactly that on every push to an `arena/**` branch and on pull requests, and publishes container status plus per-service logs as a job summary and commit comment when it fails. The stack went fully green in CI run 41958721142 (commit `c02d1f1`); see `docs/implementation-validation.md` for what that run does and does not prove. Record unavailable runtimes explicitly rather than implying a container build succeeded.

Update this brief when a boundary changes—especially demo → live integration, persistence, security, external providers or supported runtimes. Keep it concise; link to deeper documents instead of copying code into context.
