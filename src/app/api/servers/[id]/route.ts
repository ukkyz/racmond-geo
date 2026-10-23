import { NextResponse } from "next/server";
import { deleteServer, getServer, updateServer } from "@/lib/data";
import { validateServerInput, type ServerInput } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const numeric = Number(id);
  if (!Number.isInteger(numeric)) {
    return NextResponse.json({ error: "Invalid server id." }, { status: 400 });
  }
  const server = await getServer(numeric);
  if (!server) {
    return NextResponse.json({ error: "Server not found." }, { status: 404 });
  }
  return NextResponse.json({ server });
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) {
      return NextResponse.json({ error: "Invalid server id." }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as Partial<ServerInput> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const { errors } = validateServerInput(body, { partial: true });
    if (errors.length) {
      return NextResponse.json({ errors }, { status: 422 });
    }

    const updated = await updateServer(numeric, {
      ...body,
      latitude: body.latitude !== undefined ? Number(body.latitude) : undefined,
      longitude: body.longitude !== undefined ? Number(body.longitude) : undefined,
      organizationId:
        body.organizationId !== undefined ? Number(body.organizationId) : undefined,
      cpuCores: body.cpuCores !== undefined ? Number(body.cpuCores) : undefined,
      memoryGb: body.memoryGb !== undefined ? Number(body.memoryGb) : undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: "Server not found." }, { status: 404 });
    }
    return NextResponse.json({ server: await getServer(numeric) });
  } catch (error) {
    console.error("PATCH /api/servers/[id] failed", error);
    return NextResponse.json(
      { error: "Unable to update the server asset." },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) {
      return NextResponse.json({ error: "Invalid server id." }, { status: 400 });
    }
    const removed = await deleteServer(numeric);
    if (!removed) {
      return NextResponse.json({ error: "Server not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/servers/[id] failed", error);
    return NextResponse.json(
      { error: "Unable to delete the server asset." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) {
      return NextResponse.json({ error: "Invalid server id." }, { status: 400 });
    }
    const body = (await req.json().catch(() => null)) as Partial<ServerInput> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }
    const { errors } = validateServerInput(body);
    if (errors.length) {
      return NextResponse.json({ errors }, { status: 422 });
    }
    // Re-use the create path to validate mandatory fields then update.
    const updated = await updateServer(numeric, {
      ...body,
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      organizationId: Number(body.organizationId),
      assetType: body.assetType,
    });
    if (!updated) {
      return NextResponse.json({ error: "Server not found." }, { status: 404 });
    }
    return NextResponse.json({ server: await getServer(numeric) });
  } catch (error) {
    console.error("POST /api/servers/[id] failed", error);
    return NextResponse.json({ error: "Unable to save the asset." }, { status: 500 });
  }
}