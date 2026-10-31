"use client";

import { useEffect, useMemo, useState } from "react";
import { ModuleHeader } from "@/components/platform/PlatformShell";
import { Button, Badge } from "@/components/ui";
import {
  CONTAINER_STATUS_TONE,
  composeAction,
  createDockerStore,
  jitterContainers,
  jitterEngine,
  setContainerStatus,
  type Container,
  type ContainerStatus,
  type ComposeProject,
} from "@/lib/platform/docker";

type Tab = "containers" | "images" | "volumes" | "networks" | "compose";

const TABS: { key: Tab; label: string; count?: number }[] = [
  { key: "containers", label: "Containers" },
  { key: "images", label: "Images" },
  { key: "volumes", label: "Volumes" },
  { key: "networks", label: "Networks" },
  { key: "compose", label: "Compose" },
];

function statusDot(status: ContainerStatus) {
  const color =
    status === "running"
      ? "#10b981"
      : status === "exited"
        ? "#6b7280"
        : status === "paused"
          ? "#f59e0b"
          : status === "created"
            ? "#0ea5e9"
            : "#d946ef";
  return color;
}

function Spark({ value, max = 100 }: { value: number; max?: number }) {
  return (
    <div className="flex items-end gap-0.5" aria-hidden>
      {Array.from({ length: 14 }).map((_, i) => {
        const h = Math.min(100, ((value + i * 7) % max) * 100) / max;
        return (
          <span
            key={i}
            className="w-1 rounded-full bg-gradient-to-t from-violet-500/40 to-fuchsia-400"
            style={{ height: `${Math.max(6, h)}%` }}
          />
        );
      })}
    </div>
  );
}

export default function DockerDesktop() {
  const [store, setStore] = useState(() => createDockerStore());
  const [tab, setTab] = useState<Tab>("containers");
  const [selected, setSelected] = useState<Container | null>(null);
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      setStore((s) => ({
        ...s,
        engine: jitterEngine(s.engine),
        containers: jitterContainers(s.containers),
      }));
    }, 2500);
    return () => clearInterval(t);
  }, [live]);

  const counts = useMemo(
    () => ({
      containers: store.containers.length,
      running: store.containers.filter((c) => c.status === "running").length,
      images: store.images.length,
      volumes: store.volumes.length,
      networks: store.networks.length,
      compose: store.compose.length,
    }),
    [store],
  );

  const act = (id: string, status: ContainerStatus) => {
    setStore((s) => ({
      ...s,
      containers: setContainerStatus(s.containers, id, status),
    }));
    setSelected(null);
  };

  const remove = (id: string) => {
    setStore((s) => ({
      ...s,
      containers: s.containers.filter((c) => c.id !== id),
    }));
    setSelected(null);
  };

  const projectAct = (name: string, action: "up" | "down") => {
    setStore((s) => ({
      ...s,
      compose: composeAction(s.compose, name, action),
    }));
  };

  return (
    <div className="fade-in space-y-5">
      <ModuleHeader
        eyebrow="Module · Containers"
        title="Docker Desktop"
        description="A container-estate surface in the Racmond shell: engine stats, containers, images, volumes, networks and Compose projects. Lifecycle actions run against the local store; a real `docker` integration would replace the data source."
        actions={
          <Button
            variant={live ? "subtle" : "ghost"}
            onClick={() => setLive((v) => !v)}
          >
            <span
              className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400" : "bg-slate-400"}`}
            />
            {live ? "Live stats" : "Stats paused"}
          </Button>
        }
      />

      {/* Engine header */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-sky-500/25 to-blue-600/25 text-sky-400 border border-sky-500/30">
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
                <rect x="2.5" y="6.5" width="15" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
                <path d="M6 6.5v7M10 6.5v7M14 6.5v7" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
                <path d="M5 4.2h10l-1.6 2.3H6.6L5 4.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <p className="text-[14px] font-semibold text-[var(--text-primary)]">
                {store.engine.name}
              </p>
              <p className="text-[11.5px] text-[var(--text-muted)]">
                v{store.engine.version} · {store.engine.os} · {counts.running}/{counts.containers} running
              </p>
            </div>
          </div>
          <Badge tone="emerald">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Engine running
          </Badge>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "CPU", value: `${store.engine.cpuPct.toFixed(0)}%`, tone: "text-sky-400" },
            { label: "Memory", value: `${store.engine.memPct.toFixed(0)}%`, tone: "text-violet-400" },
            { label: "Memory used", value: `${(store.engine.memUsedMb / 1024).toFixed(1)} GB`, tone: "text-fuchsia-400" },
            { label: "IO read / write", value: `${store.engine.ioReadMb.toFixed(1)} / ${store.engine.ioWriteMb.toFixed(1)} MB`, tone: "text-emerald-400" },
            { label: "Networks", value: String(counts.networks), tone: "text-amber-400" },
          ].map((s) => (
            <div key={s.label} className="glass-input rounded-xl p-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                {s.label}
              </p>
              <p className={`mt-1 text-[15px] font-bold ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 glass-input rounded-xl p-3">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>CPU activity</span>
            <span className="font-mono">{store.engine.cpuPct.toFixed(1)}%</span>
          </div>
          <Spark value={store.engine.cpuPct} />
        </div>
      </div>

      {/* Tabs */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-[var(--glass-divider)] p-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-3.5 py-1.5 text-[12.5px] font-medium transition ${
                tab === t.key
                  ? "bg-gradient-to-r from-sky-600/25 to-blue-600/20 text-sky-700 dark:text-sky-200 border border-sky-500/40"
                  : "text-[var(--text-muted)] hover:bg-[var(--glass-card-hover)] hover:text-[var(--text-primary)] border border-transparent"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-[10.5px] opacity-70">
                {counts[t.key === "containers" ? "containers" : t.key]}
              </span>
            </button>
          ))}
        </div>

        {tab === "containers" ? (
          <div className="overflow-x-auto thin-scroll">
            <table className="w-full min-w-[820px] text-left text-[12.5px]">
              <thead className="text-[10.5px] uppercase tracking-wider text-[var(--text-subtle)]">
                <tr className="border-b border-[var(--glass-divider)]">
                  {["Container", "Image", "Status", "Ports", "CPU", "Memory", "Uptime", "Actions"].map(
                    (h) => (
                      <th key={h} className="px-3.5 py-2.5 font-semibold">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {store.containers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[var(--glass-divider)] last:border-0"
                  >
                    <td className="px-3.5 py-3">
                      <button
                        type="button"
                        onClick={() => setSelected(c)}
                        className="flex items-center gap-2 text-left"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: statusDot(c.status) }}
                        />
                        <span className="font-semibold text-[var(--text-primary)]">
                          {c.name}
                        </span>
                      </button>
                    </td>
                    <td className="px-3.5 py-3 font-mono text-[11.5px] text-[var(--text-muted)]">
                      {c.image}
                    </td>
                    <td className="px-3.5 py-3">
                      <span
                        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${CONTAINER_STATUS_TONE[c.status]}`}
                      >
                        {c.state}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 font-mono text-[11.5px] text-[var(--text-muted)]">
                      {c.ports.length ? c.ports.join(", ") : "—"}
                    </td>
                    <td className="px-3.5 py-3 font-mono text-[11.5px]">{c.cpu.toFixed(1)}%</td>
                    <td className="px-3.5 py-3 font-mono text-[11.5px]">{c.memMb} MB</td>
                    <td className="px-3.5 py-3 font-mono text-[11.5px] text-[var(--text-muted)]">{c.uptime}</td>
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-1">
                        {c.status === "running" ? (
                          <button onClick={() => act(c.id, "paused")} className="action-btn">Stop</button>
                        ) : (
                          <button onClick={() => act(c.id, "running")} className="action-btn">Start</button>
                        )}
                        <button onClick={() => act(c.id, "restarting")} className="action-btn">Restart</button>
                        <button onClick={() => remove(c.id)} className="action-btn-danger">Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "images" ? (
          <div className="overflow-x-auto thin-scroll">
            <table className="w-full min-w-[680px] text-left text-[12.5px]">
              <thead className="text-[10.5px] uppercase tracking-wider text-[var(--text-subtle)]">
                <tr className="border-b border-[var(--glass-divider)]">
                  {["Repository", "Tag", "Size", "Created", "Containers", "Status"].map((h) => (
                    <th key={h} className="px-3.5 py-2.5 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {store.images.map((im) => (
                  <tr key={im.id} className="border-b border-[var(--glass-divider)] last:border-0">
                    <td className="px-3.5 py-3 font-mono text-[11.5px] text-sky-300">{im.repo}</td>
                    <td className="px-3.5 py-3 font-mono text-[11.5px] text-[var(--text-muted)]">{im.tag}</td>
                    <td className="px-3.5 py-3 font-mono text-[11.5px]">{im.sizeMb} MB</td>
                    <td className="px-3.5 py-3 text-[var(--text-muted)]">{im.created}</td>
                    <td className="px-3.5 py-3 font-mono text-[11.5px]">{im.containers}</td>
                    <td className="px-3.5 py-3">
                      {im.dangling ? (
                        <Badge tone="amber">dangling</Badge>
                      ) : (
                        <Badge tone="emerald">available</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "volumes" ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {store.volumes.map((v) => (
              <div key={v.name} className="glass-card-interactive rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[12.5px] font-semibold text-[var(--text-primary)]">
                    {v.name}
                  </p>
                  <Badge tone="slate">{v.driver}</Badge>
                </div>
                <p className="mt-2 text-[11.5px] text-[var(--text-muted)]">
                  {(v.sizeMb / 1024).toFixed(1)} GB · {v.inUse} containers
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {tab === "networks" ? (
          <div className="overflow-x-auto thin-scroll">
            <table className="w-full min-w-[560px] text-left text-[12.5px]">
              <thead className="text-[10.5px] uppercase tracking-wider text-[var(--text-subtle)]">
                <tr className="border-b border-[var(--glass-divider)]">
                  {["Network", "Driver", "Scope", "Containers"].map((h) => (
                    <th key={h} className="px-3.5 py-2.5 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {store.networks.map((n) => (
                  <tr key={n.name} className="border-b border-[var(--glass-divider)] last:border-0">
                    <td className="px-3.5 py-3 font-mono text-[11.5px] text-sky-300">{n.name}</td>
                    <td className="px-3.5 py-3 text-[var(--text-muted)]">{n.driver}</td>
                    <td className="px-3.5 py-3 text-[var(--text-muted)]">{n.scope}</td>
                    <td className="px-3.5 py-3 font-mono text-[11.5px]">{n.containers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "compose" ? (
          <div className="space-y-3 p-4">
            {store.compose.map((p) => (
              <ComposeCard
                key={p.name}
                project={p}
                onUp={() => projectAct(p.name, "up")}
                onDown={() => projectAct(p.name, "down")}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Selected container detail */}
      {selected ? (
        <div className="glass-panel-strong fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l fade-in">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--glass-divider)] p-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{selected.name}</h2>
              <p className="font-mono text-[11.5px] text-[var(--text-muted)]">{selected.image}</p>
            </div>
            <button onClick={() => setSelected(null)} className="action-icon" aria-label="Close">✕</button>
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
            <DetailRow label="Status" value={selected.state} />
            <DetailRow label="Command" value={<code className="text-[11.5px]">{selected.command}</code>} />
            <DetailRow label="Ports" value={selected.ports.join(", ") || "—"} />
            <DetailRow label="CPU" value={`${selected.cpu.toFixed(1)}%`} />
            <DetailRow label="Memory" value={`${selected.memMb} MB`} />
            <DetailRow label="Uptime" value={selected.uptime} />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Equivalent CLI</p>
            <code className="glass-input block rounded-xl p-3 font-mono text-[11.5px] text-sky-300">
              {`docker inspect -f '{{.State.Status}}' ${selected.name}`}
            </code>
          </div>
          <div className="flex gap-2 border-t border-[var(--glass-divider)] p-3">
            {selected.status === "running" ? (
              <Button className="flex-1" onClick={() => act(selected.id, "paused")}>Stop</Button>
            ) : (
              <Button className="flex-1" onClick={() => act(selected.id, "running")}>Start</Button>
            )}
            <Button variant="ghost" onClick={() => act(selected.id, "restarting")}>Restart</Button>
            <Button variant="danger" onClick={() => remove(selected.id)}>Remove</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ComposeCard({
  project,
  onUp,
  onDown,
}: {
  project: ComposeProject;
  onUp: () => void;
  onDown: () => void;
}) {
  const tone =
    project.status === "running"
      ? "text-emerald-400"
      : project.status === "starting"
        ? "text-fuchsia-400"
        : "text-slate-400";
  return (
    <div className="glass-card-interactive rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13.5px] font-semibold text-[var(--text-primary)]">{project.name}</p>
          <p className="font-mono text-[11px] text-[var(--text-muted)]">{project.path}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[12px] font-semibold ${tone}`}>{project.status}</span>
          <Button className="!py-1 !px-2.5 !text-[11.5px]" onClick={onUp}>Up</Button>
          <Button variant="ghost" className="!py-1 !px-2.5 !text-[11.5px]" onClick={onDown}>Down</Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {project.services.map((s) => (
          <span
            key={s.name}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${
              s.status === "running"
                ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
                : "border-slate-500/30 bg-slate-500/12 text-slate-600 dark:text-slate-300"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${s.status === "running" ? "bg-emerald-400" : "bg-slate-400"}`} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--glass-divider)] py-2 last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
      <span className="text-right text-[12.5px] font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
