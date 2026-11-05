# Implementation validation — 5 November 2026

**Green runs: [41958721142](https://github.com/ukkyz/racmond-geo/actions/runs/41958721142) on commit
`c02d1f1` and [41959441763](https://github.com/ukkyz/racmond-geo/actions/runs/41959441763) on commit
`5d0aafe` — `web` ✓ and `polyglot-lab` ✓ in both** (build, start and the full live `lab/smoke.sh`). The details
below come from that run, from the preceding run
[41957854929](https://github.com/ukkyz/racmond-geo/actions/runs/41957854929) (commit `8c85f19`) that
isolated the last defect, and from local checks in this workspace. CI is the only Docker-capable
environment available: no Docker daemon runs in the authoring sandbox, so local results never include
container execution.

## Passed in CI on every run

- `web` job: `npm ci --legacy-peer-deps`, `npm run typecheck`, `npm run lint` (no errors, three
  pre-existing warnings in `CliRunner`, `OverviewPage` and `SecurityDashboard`), `npm test` (13 tests)
  and `npm run build` (production Next.js build).
- `docker compose -f lab/compose.yaml config --quiet` — the 13-service definition is valid.
- **Build lab images** — Next.js commerce image, PHP 8.3 Laravel CRM image, Rust 1.90 ERP image, Go assets
  image and the Java 21 accounting image with the OpenTelemetry javaagent all build from source.
- **Start lab** — all 13 services reach `healthy` (or `running` for the worker, Grafana and Tempo).
- **Wholly green `polyglot-lab` job**: `Build lab images` ✓, `Start lab` ✓, `Run live smoke checks` ✓
  (all three smoke assertions, including `PASS: both Java and Go runtime endpoints returned measured
  samples.`), then volumes destroyed.
- **Live business flow (smoke steps 1–2)**:
  - `PASS: order completed and one trace contains all five services.`
  - `PASS: replay completed with a new trace and preserved invoice, journal balance and reservation counts.`

  Run 41957854929 created order `7b834c05-11ac-4fbc-8f9d-023a05cb0df5` under trace
  `b71b08a5c6de72e7d80fff53df609d83`. Tempo held five distinct services in that single trace, so the
  Next.js gateway → Laravel CRM → Rust ERP → Go assets → Java accounting → Laravel worker chain is one
  distributed trace, including the Redis-stream hop into accounting and the `invoice.posted` hop back to
  the CRM worker. The duplicate replay kept one invoice, one active reservation and a balanced journal,
  and produced a different trace ID.

## Failed, then fixed

- **`/api/runtime?mode=live` returned `HTTP 404` for accounting** — run 41957854929 (commit `8c85f19`);
  the same run passed both business-flow assertions and confirmed the fix below in run 41958721142.
  `GET /internal/runtime` was declared inside `AccountingApplication`, which carried only
  `@SpringBootApplication` and `@EnableScheduling`; Spring never registered a controller for it. Fixed in
  `c02d1f1` by adding `@RestController` to that class. The Go side already answered with a measured
  `go1.24.13` sample in the same run; after the fix the smoke script's final assertion saw measured
  samples for both services and the whole job went green.
- Earlier failures on this branch, each fixed and re-verified: masked workflow success without
  `pipefail`; Rust MSRV/lock drift; ERP `TracerProvider` import; invalid javaagent jar; Redis
  `BUSYGROUP` at startup; a falsey empty pending read that starved the CRM worker; comma-joined duplicate
  `traceparent` headers that split the CRM trace from the gateway trace.

## Verified locally (no Docker)

- TypeScript: `npm run typecheck`; unit tests: `npm test` (13 tests); lint: `npm run lint`; production
  build: `npm run build` (14 static pages).
- Fleet schema: generated initial Drizzle migration applied to an isolated local PostgreSQL preview
  database; `/api/servers` seeded and read the demo fleet.
- Browser: `/trace-lab`, `/runtime`, `/strategy`, transaction execution, business-record tab, decision
  dialog/Escape, Java→Go runtime switch, pause, and a 390px mobile viewport — no uncaught errors, no
  document-level horizontal overflow.
- PHP: all twelve `lab/crm` PHP files pass `php -l` under a PHP 8.5 WASM runtime (syntax only, not
  Laravel execution; the container targets PHP 8.3).
- Java: all three `lab/accounting` sources parse with `java-parser` (syntax only, not a compiler or
  Spring integration test).
- Compose, Collector, Tempo, Prometheus and Grafana YAML parse; the Grafana dashboard JSON parses.

## Boundaries to state honestly

- The CI lab sets ephemeral credentials and destroys its volumes after the run; it is evidence that the
  stack works, not a hosted environment.
- JVM and Go runtime numbers are real JMX/`runtime/metrics` readings, but the runtime page is a demo-grade
  viewer inspired by JVisualVM, not a profiler: no forced GC, no heap dumps, no allocation sampling.
- `GET /api/lab` still returns process-local synthetic demo history and ignores `mode`.
- One replica per service: no dead-letter queue, no leader election, no multi-replica stream consumption.
- The CLI is not a sandbox; identity/RBAC and audit remain roadmap release gates.
- The leadership workshop in `docs/leadership-workshop.md` is an AI-synthesized role exercise, not
  stakeholder approval.

## Reproduce

```bash
npm ci --legacy-peer-deps
npm run typecheck && npm run lint && npm test && npm run build
# On a Docker-capable host, after configuring lab/.env:
docker compose -f lab/compose.yaml config --quiet
docker compose -f lab/compose.yaml up --build -d --wait
bash lab/smoke.sh
```

The same steps run in `.github/workflows/validate.yml`; on failure the workflow publishes container
status, per-service logs and the smoke output as a job summary and a commit comment.
