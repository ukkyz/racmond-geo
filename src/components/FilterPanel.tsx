"use client";

import { useMemo } from "react";
import type { Filters, ReferenceData, ServerDTO } from "@/lib/types";
import { EMPTY_FILTERS } from "@/lib/types";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

function Section({
  title,
  children,
  count,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--glass-divider)] px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-subtle)]">
          {title}
        </span>
        {count > 0 ? (
          <span className="rounded-md border border-purple-500/30 bg-purple-500/18 px-1.5 text-[10px] font-semibold text-purple-700 dark:text-purple-200">
            {count}
          </span>
        ) : null}
      </div>
      <div className="thin-scroll max-h-40 space-y-1 overflow-y-auto pr-1">
        {children}
      </div>
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  swatch,
  meta,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  swatch?: string;
  meta?: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition ${
        checked
          ? "bg-purple-500/12 text-[var(--text-primary)] font-medium"
          : "text-[var(--text-secondary)] hover:bg-[var(--glass-card-hover)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span
        className={`grid h-3.5 w-3.5 flex-none place-items-center rounded border transition ${
          checked
            ? "border-purple-400 bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-sm shadow-purple-500/35"
            : "border-[var(--glass-border-strong)] bg-[var(--glass-input)]"
        }`}
      >
        {checked ? (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
            <path
              d="M2.5 6.2 4.8 8.5 9.5 3.8"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      {swatch ? (
        <span
          className="h-2 w-2 flex-none rounded-full"
          style={{ background: swatch }}
        />
      ) : null}
      <span className="truncate">{label}</span>
      {meta ? (
        <span className="ml-auto flex-none text-[10px] text-[var(--text-subtle)]">
          {meta}
        </span>
      ) : null}
    </button>
  );
}

export default function FilterPanel({
  filters,
  setFilters,
  reference,
  servers,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  reference: ReferenceData;
  servers: ServerDTO[];
}) {
  const distinctProjects = useMemo(() => {
    const map = new Map<string, number>();
    servers.forEach((s) => {
      if (s.project) map.set(s.project, (map.get(s.project) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [servers]);

  const distinctTags = useMemo(() => {
    const map = new Map<string, number>();
    servers.forEach((s) => {
      if (s.tag) map.set(s.tag, (map.get(s.tag) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [servers]);

  const countsByOrg = useMemo(() => {
    const m = new Map<number, number>();
    servers.forEach((s) =>
      m.set(s.organizationId, (m.get(s.organizationId) ?? 0) + 1),
    );
    return m;
  }, [servers]);

  const countsByLoc = useMemo(() => {
    const m = new Map<number, number>();
    servers.forEach((s) => {
      const key = s.locationId ?? -1;
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return m;
  }, [servers]);

  const unassigned = countsByLoc.get(-1) ?? 0;
  const activeCount =
    filters.organizationIds.length +
    filters.locationIds.length +
    filters.projects.length +
    filters.tags.length +
    filters.assetTypes.length +
    (filters.status ? 1 : 0) +
    (filters.query.trim() ? 1 : 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--glass-divider)] p-3">
        <input
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          placeholder="Search host, org, IP…"
          className="glass-input w-full rounded-xl px-3 py-2 text-[13px] outline-none"
        />
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={() => setFilters({ ...EMPTY_FILTERS })}
            className="glass-card-interactive mt-2 w-full rounded-xl py-1.5 text-[12px] font-medium text-[var(--accent-text)]"
          >
            Clear {activeCount} filter{activeCount > 1 ? "s" : ""}
          </button>
        ) : null}
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        <Section title="Asset Type" count={filters.assetTypes.length}>
          {(["physical", "virtual"] as const).map((t) => (
            <CheckRow
              key={t}
              checked={filters.assetTypes.includes(t)}
              onChange={() =>
                setFilters({
                  ...filters,
                  assetTypes: toggle(filters.assetTypes, t),
                })
              }
              label={t === "physical" ? "Physical (owned)" : "Virtual (rented)"}
              meta={String(servers.filter((s) => s.assetType === t).length)}
              swatch={t === "physical" ? "#8b5cf6" : "#d946ef"}
            />
          ))}
        </Section>

        <Section title="Organization" count={filters.organizationIds.length}>
          {reference.organizations.map((o) => (
            <CheckRow
              key={o.id}
              checked={filters.organizationIds.includes(o.id)}
              onChange={() =>
                setFilters({
                  ...filters,
                  organizationIds: toggle(filters.organizationIds, o.id),
                })
              }
              label={o.name}
              meta={String(countsByOrg.get(o.id) ?? 0)}
            />
          ))}
        </Section>

        <Section title="Location" count={filters.locationIds.length}>
          {reference.locations.map((l) => (
            <CheckRow
              key={l.id}
              checked={filters.locationIds.includes(l.id)}
              onChange={() =>
                setFilters({
                  ...filters,
                  locationIds: toggle(filters.locationIds, l.id),
                })
              }
              label={l.name}
              meta={String(countsByLoc.get(l.id) ?? 0)}
            />
          ))}
          {unassigned > 0 ? (
            <CheckRow
              checked={filters.locationIds.includes(-1)}
              onChange={() =>
                setFilters({
                  ...filters,
                  locationIds: toggle(filters.locationIds, -1),
                })
              }
              label="Unassigned site"
              meta={String(unassigned)}
            />
          ) : null}
        </Section>

        <Section title="Project" count={filters.projects.length}>
          {distinctProjects.length === 0 ? (
            <p className="px-1.5 py-1 text-[11.5px] text-[var(--text-subtle)]">
              No project values yet.
            </p>
          ) : (
            distinctProjects.map(([name, count]) => (
              <CheckRow
                key={name}
                checked={filters.projects.includes(name)}
                onChange={() =>
                  setFilters({
                    ...filters,
                    projects: toggle(filters.projects, name),
                  })
                }
                label={name}
                meta={String(count)}
              />
            ))
          )}
        </Section>

        <Section title="Tag" count={filters.tags.length}>
          {distinctTags.length === 0 ? (
            <p className="px-1.5 py-1 text-[11.5px] text-[var(--text-subtle)]">
              No tags yet.
            </p>
          ) : (
            distinctTags.map(([name, count]) => (
              <CheckRow
                key={name}
                checked={filters.tags.includes(name)}
                onChange={() =>
                  setFilters({ ...filters, tags: toggle(filters.tags, name) })
                }
                label={name}
                meta={String(count)}
              />
            ))
          )}
        </Section>

        <Section title="Status" count={filters.status ? 1 : 0}>
          {(["online", "warning", "offline", "maintenance"] as const).map(
            (s) => (
              <CheckRow
                key={s}
                checked={filters.status === s}
                onChange={() =>
                  setFilters({
                    ...filters,
                    status: filters.status === s ? null : s,
                  })
                }
                label={s.charAt(0).toUpperCase() + s.slice(1)}
                meta={String(servers.filter((x) => x.status === s).length)}
                swatch={
                  s === "online"
                    ? "#10b981"
                    : s === "warning"
                      ? "#f59e0b"
                      : s === "offline"
                        ? "#ef4444"
                        : "#a855f7"
                }
              />
            ),
          )}
        </Section>
      </div>
    </div>
  );
}
