"use client";

import { useState } from "react";
import {
  Button,
  Field,
  Input,
  SectionTitle,
  Select,
  Spinner,
} from "@/components/ui";
import { useInventory } from "@/components/InventoryProvider";

interface LookupForm {
  organizationName: string;
  organizationCode: string;
  locationName: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
  projectName: string;
  tagName: string;
}

const BLANK: LookupForm = {
  organizationName: "",
  organizationCode: "",
  locationName: "",
  city: "",
  country: "",
  latitude: "",
  longitude: "",
  projectName: "",
  tagName: "",
};

const TABS = [
  { key: "organization", label: "Organizations" },
  { key: "location", label: "Locations" },
  { key: "reference", label: "Projects & Tags" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AdminPanel() {
  const { reference, refresh, loading, stats } = useInventory();
  const [tab, setTab] = useState<TabKey>("organization");
  const [form, setForm] = useState<LookupForm>(BLANK);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);

  const set = <K extends keyof LookupForm>(k: K, v: LookupForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setMessage(null);
  };

  const canSubmit =
    tab === "organization"
      ? form.organizationName.trim().length > 0
      : tab === "location"
        ? form.locationName.trim().length > 0 &&
          form.latitude.trim() !== "" &&
          form.longitude.trim() !== ""
        : form.projectName.trim().length > 0 || form.tagName.trim().length > 0;

  const submit = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {};
      if (tab === "organization") {
        payload.organizationName = form.organizationName;
        payload.organizationCode = form.organizationCode;
      } else if (tab === "location") {
        payload.locationName = form.locationName;
        payload.city = form.city;
        payload.country = form.country;
        payload.latitude = form.latitude;
        payload.longitude = form.longitude;
      } else {
        payload.projectName = form.projectName;
        payload.tagName = form.tagName;
      }

      const res = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        errors?: string[];
        error?: string;
        created?: { entity: string }[];
      };

      if (!res.ok) {
        const errs =
          data.errors ?? (data.error ? [data.error] : ["Request failed"]);
        setMessage({ tone: "err", text: errs.join(" · ") });
        return;
      }

      const count = data.created?.length ?? 0;
      setMessage({
        tone: "ok",
        text: `Saved ${count} ${count === 1 ? "entry" : "entries"}.`,
      });
      setForm(BLANK);
      await refresh();
    } catch {
      setMessage({ tone: "err", text: "Network error while saving." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading admin data…" />
      </div>
    );
  }

  return (
    <div className="thin-scroll h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            Admin panel
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
            Manage the lookup data that powers asset ownership, geo filtering
            and dashboard filtering.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Organizations", value: stats?.organizations ?? 0 },
            { label: "Data center sites", value: stats?.locations ?? 0 },
            { label: "Projects", value: stats?.projects ?? 0 },
            { label: "Tags", value: stats?.tags ?? 0 },
          ].map((s) => (
            <div key={s.label} className="glass-card rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                {s.label}
              </p>
              <p className="mt-1 bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-2xl font-bold text-transparent dark:from-violet-300 dark:to-fuchsia-300">
                {s.value}
              </p>
            </div>
          ))}
        </div>

        <div className="glass-card rounded-2xl">
          <div className="flex flex-wrap gap-1 border-b border-[var(--glass-divider)] p-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTab(t.key);
                  setMessage(null);
                }}
                className={`rounded-xl px-3.5 py-1.5 text-[12.5px] font-medium transition ${
                  tab === t.key
                    ? "bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 text-purple-700 dark:text-purple-200 border border-purple-500/35"
                    : "text-[var(--text-muted)] hover:bg-[var(--glass-card-hover)] hover:text-[var(--text-primary)] border border-transparent"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {message ? (
              <div
                className={`mb-3 rounded-xl border p-2.5 text-[12px] font-medium ${
                  message.tone === "ok"
                    ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-200"
                    : "border-rose-500/40 bg-rose-500/12 text-rose-700 dark:text-rose-200"
                }`}
              >
                {message.text}
              </div>
            ) : null}

            {tab === "organization" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Organization name" required>
                  <Input
                    value={form.organizationName}
                    onChange={(e) => set("organizationName", e.target.value)}
                    placeholder="Northwind Retail"
                  />
                </Field>
                <Field
                  label="Short code"
                  hint="Optional prefix used in hostnames."
                >
                  <Input
                    value={form.organizationCode}
                    onChange={(e) => set("organizationCode", e.target.value)}
                    placeholder="NWR"
                  />
                </Field>
              </div>
            ) : tab === "location" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Site name" required>
                  <Input
                    value={form.locationName}
                    onChange={(e) => set("locationName", e.target.value)}
                    placeholder="Equinix DC2"
                  />
                </Field>
                <Field label="City">
                  <Input
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                    placeholder="Ashburn"
                  />
                </Field>
                <Field label="Country">
                  <Input
                    value={form.country}
                    onChange={(e) => set("country", e.target.value)}
                    placeholder="United States"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Latitude" required>
                    <Input
                      value={form.latitude}
                      onChange={(e) => set("latitude", e.target.value)}
                      placeholder="39.0907"
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Longitude" required>
                    <Input
                      value={form.longitude}
                      onChange={(e) => set("longitude", e.target.value)}
                      placeholder="-77.4599"
                      inputMode="decimal"
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Project name"
                  hint="Optional on assets — saved here for reuse."
                >
                  <Input
                    value={form.projectName}
                    onChange={(e) => set("projectName", e.target.value)}
                    placeholder="Project Atlas"
                  />
                </Field>
                <Field label="Tag">
                  <Input
                    value={form.tagName}
                    onChange={(e) => set("tagName", e.target.value)}
                    placeholder="production"
                  />
                </Field>
              </div>
            )}

            <div className="mt-4">
              <Button onClick={submit} disabled={!canSubmit || saving}>
                {saving ? "Saving…" : "Save entry"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="glass-card rounded-2xl p-4">
            <SectionTitle hint={`${reference.organizations.length} rows`}>
              Organizations
            </SectionTitle>
            <ul className="mt-3 space-y-1.5">
              {reference.organizations.map((o) => (
                <li
                  key={o.id}
                  className="glass-card-interactive flex items-center justify-between rounded-xl px-3 py-2 text-[12.5px]"
                >
                  <span className="font-medium text-[var(--text-primary)]">
                    {o.name}
                  </span>
                  <span className="rounded-md bg-purple-500/12 px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent-text)]">
                    {o.code ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <SectionTitle hint={`${reference.locations.length} rows`}>
              Locations
            </SectionTitle>
            <ul className="thin-scroll mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {reference.locations.map((l) => (
                <li
                  key={l.id}
                  className="glass-card-interactive rounded-xl px-3 py-2 text-[12.5px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[var(--text-primary)]">
                      {l.name}
                    </span>
                    <span className="text-[11px] text-[var(--text-subtle)]">
                      {l.latitude.toFixed(3)}, {l.longitude.toFixed(3)}
                    </span>
                  </div>
                  {(l.city || l.country) && (
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {[l.city, l.country].filter(Boolean).join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export { Select };
