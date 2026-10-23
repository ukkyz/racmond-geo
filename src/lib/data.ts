import { and, asc, desc, eq, sql, defineRelations } from "drizzle-orm";
import { db } from "@/db";
import {
  locations,
  organizations,
  projects,
  servers,
  tags,
  type AssetType,
  type Server,
} from "@/db/schema";
import type {
  LocationDTO,
  OrganizationDTO,
  ProjectDTO,
  ReferenceData,
  ServerDTO,
  TagDTO,
} from "@/lib/types";

const serverSelection = {
  id: servers.id,
  hostname: servers.hostname,
  organizationId: servers.organizationId,
  organizationName: organizations.name,
  organizationCode: organizations.code,
  latitude: servers.latitude,
  longitude: servers.longitude,
  assetType: servers.assetType,
  project: projects.name,
  tag: tags.name,
  locationId: servers.locationId,
  locationLabel: servers.locationLabel,
  locationName: locations.name,
  city: locations.city,
  country: locations.country,
  ipAddress: servers.ipAddress,
  provider: servers.provider,
  cpuCores: servers.cpuCores,
  memoryGb: servers.memoryGb,
  status: servers.status,
  online: servers.online,
  lastSeenAt: servers.lastSeenAt,
  notes: servers.notes,
  createdAt: servers.createdAt,
  updatedAt: servers.updatedAt,
};

type RawRow = {
  id: number;
  hostname: string;
  organizationId: number;
  organizationName: string | null;
  organizationCode: string | null;
  latitude: number;
  longitude: number;
  assetType: AssetType;
  project: string | null;
  tag: string | null;
  locationId: number | null;
  locationLabel: string | null;
  locationName: string | null;
  city: string | null;
  country: string | null;
  ipAddress: string | null;
  provider: string | null;
  cpuCores: number | null;
  memoryGb: number | null;
  status: string;
  online: boolean;
  lastSeenAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDTO(row: RawRow): ServerDTO {
  return {
    ...row,
    organizationName: row.organizationName ?? "Unknown",
    lastSeenAt: new Date(row.lastSeenAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export async function listServers(): Promise<ServerDTO[]> {
  const rows = await db
    .select(serverSelection)
    .from(servers)
    .leftJoin(organizations, eq(servers.organizationId, organizations.id))
    .leftJoin(locations, eq(servers.locationId, locations.id))
    .leftJoin(projects, eq(servers.projectId, projects.id))
    .leftJoin(tags, eq(servers.tagId, tags.id))
    .orderBy(asc(servers.hostname));

  return rows.map((r) => toDTO(r as RawRow));
}

export async function getServer(id: number): Promise<ServerDTO | null> {
  const rows = await db
    .select(serverSelection)
    .from(servers)
    .leftJoin(organizations, eq(servers.organizationId, organizations.id))
    .leftJoin(locations, eq(servers.locationId, locations.id))
    .leftJoin(projects, eq(servers.projectId, projects.id))
    .leftJoin(tags, eq(servers.tagId, tags.id))
    .where(eq(servers.id, id))
    .limit(1);
  return rows[0] ? toDTO(rows[0] as RawRow) : null;
}

export async function getReferenceData(): Promise<ReferenceData> {
  const [orgs, locs, projs, tgs] = await Promise.all([
    db.select().from(organizations).orderBy(asc(organizations.name)),
    db.select().from(locations).orderBy(asc(locations.name)),
    db.select().from(projects).orderBy(asc(projects.name)),
    db.select().from(tags).orderBy(asc(tags.name)),
  ]);

  return {
    organizations: orgs.map((o) => ({ id: o.id, name: o.name, code: o.code })),
    locations: locs.map(
      (l): LocationDTO => ({
        id: l.id,
        name: l.name,
        city: l.city,
        country: l.country,
        latitude: l.latitude,
        longitude: l.longitude,
      }),
    ),
    projects: projs.map(
      (p): ProjectDTO => ({
        id: p.id,
        name: p.name,
        description: p.description,
      }),
    ),
    tags: tgs.map((t): TagDTO => ({ id: t.id, name: t.name, color: t.color })),
  };
}

/** Ensures a free-text project/tag value exists in its lookup table. */
async function ensureProject(name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.name, trimmed))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const inserted = await db
    .insert(projects)
    .values({ name: trimmed })
    .onConflictDoNothing()
    .returning({ id: projects.id });
  if (inserted[0]) return inserted[0].id;
  const again = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.name, trimmed))
    .limit(1);
  return again[0]?.id ?? null;
}

async function ensureTag(name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.name, trimmed))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const inserted = await db
    .insert(tags)
    .values({ name: trimmed })
    .onConflictDoNothing()
    .returning({ id: tags.id });
  if (inserted[0]) return inserted[0].id;
  const again = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.name, trimmed))
    .limit(1);
  return again[0]?.id ?? null;
}

export interface ServerWriteValues {
  hostname: string;
  organizationId: number;
  latitude: number;
  longitude: number;
  assetType: AssetType;
  project?: string | null;
  tag?: string | null;
  locationId?: number | null;
  locationLabel?: string | null;
  ipAddress?: string | null;
  provider?: string | null;
  cpuCores?: number | null;
  memoryGb?: number | null;
  status?: string;
  online?: boolean;
  notes?: string | null;
}

export async function createServer(values: ServerWriteValues): Promise<Server> {
  const [projectId, tagId] = await Promise.all([
    ensureProject(values.project),
    ensureTag(values.tag),
  ]);

  const inserted = await db
    .insert(servers)
    .values({
      hostname: values.hostname.trim(),
      organizationId: values.organizationId,
      latitude: values.latitude,
      longitude: values.longitude,
      assetType: values.assetType,
      projectId,
      tagId,
      locationId: values.locationId ?? null,
      locationLabel: values.locationLabel?.trim() || null,
      ipAddress: values.ipAddress?.trim() || null,
      provider: values.provider?.trim() || null,
      cpuCores: values.cpuCores ?? null,
      memoryGb: values.memoryGb ?? null,
      status: values.status ?? "online",
      online: values.online ?? true,
      notes: values.notes?.trim() || null,
    })
    .returning();

  return inserted[0];
}

export async function updateServer(
  id: number,
  values: Partial<ServerWriteValues>,
): Promise<Server | null> {
  const patch: Partial<typeof servers.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (values.hostname !== undefined) patch.hostname = values.hostname.trim();
  if (values.organizationId !== undefined)
    patch.organizationId = values.organizationId;
  if (values.latitude !== undefined) patch.latitude = values.latitude;
  if (values.longitude !== undefined) patch.longitude = values.longitude;
  if (values.assetType !== undefined) patch.assetType = values.assetType;
  if (values.project !== undefined)
    patch.projectId = await ensureProject(values.project);
  if (values.tag !== undefined) patch.tagId = await ensureTag(values.tag);
  if (values.locationId !== undefined) patch.locationId = values.locationId;
  if (values.locationLabel !== undefined)
    patch.locationLabel = values.locationLabel?.trim() || null;
  if (values.ipAddress !== undefined)
    patch.ipAddress = values.ipAddress?.trim() || null;
  if (values.provider !== undefined)
    patch.provider = values.provider?.trim() || null;
  if (values.cpuCores !== undefined) patch.cpuCores = values.cpuCores;
  if (values.memoryGb !== undefined) patch.memoryGb = values.memoryGb;
  if (values.status !== undefined) patch.status = values.status;
  if (values.online !== undefined) patch.online = values.online;
  if (values.notes !== undefined) patch.notes = values.notes?.trim() || null;

  const updated = await db
    .update(servers)
    .set(patch)
    .where(eq(servers.id, id))
    .returning();

  return updated[0] ?? null;
}

export async function deleteServer(id: number): Promise<boolean> {
  const deleted = await db
    .delete(servers)
    .where(eq(servers.id, id))
    .returning({ id: servers.id });
  return deleted.length > 0;
}

export interface DashboardStats {
  total: number;
  physical: number;
  virtual: number;
  online: number;
  warning: number;
  offline: number;
  maintenance: number;
  organizations: number;
  locations: number;
  projects: number;
  tags: number;
}

export async function getStats(): Promise<DashboardStats> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      physical: sql<number>`count(*) filter (where ${servers.assetType} = 'physical')::int`,
      virtual: sql<number>`count(*) filter (where ${servers.assetType} = 'virtual')::int`,
      online: sql<number>`count(*) filter (where ${servers.status} = 'online')::int`,
      warning: sql<number>`count(*) filter (where ${servers.status} = 'warning')::int`,
      offline: sql<number>`count(*) filter (where ${servers.status} = 'offline')::int`,
      maintenance: sql<number>`count(*) filter (where ${servers.status} = 'maintenance')::int`,
    })
    .from(servers);

  const [orgCount, locCount, projCount, tagCount] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(organizations),
    db.select({ n: sql<number>`count(*)::int` }).from(locations),
    db.select({ n: sql<number>`count(distinct ${servers.projectId})::int` }).from(servers),
    db.select({ n: sql<number>`count(distinct ${servers.tagId})::int` }).from(servers),
  ]);

  return {
    total: row?.total ?? 0,
    physical: row?.physical ?? 0,
    virtual: row?.virtual ?? 0,
    online: row?.online ?? 0,
    warning: row?.warning ?? 0,
    offline: row?.offline ?? 0,
    maintenance: row?.maintenance ?? 0,
    organizations: orgCount[0]?.n ?? 0,
    locations: locCount[0]?.n ?? 0,
    projects: projCount[0]?.n ?? 0,
    tags: tagCount[0]?.n ?? 0,
  };
}

const SEED_ORGS = [
  { name: "Northwind Retail", code: "NWR" },
  { name: "Helios Financial", code: "HLF" },
  { name: "Cobalt Health", code: "CBT" },
  { name: "Atlas Logistics", code: "ATL" },
];

const SEED_LOCS = [
  { name: "AWS us-east-1", city: "Ashburn", country: "United States", latitude: 39.0438, longitude: -77.4874 },
  { name: "AWS eu-west-1", city: "Dublin", country: "Ireland", latitude: 53.3498, longitude: -6.2603 },
  { name: "Equinix DC2", city: "Ashburn", country: "United States", latitude: 39.0907, longitude: -77.4599 },
  { name: "Digital Realty FRA10", city: "Frankfurt", country: "Germany", latitude: 50.1109, longitude: 8.6821 },
  { name: "Azure West Europe", city: "Amsterdam", country: "Netherlands", latitude: 52.3667, longitude: 4.9 },
  { name: "Google Cloud europe-west4", city: "Eemshaven", country: "Netherlands", latitude: 51.9144, longitude: 4.398 },
  { name: "On-Prem DC Bengaluru", city: "Bengaluru", country: "India", latitude: 12.9716, longitude: 77.5946 },
  { name: "On-Prem DC Singapore", city: "Singapore", country: "Singapore", latitude: 1.3521, longitude: 103.8198 },
  { name: "On-Prem DC Sao Paulo", city: "Sao Paulo", country: "Brazil", latitude: -23.5505, longitude: -46.6333 },
];

const SEED_PROJECTS = [
  { name: "Project Atlas", description: "Core payments platform migration" },
  { name: "Project Borealis", description: "Real-time telemetry pipeline" },
  { name: "Project Cascade", description: "Data lake consolidation" },
];

const SEED_TAGS = [
  { name: "production", color: "#ef4444" },
  { name: "staging", color: "#f59e0b" },
  { name: "edge", color: "#0ea5e9" },
  { name: "gpu", color: "#a855f7" },
  { name: "backup", color: "#10b981" },
];

/** Idempotently populate reference data + demo assets on first run. */
export async function seedIfEmpty(): Promise<void> {
  const [{ n: existingServers }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(servers);
  if (existingServers > 0) return;

  const orgRows = await db
    .insert(organizations)
    .values(SEED_ORGS)
    .onConflictDoNothing()
    .returning();
  const allOrgs =
    orgRows.length > 0
      ? orgRows
      : await db.select().from(organizations).orderBy(asc(organizations.id));

  const locRows = await db
    .insert(locations)
    .values(SEED_LOCS)
    .onConflictDoNothing()
    .returning();
  const allLocs =
    locRows.length > 0
      ? locRows
      : await db.select().from(locations).orderBy(asc(locations.id));

  const projectIds = await Promise.all(
    SEED_PROJECTS.map((project) => ensureProject(project.name)),
  );
  const tagIds = await Promise.all(
    SEED_TAGS.map((tag) => ensureTag(tag.name)),
  );

  if (allOrgs.length === 0 || allLocs.length === 0) return;

  // Deterministic pseudo-random offsets so demo servers cluster near their DC.
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const statuses = ["online", "online", "online", "warning", "offline", "maintenance"];
  const values = [];

  for (let i = 0; i < 48; i += 1) {
    const loc = allLocs[i % allLocs.length];
    const org = allOrgs[(i * 3 + 1) % allOrgs.length];
    const assetType: AssetType = i % 3 === 0 ? "physical" : "virtual";
    const status = statuses[Math.floor(rand() * statuses.length)];
    values.push({
      hostname: `${org.code?.toLowerCase() ?? "dc"}-node-${String(i + 1).padStart(3, "0")}`,
      organizationId: org.id,
      latitude: Number((loc.latitude + (rand() - 0.5) * 0.35).toFixed(6)),
      longitude: Number((loc.longitude + (rand() - 0.5) * 0.35).toFixed(6)),
      assetType,
      projectId: i % 4 === 0 ? null : projectIds[i % projectIds.length],
      tagId: i % 5 === 0 ? null : tagIds[i % tagIds.length],
      locationId: loc.id,
      locationLabel: `${loc.name} · Rack ${String.fromCharCode(65 + (i % 8))}${(i % 24) + 1}`,
      ipAddress: `10.${(i % 250) + 1}.${Math.floor(rand() * 250)}.${Math.floor(rand() * 250)}`,
      provider: assetType === "virtual" ? ["AWS", "Azure", "GCP"][i % 3] : null,
      cpuCores: assetType === "virtual" ? [4, 8, 16, 32][i % 4] : [16, 32, 64][i % 3],
      memoryGb: [16, 32, 64, 128, 256][i % 5],
      status,
      online: status !== "offline",
      lastSeenAt: new Date(Date.now() - Math.floor(rand() * 1000 * 60 * 60 * 12)),
      notes: null,
    });
  }

  await db.insert(servers).values(values);
}

export { and, desc };