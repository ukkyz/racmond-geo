import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { blockReason, parseArgs, resolveAllowlist } from "@/lib/cli";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { app?: string; args?: unknown; command?: string }
    | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const app = String(body.app ?? "").trim();
  if (!app) {
    return NextResponse.json({ error: "No command specified." }, { status: 400 });
  }

  const allow = resolveAllowlist();
  const reason = blockReason(app, allow);
  if (reason) {
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  const rawArgs = body.args;
  const args = Array.isArray(rawArgs)
    ? rawArgs.map(String)
    : parseArgs(String(body.command ?? ""));

  const timeoutMs = Number(process.env.CLI_TIMEOUT_MS ?? 15000);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };
      const started = Date.now();
      const child = spawn(app, args, {
        cwd: process.cwd(),
        env: process.env,
        shell: false,
      });

      let outBuf = "";
      let errBuf = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        outBuf += chunk.toString();
        let idx: number;
        while ((idx = outBuf.indexOf("\n")) >= 0) {
          send({ type: "stdout", line: outBuf.slice(0, idx) });
          outBuf = outBuf.slice(idx + 1);
        }
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        errBuf += chunk.toString();
        let idx: number;
        while ((idx = errBuf.indexOf("\n")) >= 0) {
          send({ type: "stderr", line: errBuf.slice(0, idx) });
          errBuf = errBuf.slice(idx + 1);
        }
      });

      child.on("error", (error) => {
        send({ type: "error", message: error.message });
        send({ type: "exit", code: 127, durationMs: Date.now() - started });
        controller.close();
      });

      const timer = setTimeout(() => {
        send({ type: "stderr", line: `\n[timed out after ${timeoutMs}ms]` });
        child.kill("SIGKILL");
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        if (outBuf) send({ type: "stdout", line: outBuf });
        if (errBuf) send({ type: "stderr", line: errBuf });
        send({ type: "exit", code: code ?? null, durationMs: Date.now() - started });
        controller.close();
      });
    },
    cancel() {
      // Client disconnected — nothing more to clean up (process may linger briefly).
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
