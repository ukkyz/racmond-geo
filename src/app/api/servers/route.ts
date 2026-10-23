import { NextResponse } from "next/server";
import {
  createServer,
  getReferenceData,
  getServer,
  getStats,
  listServers,
  seedIfEmpty,
} from "@/lib/data";
import { validateServerInput, type ServerInput } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await seedIfEmpty();
    const [servers, reference, stats] = await Promise.all([
      listServers(),
      getReferenceData(),
      getStats(),
    ]);
    return NextResponse.json({ servers, reference, stats });
  } catch (error) {
    console.error("GET /api/servers failed", error);
    return NextResponse.json(
      { error: "Unable to load server inventory." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | Partial<ServerInput>
      | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const { errors } = validateServerInput(body);
    if (errors.length) {
      return NextResponse.json({ errors }, { status: 422 });
    }

    const created = await createServer({
      hostname: String(body.hostname),
      organizationId: Number(body.organizationId),
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      assetType: body.assetType!,
      project: body.project ?? null,
      tag: body.tag ?? null,
      locationId: body.locationId ?? null,
      locationLabel: body.locationLabel ?? null,
      ipAddress: body.ipAddress ?? null,
      provider: body.provider ?? null,
      cpuCores: body.cpuCores ?? null,
      memoryGb: body.memoryGb ?? null,
      status: body.status ?? "online",
      online: body.online ?? true,
      notes: body.notes ?? null,
    });

    return NextResponse.json(
      { server: await getServer(created.id) },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/servers failed", error);
    return NextResponse.json(
      { error: "Unable to create the server asset." },
      { status: 500 },
    );
  }
}