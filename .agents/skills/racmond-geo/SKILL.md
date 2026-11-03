---
name: racmond-geo
description: Use when planning, implementing, reviewing, or operating Racmond. Provides the product intent, repository map, implementation contracts, telemetry conventions, and verification checklist without requiring a whole-repository code read.
---

# Racmond project context

## Start here

1. Read `docs/AI_CONTEXT.md` from the repository root. It is the short, plain-English product and engineering brief.
2. Read the root `AGENTS.md` for tool-generated framework instructions.
3. Run `git status --short` and inspect only the files relevant to the task. Check the actual implementation before describing a capability as live.
4. For a product decision, read `docs/leadership-workshop.md`; for the executable polyglot demo, read `lab/README.md`.

## Non-negotiable context

Racmond begins as **DC Monitor**, a map-first owned/rented physical and virtual asset inventory, and grows into a data-center operations control surface. Connect facility → asset → workload → service → request → data → business impact. It is not five unrelated dashboards.

- Preserve the existing Next.js App Router, React, TypeScript, Tailwind, glass design tokens, Leaflet maps, and React Flow graph conventions.
- Read the relevant installed Next.js guide under `node_modules/next/dist/docs/` before changing framework APIs. This checkout uses Next.js 16, not assumptions from an older release.
- Keep browser requests same-origin. Service DNS names and credentials belong in server-side environment variables, never in browser bundles.
- Label **demo**, **live**, and **unavailable** honestly. Never substitute synthetic telemetry for a failed live request without an explicit mode change.
- Durable inventory is PostgreSQL/Drizzle. Browser-local workflows and simulated Docker/security/APM datasets are not production integrations.
- Use OpenTelemetry and W3C trace context. Keep trace IDs intact across HTTP and Redis Streams; use bounded, synthetic business identifiers rather than customer PII in spans.
- Financial amounts are integer minor units. Journal debits must equal credits. Replays must not duplicate reservations, asset assignments, or journal entries.
- Host CLI and AI execution are privileged capabilities. Authentication, RBAC, audit, approvals, isolation, and an explicit deployment security review are prerequisites to exposing them publicly.
- JVM/Go monitoring is runtime observability, not a claim to implement heap dumps or a complete JVisualVM replacement.

## Task routing

| Change | First files |
| --- | --- |
| Navigation / shared shell | `src/components/platform/PlatformShell.tsx`, `src/app/(platform)/` |
| Shared controls / styling | `src/components/ui.tsx`, `src/app/globals.css` |
| Inventory / map | `src/db/schema.ts`, `src/lib/data.ts`, `src/components/Dashboard.tsx` |
| Trace lab | `src/lib/lab/`, `src/app/api/lab/`, `src/components/lab/TraceLab.tsx`, `lab/` |
| JVM / Go GC | `src/lib/lab/runtime.ts`, `src/app/api/runtime/`, `src/components/lab/RuntimeMonitor.tsx` |
| Product priorities | `src/lib/lab/strategy.ts`, `docs/leadership-workshop.md` |
| OTel / Grafana | `src/instrumentation.ts`, `lab/observability/` |

## Working method

- Make a small, vertical change that preserves existing routes and data.
- Prefer deterministic demo fixtures and typed contracts shared by the UI and server.
- Add tests for validation, idempotency, money conservation, trace parenting, and failure behavior when those paths change.
- Never commit secrets, runtime toolchains, container volumes, `node_modules`, build output, or generated heap dumps.
- Do not claim Docker, Java, Go, PHP, or Rust execution succeeded unless it actually ran. Record unavailable validation explicitly.

## Verify before handoff

```bash
npm run typecheck
npm run lint
npm test
npm run build
# Only when Docker is available:
docker compose -f lab/compose.yaml config --quiet
docker compose -f lab/compose.yaml up --build -d
bash lab/smoke.sh
```

Update `docs/AI_CONTEXT.md` when product boundaries or architecture change. Keep it short enough to be the first context payload, not another code dump. Update the skill only when the working instructions change.
