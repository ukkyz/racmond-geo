"use client";

import { useMemo, useState } from "react";
import { ModuleHeader } from "@/components/platform/PlatformShell";
import { Button, Badge } from "@/components/ui";
import {
  acceptRisk,
  createSecurityStore,
  investigate,
  recomputePosture,
  remediate,
  SEVERITY_TONE,
  STATUS_TONE,
  REACHABILITY_TONE,
  type Reachability,
  type Sbom,
  type Severity,
  type VulnStatus,
  type Vulnerability,
} from "@/lib/platform/security";

type Tab = "vulnerabilities" | "sbom" | "compliance" | "runtime";

const TABS: { key: Tab; label: string; count?: number }[] = [
  { key: "vulnerabilities", label: "Vulnerabilities" },
  { key: "sbom", label: "SBOM" },
  { key: "compliance", label: "Compliance" },
  { key: "runtime", label: "Runtime security" },
];

function Sparkline({ data, tone = "#a855f7" }: { data: number[]; tone?: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  return (
    <div className="flex h-8 items-end gap-0.5" aria-hidden>
      {data.map((v, i) => {
        const h = Math.max(8, ((v - min) / Math.max(1, max - min)) * 100);
        return (
          <span
            key={i}
            className="w-1.5 rounded-full"
            style={{
              height: `${h}%`,
              background: `linear-gradient(to t, ${tone}55, ${tone})`,
            }}
          />
        );
      })}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = score >= 85 ? "#10b981" : score >= 65 ? "#f59e0b" : "#ef4444";
  return (
    <svg viewBox="0 0 64 64" className="h-24 w-24">
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(196,181,253,0.2)" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" className="fill-[var(--text-primary)]" style={{ fontSize: 16, fontWeight: 700 }}>
        {score}
      </text>
    </svg>
  );
}

export default function SecurityDashboard() {
  const store = useMemo(() => createSecurityStore(), []);
  const [vulns, setVulns] = useState<Vulnerability[]>(store.vulnerabilities);
  const [posture, setPosture] = useState(() => recomputePosture(store.vulnerabilities));
  const [tab, setTab] = useState<Tab>("vulnerabilities");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [triage, setTriage] = useState(false);
  const [expandedSbom, setExpandedSbom] = useState<string | null>(store.sboms[0]?.id ?? null);

  const [filters, setFilters] = useState({
    severities: new Set<Severity>(),
    reachability: new Set<Reachability>(),
    statuses: new Set<VulnStatus>(),
    query: "",
  });

  const recompute = (next: Vulnerability[]) => {
    setVulns(next);
    setPosture(recomputePosture(next));
  };

  const toggle = (
    key: "severities" | "reachability" | "statuses",
    value: Severity | Reachability | VulnStatus,
  ) => {
    setFilters((f) => {
      const current = f[key] as Set<Severity | Reachability | VulnStatus>;
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...f, [key]: next };
    });
  };

  const filtered = useMemo(() => {
    const list = vulns.filter((v) => {
      if (filters.severities.size && !filters.severities.has(v.severity)) return false;
      if (filters.reachability.size && !filters.reachability.has(v.reachability)) return false;
      if (filters.statuses.size && !filters.statuses.has(v.status)) return false;
      if (filters.query.trim()) {
        const q = filters.query.trim().toLowerCase();
        if (![v.id, v.title, v.package, v.service, v.asset, v.image].filter(Boolean).join(" ").toLowerCase().includes(q))
          return false;
      }
      return true;
    });
    return list.sort((a, b) => b.cvss - a.cvss);
  }, [vulns, filters, triage]);

  const selected = vulns.find((v) => v.id === selectedId) ?? null;

  const complianceAvg = Math.round(
    store.frameworks.reduce((a, f) => a + f.score, 0) / store.frameworks.length,
  );

  return (
    <div className="fade-in space-y-5">
      <ModuleHeader
        eyebrow="Module · Security & Posture (L6)"
        title="Security & posture"
        description="Vulnerability management with reachability, SBOM, policy/compliance state and eBPF-style runtime security. Links up to the services (L3) and assets (L1) that own each finding."
        actions={
          <Button
            variant={triage ? "subtle" : "primary"}
            onClick={() => setTriage((t) => !t)}
          >
            {triage ? "Triage: risk-ranked" : "AI triage"}
          </Button>
        }
      />

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="glass-card flex items-center gap-4 rounded-2xl p-4 lg:col-span-2">
          <ScoreRing score={posture.score} />
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Posture score
            </p>
            <p className="text-[15px] font-bold text-[var(--text-primary)]">
              {posture.score >= 85 ? "Healthy" : posture.score >= 65 ? "Watch" : "Elevated risk"}
            </p>
            <Sparkline data={posture.trend} tone={posture.score >= 85 ? "#10b981" : "#f59e0b"} />
          </div>
        </div>
        <Kpi label="Critical" value={posture.critical} tone="text-rose-400" />
        <Kpi label="High" value={posture.high} tone="text-orange-400" />
        <Kpi label="Reachable" value={posture.reachable} tone="text-amber-400" />
        <Kpi label="Exploits" value={posture.exploitAvailable} tone="text-fuchsia-400" />
        <Kpi label="Compliance" value={`${complianceAvg}`} tone="text-emerald-400" />
      </div>

      {triage ? (
        <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 p-3 text-[12.5px] text-purple-100">
          AI triage is ranking findings by business risk (reachability + exploit
          availability + severity), not just CVSS. Reachable criticals with
          known exploits are surfaced first.
        </div>
      ) : null}

      {/* Tabs */}
      <div className="glass-card overflow-hidden rounded-2xl">
        <div className="flex flex-wrap gap-1 border-b border-[var(--glass-divider)] p-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-3.5 py-1.5 text-[12.5px] font-medium transition ${
                tab === t.key
                  ? "bg-gradient-to-r from-rose-600/25 to-fuchsia-600/18 text-[var(--text-primary)] border border-rose-500/40"
                  : "text-[var(--text-muted)] hover:bg-[var(--glass-card-hover)] border border-transparent"
              }`}
            >
              {t.label}
              {t.key === "vulnerabilities" ? (
                <span className="ml-1.5 text-[10.5px] opacity-70">{posture.critical + posture.high}</span>
              ) : null}
            </button>
          ))}
        </div>

        {tab === "vulnerabilities" ? (
        <VulnTab
          filtered={filtered}
          filters={filters}
          toggle={toggle}
          selectedId={selectedId}
          onSelect={setSelectedId}
          query={filters.query}
          setQuery={(q) => setFilters((f) => ({ ...f, query: q }))}
        />
        ) : null}

        {tab === "sbom" ? <SbomTab sboms={store.sboms} expanded={expandedSbom} setExpanded={setExpandedSbom} /> : null}

        {tab === "compliance" ? <ComplianceTab frameworks={store.frameworks} /> : null}

        {tab === "runtime" ? <RuntimeTab events={store.events} /> : null}
      </div>

      {/* Detail drawer */}
      {selected ? (
        <div className="glass-panel-strong fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l fade-in">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--glass-divider)] p-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{selected.id}</h2>
              <p className="text-[12px] text-[var(--text-muted)]">{selected.title}</p>
            </div>
            <button onClick={() => setSelectedId(null)} className="action-icon text-[12px]">✕</button>
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={selected.severity === "critical" ? "rose" : selected.severity === "high" ? "amber" : selected.severity === "medium" ? "amber" : "sky"}>
                {selected.severity} · CVSS {selected.cvss}
              </Badge>
              <Badge tone="violet">{selected.reachability}</Badge>
              {selected.exploitAvailable ? <Badge tone="rose">exploit public</Badge> : null}
            </div>

            <Detail label="Affected package" value={`${selected.package}@${selected.version}`} />
            {selected.fixedVersion ? <Detail label="Fixed in" value={selected.fixedVersion} /> : null}
            <Detail label="CWE" value={selected.cwe} />
            <Detail label="Service" value={selected.service ?? "—"} />
            <Detail label="Asset" value={selected.asset ?? "—"} />
            <Detail label="Image" value={selected.image ?? "—"} />
            <Detail label="Discovered" value={selected.discoveredAt} />

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Remediation
              </p>
              <p className="glass-card rounded-xl p-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                {selected.remediation}
              </p>
            </div>

            {selected.status === "accepted" && selected.acceptedReason ? (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Accepted risk
                </p>
                <p className="glass-card rounded-xl p-3 text-[12.5px] text-[var(--text-muted)]">
                  {selected.acceptedReason}
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-[var(--glass-divider)] p-3">
            {selected.status !== "remediated" ? (
              <Button
                className="flex-1"
                onClick={() => {
                  recompute(remediate(vulns, selected.id));
                  setSelectedId(null);
                }}
              >
                Remediate
              </Button>
            ) : null}
            {selected.status === "open" ? (
              <Button
                variant="subtle"
                onClick={() => {
                  recompute(investigate(vulns, selected.id));
                  setSelectedId(null);
                }}
              >
                Investigate
              </Button>
            ) : null}
            {selected.status !== "remediated" ? (
              <Button
                variant="ghost"
                onClick={() => {
                  recompute(
                    acceptRisk(vulns, selected.id, "Compensating control in place; re-review next quarter."),
                  );
                  setSelectedId(null);
                }}
              >
                Accept risk
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--glass-divider)] py-2 last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
      <span className="text-right font-mono text-[12px] font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function VulnTab({
  filtered,
  filters,
  toggle,
  selectedId,
  onSelect,
  query,
  setQuery,
}: {
  filtered: Vulnerability[];
  filters: {
    severities: Set<Severity>;
    reachability: Set<Reachability>;
    statuses: Set<VulnStatus>;
    query: string;
  };
  toggle: (key: "severities" | "reachability" | "statuses", value: Severity | Reachability | VulnStatus) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  setQuery: (q: string) => void;
}) {
  const severities: Severity[] = ["critical", "high", "medium", "low"];
  const reachability: Reachability[] = ["reachable", "present", "unknown"];
  const statuses: VulnStatus[] = ["open", "investigating", "accepted", "remediated"];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--glass-divider)] p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search CVE, package, service, asset…"
          className="glass-input w-56 rounded-xl px-3 py-1.5 text-[12.5px] outline-none"
        />
        <div className="flex flex-wrap gap-1">
          {severities.map((s) => (
            <button
              key={s}
              onClick={() => toggle("severities", s)}
              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold capitalize transition ${
                filters.severities.has(s) ? "border-rose-500/40 bg-rose-500/15 text-rose-300" : "border-[var(--glass-border)] text-[var(--text-muted)]"
              }`}
            >
              {s}
            </button>
          ))}
          {reachability.map((r) => (
            <button
              key={r}
              onClick={() => toggle("reachability", r)}
              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold capitalize transition ${
                filters.reachability.has(r) ? "border-amber-500/40 bg-amber-500/15 text-amber-300" : "border-[var(--glass-border)] text-[var(--text-muted)]"
              }`}
            >
              {r}
            </button>
          ))}
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => toggle("statuses", s)}
              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold capitalize transition ${
                filters.statuses.has(s) ? "border-purple-500/40 bg-purple-500/15 text-purple-200" : "border-[var(--glass-border)] text-[var(--text-muted)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto thin-scroll">
        <table className="w-full min-w-[900px] text-left text-[12.5px]">
          <thead className="text-[10.5px] uppercase tracking-wider text-[var(--text-subtle)]">
            <tr className="border-b border-[var(--glass-divider)]">
              {["Finding", "Package", "Owner", "Reach", "Exploit", "CVSS", "Status"].map((h) => (
                <th key={h} className="px-3.5 py-2.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr
                key={v.id}
                onClick={() => onSelect(v.id)}
                className={`cursor-pointer border-b border-[var(--glass-divider)] last:border-0 transition ${
                  selectedId === v.id ? "bg-purple-500/12" : "hover:bg-[var(--glass-card-hover)]"
                }`}
              >
                <td className="px-3.5 py-3">
                  <span className="block font-semibold text-[var(--text-primary)]">{v.id}</span>
                  <span className="block truncate text-[11px] text-[var(--text-muted)]">{v.title}</span>
                  <span className={`mt-1 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold capitalize ${SEVERITY_TONE[v.severity]}`}>
                    {v.severity}
                  </span>
                </td>
                <td className="px-3.5 py-3 font-mono text-[11.5px] text-[var(--text-muted)]">
                  {v.package}@{v.version}
                </td>
                <td className="px-3.5 py-3">
                  <div className="space-y-0.5">
                    {v.service ? <p className="text-[11.5px] text-[var(--text-primary)]">{v.service}</p> : null}
                    {v.asset ? <p className="font-mono text-[10.5px] text-[var(--text-subtle)]">{v.asset}</p> : null}
                    {!v.service && !v.asset ? <span className="text-[var(--text-subtle)]">—</span> : null}
                  </div>
                </td>
                <td className="px-3.5 py-3">
                  <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${REACHABILITY_TONE[v.reachability]}`}>
                    {v.reachability}
                  </span>
                </td>
                <td className="px-3.5 py-3">
                  {v.exploitAvailable ? <Badge tone="rose">public</Badge> : <span className="text-[var(--text-subtle)]">—</span>}
                </td>
                <td className="px-3.5 py-3 font-mono font-semibold text-[var(--text-primary)]">{v.cvss}</td>
                <td className="px-3.5 py-3">
                  <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${STATUS_TONE[v.status]}`}>
                    {v.status}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3.5 py-10 text-center text-[12px] text-[var(--text-subtle)]">
                  No findings match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SbomTab({
  sboms,
  expanded,
  setExpanded,
}: {
  sboms: Sbom[];
  expanded: string | null;
  setExpanded: (id: string | null) => void;
}) {
  return (
    <div className="p-4 space-y-2">
      {sboms.map((sbom) => {
        const vulnerable = sbom.entries.filter((e) => e.vulnerabilities.length > 0).length;
        const open = sbom.entries.reduce((a, e) => a + e.vulnerabilities.length, 0);
        const isOpen = expanded === sbom.id;
        return (
          <div key={sbom.id} className="glass-card-interactive overflow-hidden rounded-2xl">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : sbom.id)}
              className="flex w-full items-center gap-3 p-3.5 text-left"
            >
              <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-sky-500/15 text-sky-300">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path d="M4 10 10 4l6 6-6 6-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M8 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[12.5px] font-semibold text-[var(--text-primary)]">{sbom.name}</p>
                <p className="truncate font-mono text-[10.5px] text-[var(--text-muted)]">{sbom.digest} · {sbom.generatedAt}</p>
              </div>
              <Badge tone={open > 0 ? "amber" : "emerald"}>{open} open</Badge>
              <span className="text-[11px] text-[var(--text-subtle)]">{sbom.entries.length} components</span>
              <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isOpen ? (
              <div className="border-t border-[var(--glass-divider)] p-2">
                <div className="thin-scroll max-h-72 overflow-y-auto">
                  {sbom.entries.map((e) => (
                    <div key={`${sbom.id}-${e.name}-${e.version}`} className="flex items-center gap-3 rounded-xl px-3 py-2 text-[12px]">
                      <span className={`h-2 w-2 rounded-full ${e.vulnerabilities.length ? "bg-amber-400" : "bg-emerald-400"}`} />
                      <span className="font-mono font-semibold text-[var(--text-primary)]">{e.name}@{e.version}</span>
                      <span className="rounded-md bg-[var(--glass-input)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">{e.license}</span>
                      <span className="ml-auto flex flex-wrap justify-end gap-1">
                        {e.vulnerabilities.map((cve) => (
                          <span key={cve} className="rounded border border-amber-500/30 bg-amber-500/12 px-1.5 py-0.5 font-mono text-[9.5px] text-amber-300">{cve}</span>
                        ))}
                        {e.vulnerabilities.length === 0 ? <span className="text-[10px] text-emerald-300">clean</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ComplianceTab({ frameworks }: { frameworks: ReturnType<typeof createSecurityStore>["frameworks"] }) {
  return (
    <div className="p-4 grid gap-4 lg:grid-cols-2">
      {frameworks.map((f) => (
        <div key={f.id} className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13.5px] font-semibold text-[var(--text-primary)]">{f.name}</p>
              <p className="text-[11px] text-[var(--text-muted)]">Updated {f.updatedAt}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-[var(--text-primary)]">{f.score}</p>
              <Badge tone={f.status === "compliant" ? "emerald" : f.status === "partial" ? "amber" : "rose"}>{f.status}</Badge>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {f.controls.map((c) => (
              <div key={c.id} className="flex items-start gap-2 rounded-xl border border-[var(--glass-border)] p-2.5">
                <span className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-md text-[10px] font-bold ${
                  c.status === "pass" ? "bg-emerald-500/20 text-emerald-300" : c.status === "fail" ? "bg-rose-500/20 text-rose-300" : c.status === "warn" ? "bg-amber-500/20 text-amber-300" : "bg-slate-500/20 text-slate-300"
                }`}>
                  {c.status === "pass" ? "✓" : c.status === "fail" ? "✕" : "!"}
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-[var(--text-primary)]">
                    <span className="font-mono text-[10.5px] text-[var(--text-subtle)]">{c.id}</span> {c.name}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">{c.evidence}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RuntimeTab({ events }: { events: ReturnType<typeof createSecurityStore>["events"] }) {
  return (
    <div className="p-4 space-y-2">
      {events.map((e) => (
        <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-[var(--glass-border)] p-3">
          <span className={`grid h-9 w-9 flex-none place-items-center rounded-lg text-[10px] font-bold uppercase ${SEVERITY_TONE[e.severity]}`}>
            {e.kind[0]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-[var(--text-primary)]">{e.description}</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              <span className="font-mono">{e.time}</span> · <span className="capitalize">{e.kind}</span> · {e.source}
            </p>
          </div>
          <Badge tone={e.status === "new" ? "rose" : e.status === "investigating" ? "amber" : e.status === "blocked" ? "rose" : "slate"}>
            {e.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}
