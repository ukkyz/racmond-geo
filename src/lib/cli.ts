// Shared CLI runner policy: which binaries may be executed, and how to detect
// them. The runner is the only code path that executes host processes.

export const DEFAULT_ALLOWLIST = [
  "git",
  "npm",
  "node",
  "docker",
  "docker-compose",
  "kubectl",
  "helm",
  "pnpm",
  "yarn",
  "bun",
  "python",
  "python3",
  "pip",
  "go",
  "cargo",
  "rustc",
  "java",
  "mvn",
  "sqlite3",
  "psql",
  "jq",
  "make",
  "curl",
  "bash",
  "uname",
  "whoami",
  "df",
  "free",
  "ls",
  "echo",
  "cat",
];

/** Always rejected, regardless of configuration. */
export const ALWAYS_BLOCKLIST = [
  "rm",
  "rmdir",
  "mkfs",
  "dd",
  "sudo",
  "su",
  "reboot",
  "shutdown",
  "mount",
  "umount",
  "kill",
  "pkill",
  "killall",
  "chmod",
  "chown",
  "passwd",
  "ssh",
  "scp",
  "eval",
  "exec",
];

/** Candidate binaries probed for presence on the host. */
export const CANDIDATES = [
  ...DEFAULT_ALLOWLIST,
  "terraform",
  "aws",
  "gcloud",
  "az",
  "deno",
  "htop",
  "top",
  "ping",
  "wget",
  "openssl",
  "env",
  "printenv",
  "date",
  "sleep",
  "true",
  "false",
];

export function resolveAllowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env.CLI_ALLOWLIST ?? env.CLI_ALLOWED_COMMANDS;
  if (raw && raw.trim()) {
    return new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  return new Set(DEFAULT_ALLOWLIST);
}

export function isAllowed(app: string, allow: Set<string>): boolean {
  const name = app.trim();
  if (ALWAYS_BLOCKLIST.includes(name)) return false;
  return allow.has(name);
}

export function blockReason(app: string, allow: Set<string>): string | null {
  if (ALWAYS_BLOCKLIST.includes(app.trim())) {
    return `"${app}" is blocked by policy (dangerous command).`;
  }
  if (!allow.has(app.trim())) {
    return `"${app}" is not in the CLI allowlist.`;
  }
  return null;
}

/** Minimal, shell-safe argument parser (no glob expansion, no shell). */
export function parseArgs(input: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
    } else if (ch === "\"" || ch === "'") {
      quote = ch;
    } else if (ch === " " || ch === "\t") {
      if (current) {
        out.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out;
}
