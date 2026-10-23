"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  InventoryProvider,
  useInventory,
} from "@/components/InventoryProvider";
import { ThemeToggle } from "@/components/ThemeProvider";
import AdminPanel from "@/components/AdminPanel";
import FilterPanel from "@/components/FilterPanel";
import ServerDetail from "@/components/ServerDetail";
import { Badge, Button, Spinner } from "@/components/ui";
import {
  ASSET_TYPE_LABEL,
  EMPTY_FILTERS,
  matchesFilters,
  type Filters,
  type ServerDTO,
} from "@/lib/types";

// Leaflet touches `window`, so both map surfaces load client-side only.
const ServerMap = dynamic(() => import("@/components/ServerMap"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});
const TopologyView = dynamic(() => import("@/components/TopologyView"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});
// ServerForm embeds its own Leaflet map, so it must never evaluate on the server.
const ServerForm = dynamic(() => import("@/components/ServerForm"), {
  ssr: false,
  loading: () => (
    <div className="p-4">
      <Spinner label="Loading form…" />
    </div>
  ),
});

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--map-bg)]">
      <Spinner label="Loading map…" />
    </div>
  );
}

type View = "map" | "topology" | "admin";

const NAV: { key: View; label: string; icon: React.ReactNode }[] = [
  {
    key: "map",
    label: "Global Map",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <path
          d="M10 18s6-4.9 6-9a6 6 0 1 0-12 0c0 4.1 6 9 6 9Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="10" cy="9" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: "topology",
    label: "Asset Topology",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <rect
          x="2.5"
          y="3"
          width="5.5"
          height="4.5"
          rx="1.2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <rect
          x="12"
          y="12.5"
          width="5.5"
          height="4.5"
          rx="1.2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M8 5.2h2.5a1.5 1.5 0 0 1 1.5 1.5v8.1"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    ),
  },
  {
    key: "admin",
    label: "Admin Panel",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

function StatTile({
  label,
  value,
  tone = "slate",
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "slate" | "violet" | "fuchsia" | "emerald" | "amber" | "rose";
  active?: boolean;
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    slate: "text-[var(--text-primary)]",
    violet: "text-violet-700 dark:text-violet-300",
    fuchsia: "text-fuchsia-700 dark:text-fuchsia-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
    rose: "text-rose-700 dark:text-rose-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`pointer-events-auto min-w-[68px] rounded-xl px-3 py-2 text-left transition-all ${
        active
          ? "glass-pill border-purple-500 ring-2 ring-purple-500/30"
          : "glass-pill"
      } ${onClick ? "cursor-pointer hover:border-[var(--glass-border-strong)] hover:-translate-y-0.5" : "cursor-default"}`}
    >
      <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-bold leading-tight ${tones[tone]}`}>
        {value}
      </p>
    </button>
  );
}

function ServerRow({
  server,
  selected,
  onSelect,
  onEdit,
}: {
  server: ServerDTO;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const statusColor =
    server.status === "online"
      ? "#10b981"
      : server.status === "warning"
        ? "#f59e0b"
        : server.status === "offline"
          ? "#ef4444"
          : "#a855f7";
  return (
    <div
      onClick={onSelect}
      className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all ${
        selected
          ? "glass-card border-purple-500 bg-purple-500/14 ring-1 ring-purple-500/35"
          : "glass-card-interactive"
      }`}
    >
      <span
        className="h-2 w-2 flex-none rounded-full"
        style={{ background: statusColor }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium text-[var(--text-primary)]">
          {server.hostname}
        </p>
        <p className="truncate text-[11px] text-[var(--text-muted)]">
          {server.organizationName}
          {server.project ? ` · ${server.project}` : ""}
        </p>
      </div>
      <span
        className={`flex-none rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase ${
          server.assetType === "physical"
            ? "border-violet-500/30 bg-violet-500/18 text-violet-700 dark:text-violet-200"
            : "border-fuchsia-500/30 bg-fuchsia-500/18 text-fuchsia-700 dark:text-fuchsia-200"
        }`}
      >
        {server.assetType === "physical" ? "PHY" : "VIRT"}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="flex-none rounded-lg p-1 text-[var(--text-subtle)] transition hover:bg-purple-500/15 hover:text-[var(--accent)]"
        aria-label={`Edit ${server.hostname}`}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <path
            d="M11.5 2.5 13.5 4.5 5.5 12.5 2.5 13.5 3.5 10.5 11.5 2.5Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

function Dashboard() {
  const { servers, reference, stats, loading, error, refresh } = useInventory();
  const [view, setView] = useState<View>("map");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formMode, setFormMode] = useState<"closed" | "create" | "edit">(
    "closed",
  );
  const [editing, setEditing] = useState<ServerDTO | null>(null);

  const locationKey = useMemo(() => {
    return (s: ServerDTO) => String(s.locationId ?? -1);
  }, []);

  const filtered = useMemo(
    () => servers.filter((s) => matchesFilters(s, filters, locationKey)),
    [servers, filters, locationKey],
  );

  const selected = useMemo(
    () => servers.find((s) => s.id === selectedId) ?? null,
    [servers, selectedId],
  );

  const filteredStats = useMemo(() => {
    const physical = filtered.filter((s) => s.assetType === "physical").length;
    const online = filtered.filter((s) => s.status === "online").length;
    const offline = filtered.filter((s) => s.status === "offline").length;
    const warning = filtered.filter((s) => s.status === "warning").length;
    return {
      physical,
      virtual: filtered.length - physical,
      online,
      offline,
      warning,
    };
  }, [filtered]);

  const toggleAssetType = (t: "physical" | "virtual") =>
    setFilters((f) => ({
      ...f,
      assetTypes: f.assetTypes.includes(t)
        ? f.assetTypes.filter((x) => x !== t)
        : [...f.assetTypes, t],
    }));

  const openCreate = () => {
    setEditing(null);
    setFormMode("create");
    if (!sidebarOpen) setSidebarOpen(true);
  };

  const openEdit = (s: ServerDTO) => {
    setEditing(s);
    setFormMode("edit");
    if (!sidebarOpen) setSidebarOpen(true);
  };

  const closeForm = () => {
    setFormMode("closed");
    setEditing(null);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="glass-pill rounded-2xl px-6 py-4">
          <Spinner label="Connecting to inventory…" />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* ---------- Left admin navigation ---------- */}
      <nav
        className={`sidebar ${sidebarOpen ? "" : "sidebar-collapsed"}`}
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-3 border-b border-[var(--glass-divider)] px-4 py-4">
          <div className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-500 shadow-lg shadow-purple-500/35">
            <svg viewBox="0 0 20 20" className="h-4 w-4 text-white" fill="none">
              <rect
                x="3"
                y="3"
                width="14"
                height="5"
                rx="1.2"
                fill="currentColor"
              />
              <rect
                x="3"
                y="10"
                width="14"
                height="5"
                rx="1.2"
                fill="currentColor"
                opacity="0.72"
              />
              <circle cx="6" cy="5.5" r="0.9" fill="#2e1065" />
              <circle cx="6" cy="12.5" r="0.9" fill="#2e1065" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold tracking-tight text-[var(--text-primary)]">
              DC Monitor
            </p>
            <p className="truncate text-[11px] text-[var(--text-muted)]">
              Asset observability
            </p>
          </div>
        </div>

        <div className="sidebar-scroll thin-scroll">
          <p className="nav-section-label">Views</p>
          {NAV.map((item) => (
            <div
              key={item.key}
              className={`nav-item ${view === item.key ? "nav-item-active" : ""}`}
              onClick={() => setView(item.key)}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
              {item.key === "admin" ? (
                <span className="ml-auto rounded-md border border-purple-500/25 bg-purple-500/14 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-text)]">
                  admin
                </span>
              ) : null}
            </div>
          ))}

          <p className="nav-section-label">Inventory</p>
          <div
            className={`nav-item ${formMode === "create" ? "nav-item-active" : ""}`}
            onClick={openCreate}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
              <path
                d="M10 4.5v11M4.5 10h11"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <span>Add server asset</span>
          </div>

          {formMode !== "closed" ? (
            <div className="glass-card mx-3 mt-2 overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-[var(--glass-divider)] px-3.5 py-2.5">
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                  {formMode === "create" ? "New asset" : "Edit asset"}
                </span>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-md p-1 text-[var(--text-muted)] hover:bg-purple-500/15 hover:text-[var(--text-primary)]"
                  aria-label="Close form"
                >
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                    <path
                      d="M5 5l10 10M15 5L5 15"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex max-h-[calc(100vh-210px)] flex-col">
                <ServerForm
                  key={editing ? `edit-${editing.id}` : "create"}
                  server={editing}
                  onCancel={closeForm}
                  onSaved={() => {
                    closeForm();
                    void refresh();
                  }}
                />
              </div>
            </div>
          ) : null}

          <p className="nav-section-label">Platform</p>
          {[
            { href: "/console", label: "Overview" },
            { href: "/docker", label: "Docker Desktop" },
            { href: "/workflows", label: "Workflow builder" },
            { href: "/apm", label: "APM service map" },
            { href: "/cli", label: "Local CLI" },
            { href: "/agent", label: "AI Agent" },
            { href: "/architecture", label: "Architecture" },
          ].map((p) => (
            <Link key={p.href} href={p.href} className="nav-item">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                <path
                  d="M10 4.5v11M4.5 10h11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <span className="truncate">{p.label}</span>
            </Link>
          ))}

          <p className="nav-section-label">Legend</p>
          <div className="space-y-1.5 px-4 pb-2 text-[11.5px] text-[var(--text-muted)]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-violet-500 shadow-sm shadow-violet-500/40" />
              Physical — owned
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-fuchsia-500 shadow-sm shadow-fuchsia-500/40" />
              Virtual — rented
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Online
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              Warning
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              Offline
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--glass-divider)] p-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="glass-card-interactive flex w-full items-center justify-center gap-2 rounded-xl py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            {sidebarOpen ? "« Collapse sidebar" : "» Expand"}
          </button>
        </div>
      </nav>

      {/* ---------- Main content ---------- */}
      <div className="main-pane">
        <header className="glass-panel flex flex-none items-center gap-3 border-b px-4 py-2.5">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className={`glass-card-interactive rounded-xl p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] ${
              sidebarOpen ? "lg:hidden" : ""
            }`}
            aria-label="Toggle navigation"
            title={sidebarOpen ? "Hide navigation" : "Show navigation"}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
              <path
                d="M3 6h14M3 10h14M3 14h14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[14.5px] font-semibold text-[var(--text-primary)]">
              {view === "map"
                ? "Global server fleet map"
                : view === "topology"
                  ? "Asset topology"
                  : "Administration"}
            </h1>
            <p className="truncate text-[11px] text-[var(--text-muted)]">
              {view === "map"
                ? "OpenStreetMap · physical & virtual assets across all sites"
                : view === "topology"
                  ? "Organization → site → server graph"
                  : "Organizations, sites, projects and tags"}
            </p>
          </div>

          <div className="hidden items-center gap-1.5 md:flex">
            <Badge tone="violet">{filtered.length} shown</Badge>
            <Badge tone="slate">{stats?.total ?? 0} total</Badge>
          </div>

          <ThemeToggle />

          <Button onClick={openCreate} className="flex-none">
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
              <path
                d="M10 4.5v11M4.5 10h11"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="hidden sm:inline">Add asset</span>
          </Button>
        </header>

        {error ? (
          <div className="flex flex-none items-center gap-3 border-b border-rose-500/30 bg-rose-500/12 px-4 py-2 text-[12.5px] text-rose-700 dark:text-rose-200">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg border border-rose-400/40 px-2.5 py-0.5 text-[11px] font-medium hover:bg-rose-500/20"
            >
              Retry
            </button>
          </div>
        ) : null}

        {view === "admin" ? (
          <AdminPanel />
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* Filter column */}
            <aside className="glass-panel hidden w-64 flex-none border-r lg:flex lg:flex-col">
              <div className="flex items-center justify-between border-b border-[var(--glass-divider)] px-4 py-2.5">
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                  Filters
                </span>
                <button
                  type="button"
                  onClick={() => setFilters({ ...EMPTY_FILTERS })}
                  className="text-[11px] font-medium text-[var(--text-muted)] transition hover:text-[var(--accent)]"
                >
                  Reset
                </button>
              </div>
              <FilterPanel
                filters={filters}
                setFilters={setFilters}
                reference={reference}
                servers={servers}
              />
            </aside>

            {/* Map / graph */}
            <div className="relative min-w-0 flex-1">
              {view === "map" ? (
                <ServerMap
                  servers={filtered}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ) : (
                <TopologyView
                  servers={filtered}
                  selectedId={selectedId}
                  onOpen={(id) => {
                    setSelectedId(id);
                  }}
                />
              )}

              {/* Floating glass stat strip */}
              <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-wrap gap-2">
                <StatTile
                  label="Total"
                  value={filtered.length}
                  tone="slate"
                />
                <StatTile
                  label="Physical"
                  value={filteredStats.physical}
                  tone="violet"
                  active={filters.assetTypes.includes("physical")}
                  onClick={() => toggleAssetType("physical")}
                />
                <StatTile
                  label="Virtual"
                  value={filteredStats.virtual}
                  tone="fuchsia"
                  active={filters.assetTypes.includes("virtual")}
                  onClick={() => toggleAssetType("virtual")}
                />
                <StatTile
                  label="Online"
                  value={filteredStats.online}
                  tone="emerald"
                />
                <StatTile
                  label="Warning"
                  value={filteredStats.warning}
                  tone="amber"
                />
                <StatTile
                  label="Offline"
                  value={filteredStats.offline}
                  tone="rose"
                />
              </div>

              {/* Compact mobile filters */}
              <details className="absolute bottom-3 left-3 z-[500] lg:hidden">
                <summary className="glass-pill cursor-pointer list-none rounded-xl px-3.5 py-2 text-[12px] font-semibold text-[var(--text-primary)]">
                  Filters ({filtered.length})
                </summary>
                <div className="glass-panel-strong mt-2 max-h-[55vh] w-64 overflow-hidden rounded-2xl border">
                  <FilterPanel
                    filters={filters}
                    setFilters={setFilters}
                    reference={reference}
                    servers={servers}
                  />
                </div>
              </details>
            </div>

            {/* Result list */}
            <aside className="glass-panel hidden w-72 flex-none flex-col border-l xl:flex">
              <div className="border-b border-[var(--glass-divider)] px-3.5 py-2.5">
                <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                  Matched assets
                </p>
                <p className="text-[10.5px] text-[var(--text-muted)]">
                  {filtered.length} of {servers.length}
                </p>
              </div>
              <div className="thin-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
                {filtered.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[12px] text-[var(--text-subtle)]">
                    No assets match the current filters.
                  </p>
                ) : (
                  filtered.map((s) => (
                    <ServerRow
                      key={s.id}
                      server={s}
                      selected={s.id === selectedId}
                      onSelect={() => setSelectedId(s.id)}
                      onEdit={() => openEdit(s)}
                    />
                  ))
                )}
              </div>
            </aside>
          </div>
        )}
      </div>

      <ServerDetail
        server={selected}
        onClose={() => setSelectedId(null)}
        onEdit={openEdit}
      />
    </div>
  );
}

export default function Home() {
  return (
    <InventoryProvider>
      <Dashboard />
    </InventoryProvider>
  );
}

export { ASSET_TYPE_LABEL };
