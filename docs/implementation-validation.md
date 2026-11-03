# Implementation validation — 3 November 2026

## Validated in this workspace

- TypeScript: `npm run typecheck`.
- Unit tests: `npm test` — 13 tests covering scenario validation, five-service trace continuity, producer/consumer parenting, business rejection boundaries, money conservation, idempotent demo replay, latency injection, cycle-safe waterfall, Tempo decoding, runtime sample invariants and decision-board integrity.
- Lint: `npm run lint` — no errors; three pre-existing warnings in the original CLI, overview and security modules remain.
- Production web build: `npm run build`.
- Fleet schema: generated initial Drizzle migration and pushed it to an isolated local PostgreSQL preview database; `/api/servers` successfully seeded and read the demo fleet.
- Browser smoke checks: `/trace-lab`, `/runtime`, `/strategy`, transaction execution, business-record tab, decision dialog/Escape, Java→Go runtime switch, pause and mobile viewport. No uncaught browser errors or document-level horizontal overflow at 1440px and 390px.
- PHP syntax: all twelve PHP files passed `php -l` using a PHP 8.5 WASM runtime. This is syntax validation, not Laravel/extension execution; the container targets PHP 8.3.
- Java syntax: all three Java source files passed `java-parser`. This is not a Java compiler or Spring integration test.
- Compose, Collector, Tempo, Prometheus and Grafana provisioning YAML parsed successfully; dashboard JSON parsed successfully.

## Not executed here

Docker is not installed in the workspace. The full 13-service Compose stack, image builds, cross-service live OTLP export, real Redis consumer recovery, JVM/Go runtime endpoint measurements and `lab/smoke.sh` were **not executed**. Java/Go/Rust package compilation and dependency resolution still require their container builds. Do not describe these as passed.

A GitHub Actions workflow (`.github/workflows/validate.yml`) is included to run the web checks and build/start/test the actual Compose stack on a Docker-capable runner. It generates ephemeral credentials and destroys its lab volumes afterward. The workflow is intended to provide the missing Docker-capable validation; local results do not imply it has passed.

## Reproduce

```bash
npm ci --legacy-peer-deps
npm run typecheck && npm run lint && npm test && npm run build
# On a Docker-capable host, after configuring lab/.env:
docker compose -f lab/compose.yaml config --quiet
docker compose -f lab/compose.yaml up --build -d --wait
bash lab/smoke.sh
```

## Known scope limits

- The trace lab is synthetic business data and simplified accounting, not a production ERP.
- Live history belongs to the lab databases; the synthetic history is process-local and bounded.
- The runtime page keeps bounded browser history; Prometheus is the retained metric backend.
- The CLI is not a sandbox; end-user identity/RBAC and audit are roadmap release gates.
- The leadership workshop is a role synthesis, not actual stakeholder approval.
