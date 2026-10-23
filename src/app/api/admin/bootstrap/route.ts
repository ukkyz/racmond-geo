import { NextResponse } from "next/server";
import { seedIfEmpty } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await seedIfEmpty();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON payload." },
        { status: 400 },
      );
    }

    const payload = body as Record<string, unknown>;
    const results: { entity: string; id: number }[] = [];
    const errors: string[] = [];

    const orgName = (payload.organizationName as string | undefined)?.trim();
    const orgCode = (payload.organizationCode as string | undefined)?.trim();
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const { organizations, locations, projects, tags, servers } = await import(
      "@/db/schema"
    );

    if (orgName) {
      const existing = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(sql`lower(${organizations.name}) = lower(${orgName})`)
        .limit(1);
      let id = existing[0]?.id;
      if (!id) {
        const ins = await db
          .insert(organizations)
          .values({ name: orgName, code: orgCode || null })
          .returning({ id: organizations.id });
        id = ins[0]!.id;
      }
      results.push({ entity: "organization", id });
    } else {
      errors.push("organizationName is required.");
    }

    const locName = (payload.locationName as string | undefined)?.trim();
    if (locName) {
      const lat = Number(payload.latitude);
      const lng = Number(payload.longitude);
      const existing = await db
        .select({ id: locations.id })
        .from(locations)
        .where(sql`lower(${locations.name}) = lower(${locName})`)
        .limit(1);
      let id = existing[0]?.id;
      if (!id) {
        const ins = await db
          .insert(locations)
          .values({
            name: locName,
            city: ((payload.city as string) || "").trim() || null,
            country: ((payload.country as string) || "").trim() || null,
            latitude: Number.isNaN(lat) ? 0 : lat,
            longitude: Number.isNaN(lng) ? 0 : lng,
          })
          .returning({ id: locations.id });
        id = ins[0]!.id;
      }
      results.push({ entity: "location", id });
    }

    const projName = (payload.projectName as string | undefined)?.trim();
    if (projName) {
      const existing = await db
        .select({ id: projects.id })
        .from(projects)
        .where(sql`lower(${projects.name}) = lower(${projName})`)
        .limit(1);
      let id = existing[0]?.id;
      if (!id) {
        const ins = await db
          .insert(projects)
          .values({ name: projName })
          .returning({ id: projects.id });
        id = ins[0]!.id;
      }
      results.push({ entity: "project", id });
    }

    const tagName = (payload.tagName as string | undefined)?.trim();
    if (tagName) {
      const existing = await db
        .select({ id: tags.id })
        .from(tags)
        .where(sql`lower(${tags.name}) = lower(${tagName})`)
        .limit(1);
      let id = existing[0]?.id;
      if (!id) {
        const ins = await db
          .insert(tags)
          .values({ name: tagName })
          .returning({ id: tags.id });
        id = ins[0]!.id;
      }
      results.push({ entity: "tag", id });
    }

    if (errors.length) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    void servers;
    return NextResponse.json({ ok: true, created: results }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/bootstrap failed", error);
    return NextResponse.json(
      { error: "Unable to create lookup entries." },
      { status: 500 },
    );
  }
}