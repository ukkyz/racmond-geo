import { defineRelations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// --- Enums ---
export const assetTypeEnum = pgEnum("asset_type", ["physical", "virtual"]);
export type AssetType = (typeof assetTypeEnum.enumValues)[number];

// --- Tables ---
export const organizations = pgTable(
  "organizations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    code: text("code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("organizations_name_idx").on(t.name)],
);

export const locations = pgTable("locations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  city: text("city"),
  country: text("country"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const projects = pgTable("projects", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tags = pgTable(
  "tags",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("tags_name_idx").on(t.name)],
);

export const servers = pgTable(
  "servers",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    hostname: text("hostname").notNull(),

    // Mandatory
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    assetType: assetTypeEnum("asset_type").notNull(),

    // Optional foreign keys
    projectId: integer("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    tagId: integer("tag_id").references(() => tags.id, {
      onDelete: "set null",
    }),
    locationId: integer("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),

    // Descriptive / operational
    locationLabel: text("location_label"),
    ipAddress: text("ip_address"),
    provider: text("provider"),
    cpuCores: integer("cpu_cores"),
    memoryGb: integer("memory_gb"),
    status: text("status").notNull().default("online"),
    online: boolean("online").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("servers_organization_idx").on(t.organizationId),
    index("servers_project_idx").on(t.projectId),
    index("servers_tag_idx").on(t.tagId),
    index("servers_asset_type_idx").on(t.assetType),
  ],
);

// --- Relational Queries v2 (RC syntax) ---
export const relations = defineRelations(
  { organizations, locations, projects, tags, servers },
  (r) => ({
    organizations: {
      servers: r.many.servers({
        from: r.organizations.id,
        to: r.servers.organizationId,
      }),
    },
    locations: {
      servers: r.many.servers({
        from: r.locations.id,
        to: r.servers.locationId,
      }),
    },
    projects: {
      servers: r.many.servers({
        from: r.projects.id,
        to: r.servers.projectId,
      }),
    },
    tags: {
      servers: r.many.servers({
        from: r.tags.id,
        to: r.servers.tagId,
      }),
    },
    servers: {
      organization: r.one.organizations({
        from: r.servers.organizationId,
        to: r.organizations.id,
      }),
      location: r.one.locations({
        from: r.servers.locationId,
        to: r.locations.id,
      }),
      project: r.one.projects({
        from: r.servers.projectId,
        to: r.projects.id,
      }),
      tag: r.one.tags({
        from: r.servers.tagId,
        to: r.tags.id,
      }),
    },
  }),
);

// --- Inferred Types ---
export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Tag = typeof tags.$inferSelect;