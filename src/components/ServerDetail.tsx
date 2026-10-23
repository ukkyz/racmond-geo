"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import { useInventory } from "@/components/InventoryProvider";
import { ASSET_TYPE_LABEL, STATUS_LABEL, type ServerDTO } from "@/lib/types";

const STATUS_TONE: Record<string, "emerald" | "amber" | "rose" | "violet"> = {
  online: "emerald",
  warning: "amber",
  offline: "rose",
  maintenance: "violet",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--glass-divider)] py-2.5 last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
        {label}
      </span>
      <span className="text-right text-[12.5px] font-medium text-[var(--text-primary)]">
        {value}
      </span>
    </div>
  );
}

export default function ServerDetail({
  server,
  onClose,
  onEdit,
}: {
  server: ServerDTO | null;
  onClose: () => void;
  onEdit: (s: ServerDTO) => void;
}) {
  const { deleteServer, saving } = useInventory();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!server) return null;

  const remove = async () => {
    const errors = await deleteServer(server.id);
    if (errors.length) {
      setError(errors.join(" · "));
      return;
    }
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 backdrop-blur-[4px] fade-in"
        style={{ background: "var(--overlay-backdrop)" }}
        onClick={onClose}
        aria-hidden
      />
      <aside className="glass-panel-strong fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l fade-in">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--glass-divider)] p-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
              {server.hostname}
            </h2>
            <p className="truncate text-[12px] text-[var(--text-muted)]">
              {server.organizationName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="glass-card-interactive rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close details"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex flex-wrap gap-1.5">
            <Badge
              tone={server.assetType === "physical" ? "violet" : "fuchsia"}
            >
              {ASSET_TYPE_LABEL[server.assetType]}
            </Badge>
            <Badge tone={STATUS_TONE[server.status] ?? "slate"}>
              {STATUS_LABEL[server.status] ?? server.status}
            </Badge>
            {server.project ? (
              <Badge tone="slate">{server.project}</Badge>
            ) : null}
            {server.tag ? <Badge tone="slate">#{server.tag}</Badge> : null}
          </div>

          <div className="glass-card rounded-2xl px-3.5 py-1.5">
            <Row
              label="Organization"
              value={
                <>
                  {server.organizationName}
                  {server.organizationCode ? (
                    <span className="ml-1 text-[var(--text-subtle)]">
                      ({server.organizationCode})
                    </span>
                  ) : null}
                </>
              }
            />
            <Row label="Asset type" value={ASSET_TYPE_LABEL[server.assetType]} />
            <Row
              label="Ownership"
              value={
                server.assetType === "physical"
                  ? "Owned by organization"
                  : `Rented${server.provider ? ` from ${server.provider}` : ""}`
              }
            />
            <Row
              label="Geo location"
              value={
                <>
                  {server.latitude.toFixed(5)}, {server.longitude.toFixed(5)}
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${server.latitude}&mlon=${server.longitude}#map=13/${server.latitude}/${server.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 text-[var(--accent)] hover:underline"
                  >
                    ↗
                  </a>
                </>
              }
            />
            <Row
              label="Site"
              value={
                [
                  server.locationName ?? server.locationLabel,
                  server.city,
                  server.country,
                ]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
            <Row label="Rack / label" value={server.locationLabel ?? "—"} />
            <Row label="Project" value={server.project ?? "—"} />
            <Row label="Tag" value={server.tag ?? "—"} />
            <Row label="IP address" value={server.ipAddress ?? "—"} />
            <Row label="Provider" value={server.provider ?? "—"} />
            <Row
              label="Capacity"
              value={
                server.cpuCores || server.memoryGb
                  ? `${server.cpuCores ?? "?"} vCPU · ${server.memoryGb ?? "?"} GB RAM`
                  : "—"
              }
            />
            <Row
              label="Last seen"
              value={new Date(server.lastSeenAt).toLocaleString()}
            />
            <Row
              label="Updated"
              value={new Date(server.updatedAt).toLocaleString()}
            />
          </div>

          {server.notes ? (
            <div className="mt-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Notes
              </p>
              <p className="glass-card rounded-xl p-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                {server.notes}
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/12 p-2.5 text-[12px] text-rose-600 dark:text-rose-200">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-[var(--glass-divider)] p-3">
          <Button className="flex-1" onClick={() => onEdit(server)}>
            Edit asset
          </Button>
          {confirming ? (
            <>
              <Button variant="danger" disabled={saving} onClick={remove}>
                {saving ? "…" : "Confirm"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          )}
        </div>
      </aside>
    </>
  );
}
