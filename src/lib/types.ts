export type AssetType = "physical" | "virtual";

export const ASSET_TYPES: { value: AssetType; label: string; hint: string }[] = [
  {
    value: "physical",
    label: "Physical",
    hint: "Owned by the organization — hardware in a colo / on-prem DC",
  },
  {
    value: "virtual",
    label: "Virtual",
    hint: "Rented by the organization — cloud or hosted VM",
  },
];

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  physical: "Physical",
  virtual: "Virtual",
};

export type ServerStatus = "online" | "warning" | "offline" | "maintenance";

export const STATUS_LABEL: Record<string, string> = {
  online: "Online",
  warning: "Warning",
  offline: "Offline",
  maintenance: "Maintenance",
};

export interface ServerDTO {
  id: number;
  hostname: string;
  organizationId: number;
  organizationName: string;
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
  lastSeenAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationDTO {
  id: number;
  name: string;
  code: string | null;
}

export interface LocationDTO {
  id: number;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
}

export interface ProjectDTO {
  id: number;
  name: string;
  description: string | null;
}

export interface TagDTO {
  id: number;
  name: string;
  color: string | null;
}

export interface ReferenceData {
  organizations: OrganizationDTO[];
  locations: LocationDTO[];
  projects: ProjectDTO[];
  tags: TagDTO[];
}

/** Values a client may send to create / update a server asset. */
export interface ServerInput {
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

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateServerInput(
  input: Partial<ServerInput>,
  { partial = false }: { partial?: boolean } = {},
): ValidationResult {
  const errors: string[] = [];

  if (!partial || input.hostname !== undefined) {
    if (!input.hostname || !input.hostname.trim()) {
      errors.push("Hostname is required.");
    } else if (input.hostname.trim().length > 120) {
      errors.push("Hostname must be 120 characters or fewer.");
    }
  }

  if (!partial || input.organizationId !== undefined) {
    if (
      input.organizationId === undefined ||
      input.organizationId === null ||
      Number.isNaN(Number(input.organizationId))
    ) {
      errors.push("Organization owner is required.");
    }
  }

  if (!partial || input.latitude !== undefined || input.longitude !== undefined) {
    const lat = Number(input.latitude);
    const lng = Number(input.longitude);
    if (input.latitude === undefined || input.longitude === undefined) {
      if (!partial) errors.push("Geo location is required (latitude & longitude).");
    } else if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      errors.push("Latitude must be a number between -90 and 90.");
    } else if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      errors.push("Longitude must be a number between -180 and 180.");
    }
  }

  if (!partial || input.assetType !== undefined) {
    if (input.assetType !== "physical" && input.assetType !== "virtual") {
      errors.push("Asset type is required (physical or virtual).");
    }
  }

  if (input.cpuCores !== undefined && input.cpuCores !== null) {
    if (Number.isNaN(Number(input.cpuCores)) || Number(input.cpuCores) < 0) {
      errors.push("CPU cores must be a positive number.");
    }
  }

  if (input.memoryGb !== undefined && input.memoryGb !== null) {
    if (Number.isNaN(Number(input.memoryGb)) || Number(input.memoryGb) < 0) {
      errors.push("Memory (GB) must be a positive number.");
    }
  }

  if (input.project !== undefined && input.project && input.project.length > 120) {
    errors.push("Project name must be 120 characters or fewer.");
  }

  if (input.tag !== undefined && input.tag && input.tag.length > 60) {
    errors.push("Tag must be 60 characters or fewer.");
  }

  return { ok: errors.length === 0, errors };
}

export interface Filters {
  organizationIds: number[];
  locationIds: number[];
  projects: string[];
  tags: string[];
  assetTypes: AssetType[];
  status: string | null;
  query: string;
}

export const EMPTY_FILTERS: Filters = {
  organizationIds: [],
  locationIds: [],
  projects: [],
  tags: [],
  assetTypes: [],
  status: null,
  query: "",
};

export function matchesFilters(
  server: ServerDTO,
  filters: Filters,
  resolveLocationKey: (s: ServerDTO) => string,
): boolean {
  if (
    filters.organizationIds.length &&
    !filters.organizationIds.includes(server.organizationId)
  ) {
    return false;
  }
  if (filters.locationIds.length) {
    const key = resolveLocationKey(server);
    if (!filters.locationIds.some((id) => String(id) === key)) return false;
  }
  if (filters.projects.length) {
    if (!server.project || !filters.projects.includes(server.project)) return false;
  }
  if (filters.tags.length) {
    if (!server.tag || !filters.tags.includes(server.tag)) return false;
  }
  if (filters.assetTypes.length && !filters.assetTypes.includes(server.assetType)) {
    return false;
  }
  if (filters.status && server.status !== filters.status) return false;

  if (filters.query.trim()) {
    const q = filters.query.trim().toLowerCase();
    const haystack = [
      server.hostname,
      server.organizationName,
      server.project ?? "",
      server.tag ?? "",
      server.locationLabel ?? "",
      server.locationName ?? "",
      server.city ?? "",
      server.country ?? "",
      server.ipAddress ?? "",
      server.provider ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}