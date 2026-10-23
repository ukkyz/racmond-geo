import { execFile } from "node:child_process";
import { NextResponse } from "next/server";
import {
  CANDIDATES,
  isAllowed,
  resolveAllowlist,
} from "@/lib/cli";

export const dynamic = "force-dynamic";

const which = (name: string) =>
  new Promise<string | null>((resolve) => {
    execFile("which", [name], { timeout: 2000 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(stdout.trim() || name);
    });
  });

const versionOf = (name: string) =>
  new Promise<string>((resolve) => {
    let settled = false;
    const done = (v: string) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    const tryFlags = (flags: string[]) => {
      execFile(name, flags, { timeout: 2000 }, (err, stdout, stderr) => {
        const out = (stderr && !stdout ? stderr : stdout).toString().trim().split("\n")[0] ?? "";
        done(out.slice(0, 120) || "detected");
      });
    };
    tryFlags(["--version"]);
    setTimeout(() => tryFlags(["-v"]), 1500);
    setTimeout(() => done("detected"), 3000);
  });

export async function GET() {
  try {
    const allow = resolveAllowlist();
    const results = await Promise.all(
      CANDIDATES.map(async (name) => {
        const path = await which(name);
        if (!path) return null;
        const version = await versionOf(name);
        return { name, path, version, allowed: isAllowed(name, allow) };
      }),
    );
    return NextResponse.json({
      apps: results.filter((a): a is NonNullable<typeof a> => a !== null),
      allowlist: [...allow].sort(),
    });
  } catch (error) {
    console.error("GET /api/cli/apps failed", error);
    return NextResponse.json(
      { error: "Unable to detect CLI applications." },
      { status: 500 },
    );
  }
}
