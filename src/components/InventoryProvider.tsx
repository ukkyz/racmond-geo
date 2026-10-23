"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ReferenceData,
  ServerDTO,
  ServerInput,
} from "@/lib/types";
import type { DashboardStats } from "@/lib/data";

interface InventoryContextValue {
  servers: ServerDTO[];
  reference: ReferenceData;
  stats: DashboardStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createServer: (input: ServerInput) => Promise<string[]>;
  updateServer: (id: number, input: Partial<ServerInput>) => Promise<string[]>;
  deleteServer: (id: number) => Promise<string[]>;
  saving: boolean;
}

const EMPTY_REFERENCE: ReferenceData = {
  organizations: [],
  locations: [],
  projects: [],
  tags: [],
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

async function parseErrors(res: Response): Promise<string[]> {
  try {
    const data = (await res.json()) as { errors?: string[]; error?: string };
    if (Array.isArray(data.errors) && data.errors.length) return data.errors;
    if (data.error) return [data.error];
  } catch {
    /* ignore */
  }
  return [`Request failed (${res.status})`];
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState<ServerDTO[]>([]);
  const [reference, setReference] =
    useState<ReferenceData>(EMPTY_REFERENCE);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/servers", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load inventory (${res.status})`);
      const data = (await res.json()) as {
        servers: ServerDTO[];
        reference: ReferenceData;
        stats: DashboardStats;
      };
      setServers(data.servers);
      setReference(data.reference);
      setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createServer = useCallback(
    async (input: ServerInput) => {
      setSaving(true);
      try {
        const res = await fetch("/api/servers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) return await parseErrors(res);
        await refresh();
        return [];
      } catch (e) {
        return [e instanceof Error ? e.message : "Failed to create asset"];
      } finally {
        setSaving(false);
      }
    },
    [refresh],
  );

  const updateServer = useCallback(
    async (id: number, input: Partial<ServerInput>) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/servers/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) return await parseErrors(res);
        await refresh();
        return [];
      } catch (e) {
        return [e instanceof Error ? e.message : "Failed to update asset"];
      } finally {
        setSaving(false);
      }
    },
    [refresh],
  );

  const deleteServer = useCallback(
    async (id: number) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/servers/${id}`, { method: "DELETE" });
        if (!res.ok) return await parseErrors(res);
        await refresh();
        return [];
      } catch (e) {
        return [e instanceof Error ? e.message : "Failed to delete asset"];
      } finally {
        setSaving(false);
      }
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      servers,
      reference,
      stats,
      loading,
      error,
      refresh,
      createServer,
      updateServer,
      deleteServer,
      saving,
    }),
    [
      servers,
      reference,
      stats,
      loading,
      error,
      refresh,
      createServer,
      updateServer,
      deleteServer,
      saving,
    ],
  );

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) {
    throw new Error("useInventory must be used inside InventoryProvider");
  }
  return ctx;
}