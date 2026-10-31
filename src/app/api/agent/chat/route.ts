import { NextResponse } from "next/server";
import {
  demoSnapshot,
  diagnose,
  heuristicReply,
  type AgentAsset,
  type FleetSnapshot,
} from "@/lib/platform/agent";

export const dynamic = "force-dynamic";

async function loadSnapshot(): Promise<FleetSnapshot> {
  try {
    const { listServers, getStats } = await import("@/lib/data");
    const [servers, stats] = await Promise.all([listServers(), getStats()]);
    const assets: AgentAsset[] = servers.map((s) => ({
      hostname: s.hostname,
      status: s.status,
      organizationName: s.organizationName,
      locationName: s.locationName,
      ipAddress: s.ipAddress,
    }));
    return {
      total: stats.total,
      online: stats.online,
      warning: stats.warning,
      offline: stats.offline,
      maintenance: stats.maintenance,
      physical: stats.physical,
      virtual: stats.virtual,
      assets,
    };
  } catch {
    return demoSnapshot();
  }
}

function summarize(snapshot: FleetSnapshot): string {
  return [
    `Fleet: ${snapshot.total} assets — ${snapshot.online} online, ${snapshot.warning} warning, ${snapshot.offline} offline, ${snapshot.maintenance} maintenance.`,
    `Physical ${snapshot.physical} / virtual ${snapshot.virtual}.`,
    snapshot.assets
      .filter((a) => a.status !== "online")
      .slice(0, 10)
      .map((a) => `${a.hostname} [${a.status}] ${a.organizationName}`)
      .join("\n"),
  ].join("\n");
}

async function callLlm(question: string, snapshot: FleetSnapshot): Promise<string | null> {
  const base = process.env.AI_API_BASE;
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL ?? "gpt-4o-mini";
  if (!base || !key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are Racmond, an operations agent for a data-center estate. Be concise, factual and actionable. Reference fleet state from the context. Suggest safe, verifiable remediation.",
          },
          { role: "system", content: `Fleet context:\n${summarize(snapshot)}` },
          { role: "user", content: question },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const snapshot = await loadSnapshot();
  const findings = diagnose(snapshot);
  return NextResponse.json({
    provider:
      process.env.AI_API_BASE && process.env.AI_API_KEY ? "llm" : "heuristic",
    stats: {
      total: snapshot.total,
      online: snapshot.online,
      warning: snapshot.warning,
      offline: snapshot.offline,
      maintenance: snapshot.maintenance,
      physical: snapshot.physical,
      virtual: snapshot.virtual,
    },
    findings,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { message?: string; question?: string }
    | null;
  const question = body?.message ?? body?.question ?? "";
  if (!question.trim()) {
    return NextResponse.json({ error: "No question provided." }, { status: 400 });
  }

  const snapshot = await loadSnapshot();
  const findings = diagnose(snapshot);

  const llm = await callLlm(question, snapshot);
  if (llm) {
    return NextResponse.json({
      provider: "llm",
      reply: llm,
      findings,
      stats: {
        total: snapshot.total,
        online: snapshot.online,
        warning: snapshot.warning,
        offline: snapshot.offline,
      },
    });
  }

  return NextResponse.json({
    provider: "heuristic",
    reply: heuristicReply(question, snapshot, findings),
    findings,
    stats: {
      total: snapshot.total,
      online: snapshot.online,
      warning: snapshot.warning,
      offline: snapshot.offline,
    },
  });
}
