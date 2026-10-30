"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ModuleHeader } from "@/components/platform/PlatformShell";
import { Button } from "@/components/ui";

type Health = {
  ok: boolean;
  total: number;
  online: number;
  warning: number;
  offline: number;
  physical: number;
  virtual: number;
};

const DEMO_HEALTH: Health = {
  ok: false,
  total: 48,
  online: 31,
  warning: 7,
  offline: 6,
  physical: 17,
  virtual: 31,
};

const MODULES = [
  {
    href: "/",
    name: "DC Monitor · Fleet",
    tag: "Inventory",
    tone: "violet",
    blurb:
      "Physical and virtual servers plotted on OpenStreetMap with ownership, sites, projects, tags and faceted filtering.",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
        <path d="M10 18s6-4.9 6-9a6 6 0 1 0-12 0c0 4.1 6 9 6 9Z" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="9" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/docker",
    name: "Docker Desktop",
    tag: "Containers",
    tone: "sky",
    blurb:
      "Containers, images, volumes, networks and Compose projects with live engine stats and lifecycle actions.",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
        <rect x="2.5" y="6.5" width="15" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6 6.5v7M10 6.5v7M14 6.5v7" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
        <path d="M5 4.2h10l-1.6 2.3H6.6L5 4.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/workflows",
    name: "Workflow Builder",
    tag: "Automation",
    tone: "fuchsia",
    blurb:
      "Drag-and-drop triggers, conditions, actions and AI steps into a DAG and simulate a run end to end.",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
        <circle cx="5" cy="5" r="2.1" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="15" cy="15" r="2.1" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="5" cy="15" r="2.1" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7.1 5h2.4a1.6 1.6 0 0 1 1.6 1.6v3.3M7.1 15h2.4a1.6 1.6 0 0 0 1.6-1.6V10.1" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    href: "/apm",
    name: "APM Service Map",
    tag: "Tracing",
    tone: "indigo",
    blurb:
      "Pinpoint/Jaeger-style call graphs. Every graph is an @xyflow/react canvas with a collapsible parent/child hierarchy.",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
        <path d="M3 16h4l2-6 3 9 2-7 2 4h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/cli",
    name: "Local CLI Runner",
    tag: "Execution",
    tone: "amber",
    blurb:
      "Drive any locally installed CLI from the browser. Detected binaries, whitelisted execution and live streaming output.",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
        <rect x="2.5" y="4" width="15" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6 8.5 8 10.5 6 12.5M9.5 12.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/agent",
    name: "AI Agent",
    tag: "Assistant",
    tone: "emerald",
    blurb:
      "Diagnoses fleet problems, proposes remediation and runs safe actions. Works with a real LLM or the built-in reasoning engine.",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
        <rect x="5" y="7" width="10" height="9" rx="2.4" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="10" cy="11.5" r="1.5" fill="currentColor" />
        <path d="M10 4.6V7M8 4.6a2 2 0 0 1 4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M2.6 12.4h2M15.4 12.4h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/security",
    name: "Security & Posture",
    tag: "DevSecOps",
    tone: "rose",
    blurb:
      "L6 security: vulnerability management with reachability, SBOM browser, compliance state and eBPF-style runtime events.",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
        <path d="M10 2.5 3 5v5c0 4.4 3 7.5 7 9 4-1.5 7-4.6 7-9V5l-7-2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M7.5 10l1.8 1.8L12.5 8.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone: string;
}) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold ${tone}`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

const TONE_CLASS: Record<string, string> = {
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-300 border-violet-500/30",
  sky: "bg-sky-500/12 text-sky-600 dark:text-sky-300 border-sky-500/30",
  fuchsia:
    "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300 border-fuchsia-500/30",
  indigo: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 border-indigo-500/30",
  amber: "bg-amber-500/12 text-amber-600 dark:text-amber-300 border-amber-500/30",
  emerald:
    "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
};

export default function OverviewPage() {
  const [health, setHealth] = useState<Health>(DEMO_HEALTH);
  const [source, setSource] = useState<"live" | "demo">("demo");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/servers", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const s = data.stats ?? {};
        if (!alive) return;
        setHealth({
          ok: true,
          total: s.total ?? 0,
          online: s.online ?? 0,
          warning: s.warning ?? 0,
          offline: s.offline ?? 0,
          physical: s.physical ?? 0,
          virtual: s.virtual ?? 0,
        });
        setSource("live");
      })
      .catch(() => {
        if (alive) setSource("demo");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const healthTone =
    health.offline > 0
      ? "text-rose-500"
      : health.warning > 0
        ? "text-amber-500"
        : "text-emerald-500";

  return (
    <div className="fade-in space-y-6">
      <ModuleHeader
        eyebrow="Racmond · data center operations platform"
        title="One control surface for the whole estate"
        description="Fleet inventory, container estates, automation, distributed-system tracing, ad-hoc CLI access and an AI agent — all sharing one shell, one design system and one @xyflow/react canvas engine."
        actions={
          <Button onClick={() => (window.location.href = "/architecture")}>
            View architecture
          </Button>
        }
      />

      <div className="glass-card rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold text-[var(--text-primary)]">
              Fleet health
            </p>
            <p className="text-[11.5px] text-[var(--text-muted)]">
              Source:{" "}
              <span
                className={`font-semibold ${
                  source === "live" ? "text-emerald-500" : "text-amber-400"
                }`}
              >
                {loading ? "connecting…" : source === "live" ? "live database" : "demo dataset"}
              </span>
            </p>
          </div>
          <div className={`text-2xl font-bold ${healthTone}`}>
            {health.offline} offline
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard label="Assets" value={health.total} tone="text-[var(--text-primary)]" />
          <StatCard label="Online" value={health.online} tone="text-emerald-500" />
          <StatCard label="Warning" value={health.warning} tone="text-amber-500" />
          <StatCard label="Offline" value={health.offline} tone="text-rose-500" />
          <StatCard label="Physical" value={health.physical} tone="text-violet-500" />
          <StatCard label="Virtual" value={health.virtual} tone="text-fuchsia-500" />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-[var(--text-primary)]">
            Capabilities
          </h2>
          <span className="text-[11px] text-[var(--text-subtle)]">
            {MODULES.length} modules
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="group glass-card-interactive flex flex-col rounded-2xl p-4"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl border ${TONE_CLASS[m.tone] ?? TONE_CLASS.violet}`}
                >
                  {m.icon}
                </span>
                <span className="rounded-md border border-[var(--glass-border)] bg-[var(--glass-input)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {m.tag}
                </span>
              </div>
              <h3 className="mt-3 text-[14px] font-semibold text-[var(--text-primary)]">
                {m.name}
              </h3>
              <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                {m.blurb}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent-text)]">
                Open
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                  <path d="M5 10h9M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          How the pieces fit
        </h3>
        <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
          The fleet is the source of truth. The Docker module shows what runs on
          it, the workflow builder turns repetitive operations into DAGs, the APM
          map shows how the services actually talk, the CLI runner gives you
          ground-truth access to the host, and the agent ties them together —
          reading fleet state and driving safe actions through the same runner.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11.5px]">
          {["Inventory →", "Containers →", "Automation →", "Tracing →", "CLI →", "Security →", "Agent"].map(
            (step, i) => (
              <span
                key={step}
                className={`glass-pill rounded-xl px-3 py-1.5 text-[var(--text-secondary)] ${
                  i === 5 ? "text-emerald-300" : ""
                }`}
              >
                {step}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
