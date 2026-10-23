"use client";

import { useEffect, useRef, useState } from "react";
import { ModuleHeader } from "@/components/platform/PlatformShell";
import { Button, Badge } from "@/components/ui";
import { parseArgs } from "@/lib/cli";

interface CliApp {
  name: string;
  path: string;
  version: string;
  allowed: boolean;
}

type Line = { type: "stdout" | "stderr" | "system" | "cmd"; text: string };

const QUICK: Record<string, string[]> = {
  git: ["status", "log --oneline -5", "branch --show-current"],
  docker: ["ps", "images", "version"],
  "docker-compose": ["ps", "config"],
  kubectl: ["version --client", "get nodes"],
  npm: ["--version", "ls --depth=0"],
  node: ["--version"],
  python: ["--version"],
  go: ["version"],
  cargo: ["--version"],
  sqlite3: ["--version"],
  jq: ["--version"],
  make: ["--version"],
  curl: ["--version"],
  uname: ["-a"],
  whoami: [],
  df: ["-h"],
  free: ["-h"],
};

export default function CliRunner() {
  const [apps, setApps] = useState<CliApp[]>([]);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("bash");
  const [prompt, setPrompt] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { type: "system", text: "Racmond CLI runner ready. Type a command or pick an app below." },
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [running, setRunning] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadApps = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cli/apps", { cache: "no-store" });
      const data = (await res.json()) as {
        apps?: CliApp[];
        allowlist?: string[];
      };
      setApps(data.apps ?? []);
      setAllowlist(data.allowlist ?? []);
      if (!data.apps?.some((a) => a.name === selected)) {
        const first = data.apps?.find((a) => a.name === "bash") ?? data.apps?.[0];
        if (first) setSelected(first.name);
      }
    } catch {
      setLines((l) => [...l, { type: "stderr", text: "Failed to detect CLI applications." }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadApps();
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  const currentApp = apps.find((a) => a.name === selected) ?? null;

  const run = async (raw?: string) => {
    const input = (raw ?? prompt).trim();
    if (!input || running) return;
    setHistory((h) => [input, ...h].slice(0, 100));
    setHistoryIdx(-1);
    setPrompt("");

    const tokens = parseArgs(input);
    const app = tokens[0] ?? selected;
    const args = tokens.slice(1);

    setLines((l) => [...l, { type: "cmd", text: `$ ${input}` }]);
    setRunning(true);
    try {
      const res = await fetch("/api/cli/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app, args }),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setLines((l) => [...l, { type: "stderr", text: err.error ?? `Request failed (${res.status})` }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue;
          const msg = JSON.parse(part) as {
            type: string;
            line?: string;
            message?: string;
            code?: number | null;
            durationMs?: number;
          };
          if (msg.type === "exit") {
            setLines((l) => [
              ...l,
              { type: "system", text: `[exit ${msg.code ?? "?"} · ${msg.durationMs}ms]` },
            ]);
          } else if (msg.type === "error") {
            setLines((l) => [...l, { type: "stderr", text: msg.message ?? "error" }]);
          } else {
            setLines((l) => [
              ...l,
              { type: msg.type === "stderr" ? "stderr" : "stdout", text: msg.line ?? "" },
            ]);
          }
        }
      }
    } catch (error) {
      setLines((l) => [
        ...l,
        { type: "stderr", text: error instanceof Error ? error.message : "Request failed" },
      ]);
    } finally {
      setRunning(false);
      inputRef.current?.focus();
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void run();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const idx = historyIdx === -1 ? 0 : Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      setPrompt(history[idx] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx === -1) return;
      const idx = historyIdx - 1;
      setHistoryIdx(idx);
      setPrompt(idx === -1 ? "" : history[idx] ?? "");
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  const quick = QUICK[selected] ?? [];

  return (
    <div className="fade-in grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <ModuleHeader
          eyebrow="Module · Execution"
          title="Local CLI runner"
          description="Drive any locally installed CLI from the browser. Output streams back live. Only allowlisted binaries can run — dangerous commands are always blocked."
          actions={
            <Button variant="ghost" onClick={() => void loadApps()} disabled={loading}>
              {loading ? "Detecting…" : "Re-detect"}
            </Button>
          }
        />

        <div className="glass-card rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="emerald">{apps.length} detected</Badge>
            <Badge tone="violet">{allowlist.length} allowlisted</Badge>
            <Badge tone="rose">dangerous blocked</Badge>
          </div>
          <p className="mt-2 text-[11.5px] text-[var(--text-muted)]">
            Detected binaries are probed with <code className="font-mono text-sky-300">which</code> and{" "}
            <code className="font-mono text-sky-300">--version</code>. The allowlist is controlled by
            <code className="font-mono text-sky-300"> CLI_ALLOWLIST</code> in the environment.
          </p>
        </div>

        {/* Terminal */}
        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-[var(--glass-divider)] px-4 py-2">
            <span className="text-[12px] font-semibold text-[var(--text-muted)]">
              terminal — {selected}
            </span>
            <div className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
            </div>
          </div>
          <div
            ref={terminalRef}
            className="thin-scroll h-[420px] overflow-y-auto bg-[#0a0517] p-4 font-mono text-[12px] leading-relaxed"
          >
            {lines.map((l, i) => (
              <div
                key={i}
                className={
                  l.type === "cmd"
                    ? "text-emerald-300"
                    : l.type === "stderr"
                      ? "text-rose-300"
                      : l.type === "system"
                        ? "text-amber-200/90"
                        : "text-[var(--text-secondary)]"
                }
              >
                {l.text || " "}
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
            className="flex items-center gap-2 border-t border-[var(--glass-divider)] p-3"
          >
            <span className="font-mono text-[12px] text-emerald-300">
              {selected}$
            </span>
            <input
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKey}
              disabled={running}
              autoFocus
              spellCheck={false}
              className="glass-input flex-1 rounded-lg px-3 py-2 font-mono text-[12.5px] outline-none disabled:opacity-60"
              placeholder={running ? "running…" : "args…"}
            />
            <Button type="submit" disabled={running}>
              {running ? "…" : "Run"}
            </Button>
          </form>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <div className="glass-card rounded-2xl p-4">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Applications
          </p>
          {loading ? (
            <p className="text-[12px] text-[var(--text-muted)]">Detecting…</p>
          ) : apps.length === 0 ? (
            <p className="text-[12px] text-[var(--text-muted)]">
              No CLIs detected. Install some or re-detect.
            </p>
          ) : (
            <div className="max-h-72 thin-scroll space-y-1 overflow-y-auto">
              {apps.map((a) => (
                <button
                  key={a.name}
                  type="button"
                  onClick={() => setSelected(a.name)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
                    selected === a.name
                      ? "bg-purple-500/14 text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--glass-card-hover)]"
                  }`}
                >
                  <span
                    className={`h-2 w-2 flex-none rounded-full ${
                      a.allowed ? "bg-emerald-400" : "bg-slate-500"
                    }`}
                  />
                  <span className="font-mono text-[12px] text-[var(--text-primary)]">{a.name}</span>
                  <span className="ml-auto truncate text-[10px] text-[var(--text-subtle)]">
                    {a.version}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {quick.length > 0 ? (
          <div className="glass-card rounded-2xl p-4">
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {selected} quick commands
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quick.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setSelected(selected);
                    void run(`${selected} ${q}`);
                  }}
                  className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-input)] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--glass-card-hover)] hover:text-[var(--text-primary)]"
                >
                  {q || "—"}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="glass-card rounded-2xl p-4">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Safety
          </p>
          <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">
            Commands run on the server host with a per-command timeout. The app
            is validated against a strict allowlist; shell interpreters and
            destructive tools are rejected before execution.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-4">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Allowlist
          </p>
          <div className="flex flex-wrap gap-1">
            {allowlist.slice(0, 40).map((a) => (
              <span
                key={a}
                className="rounded-md bg-purple-500/12 px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent-text)]"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
