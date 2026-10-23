"use client";

import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { useInventory } from "@/components/InventoryProvider";
import {
  ASSET_TYPES,
  type AssetType,
  type ServerDTO,
  type ServerInput,
} from "@/lib/types";

function ClickCapture({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    },
  });
  return null;
}

const pickIcon = L.divIcon({
  className: "srv-marker",
  html: `<div class="srv-pin" style="background:linear-gradient(135deg,#a855f7,#d946ef)"><span>+</span></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 28],
});

interface FormState {
  hostname: string;
  organizationId: string;
  assetType: AssetType;
  latitude: string;
  longitude: string;
  locationId: string;
  locationLabel: string;
  project: string;
  tag: string;
  ipAddress: string;
  provider: string;
  cpuCores: string;
  memoryGb: string;
  status: string;
  notes: string;
}

function initialState(server?: ServerDTO | null): FormState {
  return {
    hostname: server?.hostname ?? "",
    organizationId: server ? String(server.organizationId) : "",
    assetType: server?.assetType ?? "physical",
    latitude: server ? String(server.latitude) : "",
    longitude: server ? String(server.longitude) : "",
    locationId: server?.locationId ? String(server.locationId) : "",
    locationLabel: server?.locationLabel ?? "",
    project: server?.project ?? "",
    tag: server?.tag ?? "",
    ipAddress: server?.ipAddress ?? "",
    provider: server?.provider ?? "",
    cpuCores: server?.cpuCores ? String(server.cpuCores) : "",
    memoryGb: server?.memoryGb ? String(server.memoryGb) : "",
    status: server?.status ?? "online",
    notes: server?.notes ?? "",
  };
}

export default function ServerForm({
  server,
  onCancel,
  onSaved,
}: {
  server?: ServerDTO | null;
  onCancel: () => void;
  onSaved: (id: number) => void;
}) {
  const { reference, createServer, updateServer, saving } = useInventory();
  const [form, setForm] = useState<FormState>(() => initialState(server));
  const [errors, setErrors] = useState<string[]>([]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const lat = Number(form.latitude);
  const lng = Number(form.longitude);
  const hasCoords =
    form.latitude !== "" &&
    form.longitude !== "" &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng);

  const mapCenter = useMemo<[number, number]>(() => {
    if (hasCoords) return [lat, lng];
    if (server?.city) return [lat || 20, lng || 0];
    return [20, 0];
  }, [hasCoords, lat, lng, server]);

  const applyLocation = (locationId: string) => {
    set("locationId", locationId);
    if (!locationId) return;
    const loc = reference.locations.find((l) => l.id === Number(locationId));
    if (loc) {
      set("latitude", String(loc.latitude));
      set("longitude", String(loc.longitude));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const localErrors: string[] = [];
    if (!form.hostname.trim()) localErrors.push("Hostname is required.");
    if (!form.organizationId)
      localErrors.push("Organization owner is required.");
    if (!hasCoords)
      localErrors.push("Geo location is required (latitude & longitude).");
    if (localErrors.length) {
      setErrors(localErrors);
      return;
    }

    const payload: ServerInput = {
      hostname: form.hostname.trim(),
      organizationId: Number(form.organizationId),
      latitude: lat,
      longitude: lng,
      assetType: form.assetType,
      project: form.project.trim() || null,
      tag: form.tag.trim() || null,
      locationId: form.locationId ? Number(form.locationId) : null,
      locationLabel: form.locationLabel.trim() || null,
      ipAddress: form.ipAddress.trim() || null,
      provider: form.provider.trim() || null,
      cpuCores: form.cpuCores ? Number(form.cpuCores) : null,
      memoryGb: form.memoryGb ? Number(form.memoryGb) : null,
      status: form.status,
      online: form.status !== "offline",
      notes: form.notes.trim() || null,
    };

    const res = server
      ? await updateServer(server.id, payload)
      : await createServer(payload);

    if (res.length) {
      setErrors(res);
      return;
    }
    setErrors([]);
    onSaved(server ? server.id : -1);
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="thin-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {errors.length ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/12 p-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-300">
              Fix the following
            </p>
            <ul className="list-inside list-disc space-y-0.5 text-[12px] text-rose-700 dark:text-rose-200">
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <Field label="Hostname" required>
          <Input
            value={form.hostname}
            onChange={(e) => set("hostname", e.target.value)}
            placeholder="nwr-node-001"
          />
        </Field>

        <Field
          label="Organization owner"
          required
          hint="The company that owns (physical) or rents (virtual) this asset."
        >
          <Select
            value={form.organizationId}
            onChange={(e) => set("organizationId", e.target.value)}
          >
            <option value="">Select organization…</option>
            {reference.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Asset type <span className="text-rose-500">*</span>
          </span>
          <div className="grid grid-cols-2 gap-2">
            {ASSET_TYPES.map((t) => {
              const active = form.assetType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set("assetType", t.value)}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    active
                      ? "border-purple-500 bg-purple-500/15 shadow-sm shadow-purple-500/20"
                      : "glass-card-interactive"
                  }`}
                >
                  <span
                    className={`block text-[13px] font-semibold ${
                      active
                        ? "text-purple-700 dark:text-purple-200"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {t.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[var(--text-subtle)]">
                    {t.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Field
          label="Project name"
          hint="Optional — groups assets under an initiative."
        >
          <Input
            value={form.project}
            list="project-options"
            onChange={(e) => set("project", e.target.value)}
            placeholder="Project Atlas"
          />
          <datalist id="project-options">
            {reference.projects.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </Field>

        <Field label="Tag" hint="Optional — e.g. production, edge, gpu.">
          <Input
            value={form.tag}
            list="tag-options"
            onChange={(e) => set("tag", e.target.value)}
            placeholder="production"
          />
          <datalist id="tag-options">
            {reference.tags.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </Field>

        <div className="glass-card rounded-2xl p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Geo location <span className="text-rose-500">*</span>
          </p>

          <Field label="Data center / site">
            <Select
              value={form.locationId}
              onChange={(e) => applyLocation(e.target.value)}
            >
              <option value="">Custom coordinates (click map)</option>
              {reference.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.city ? ` — ${l.city}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Latitude">
              <Input
                value={form.latitude}
                onChange={(e) => set("latitude", e.target.value)}
                placeholder="39.0438"
                inputMode="decimal"
              />
            </Field>
            <Field label="Longitude">
              <Input
                value={form.longitude}
                onChange={(e) => set("longitude", e.target.value)}
                placeholder="-77.4874"
                inputMode="decimal"
              />
            </Field>
          </div>

          <p className="mt-2 text-[11px] text-[var(--text-subtle)]">
            {hasCoords
              ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
              : "Enter coordinates or click the map to drop a pin."}
          </p>

          <div className="mt-2 h-44 overflow-hidden rounded-xl border border-[var(--glass-border)]">
            <MapContainer
              center={mapCenter}
              zoom={hasCoords ? 9 : 2}
              minZoom={1}
              className="h-full w-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
              {hasCoords ? (
                <Marker position={[lat, lng]} icon={pickIcon} />
              ) : null}
              <ClickCapture
                onPick={(la, ln) => {
                  set("latitude", String(la));
                  set("longitude", String(ln));
                  set("locationId", "");
                }}
              />
            </MapContainer>
          </div>
        </div>

        <Field label="Rack / label" hint="Optional site detail.">
          <Input
            value={form.locationLabel}
            onChange={(e) => set("locationLabel", e.target.value)}
            placeholder="Rack B14"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="IP address">
            <Input
              value={form.ipAddress}
              onChange={(e) => set("ipAddress", e.target.value)}
              placeholder="10.20.1.4"
            />
          </Field>
          <Field label="Provider">
            <Input
              value={form.provider}
              onChange={(e) => set("provider", e.target.value)}
              placeholder="AWS / On-Prem"
            />
          </Field>
          <Field label="CPU cores">
            <Input
              value={form.cpuCores}
              onChange={(e) => set("cpuCores", e.target.value)}
              inputMode="numeric"
              placeholder="32"
            />
          </Field>
          <Field label="Memory (GB)">
            <Input
              value={form.memoryGb}
              onChange={(e) => set("memoryGb", e.target.value)}
              inputMode="numeric"
              placeholder="128"
            />
          </Field>
        </div>

        <Field label="Status">
          <Select
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="online">Online</option>
            <option value="warning">Warning</option>
            <option value="offline">Offline</option>
            <option value="maintenance">Maintenance</option>
          </Select>
        </Field>

        <Field label="Notes">
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Ownership, contract, capacity notes…"
          />
        </Field>
      </div>

      <div className="flex gap-2 border-t border-[var(--glass-divider)] p-3">
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? "Saving…" : server ? "Save changes" : "Create asset"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
