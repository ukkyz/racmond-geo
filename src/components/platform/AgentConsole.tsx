"use client";

import { useEffect, useRef, useState } from "react";
import { ModuleHeader } from "@/components/platform/PlatformShell";
import { Button, Badge } from "@/components/ui";
import { parseArgs } from "@/lib/cli";
import type { Finding } from "@/lib/platform/agent";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  provider?: string;
}

interface Stats {
  total: number;
  online: number;
  warning: number;
  offline: number;
  maintenance?: number;
}

const PROMPTS = [
  "Run diagnostics",
  "Why are hosts offline?",
  "Suggest remediation",
  "Show assets by site",
];

export default function AgentConsole() {
  const [provider, setProvider] = useState<"llm" | "heuristic" | "…">("…");
  const [stats, setStats] = useState<Stats | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [probe, setProbe] = useState<{
    finding: Finding;
    lines: { type: string; text: string }[];
    running: boolean;
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadContext = async () => {
    const res = await fetch("/api/agent/chat", { cache: "no-store" });
    const data = (await res.json()) as {
      provider: string;
      stats: Stats;
      findings: Finding[];
    };
    setProvider(data.provider === "llm" ? "llm" : "heuristic");
    setStats(data.stats);
    setFindings(data.findings);
  };

  useEffect(() => {
    void loadContext();
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const send = async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question }]);
    setSending(true);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });
      const data = (await res.json()) as {
        provider: string;
        reply: string;
        findings?: Finding[];
        stats?: Stats;
      };
      setProvider(data.provider === "llm" ? "llm" : "heuristic");
      if (data.findings) setFindings(data.findings);
      if (data.stats) setStats(data.stats);
      setMessages((m) => [
        ...m,
        { role: "agent", content: data.reply, provider: data.provider },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "agent", content: "Sorry — I could not reach the agent service.", provider: "error" },
      ]);
    } finally {
      setSending(false);
    }
  };

  const runProbe = async (finding: Finding) => {
    const tokens = parseArgs(finding.probe);
    const app = tokens[0] ?? "echo";
    const args = tokens.slice(1);
    setProbe({ finding, lines: [{ type: "system", text: `$ ${finding.probe}` }], running: true });
    try {
      const res = await fetch("/api/cli/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app, args }),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setProbe((p) => ({
          ...p!,
          lines: [...p!.lines, { type: "stderr", text: err.error ?? "run failed" }],
          running: false,
        }));
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
          setProbe((p) => {
            if (!p) return p;
            if (msg.type === "exit") {
              return {
                ...p,
                lines: [...p.lines, { type: "system", text: `[exit ${msg.code ?? "?"} · ${msg.durationMs}ms]` }],
                running: false,
              };
            }
            if (msg.type === "error") {
              return { ...p, lines: [...p.lines, { type: "stderr", text: msg.message ?? "error" }] };
            }
            return {
              ...p,
              lines: [...p.lines, { type: msg.type === "stderr" ? "stderr" : "stdout", text: msg.line ?? "" }],
            };
          });
        }
      }
    } catch {
      setProbe((p) => (p ? { ...p, lines: [...p.lines, { type: "stderr", text: "probe failed" }], running: false } : p));
    } finally {
      setProbe((p) => (p ? { ...p, running: false } : p));
    }
  };

  const severityTone = (s: Finding["severity"]) =>
    s === "critical" ? "rose" : s === "warn" ? "amber" : "violet";

  return (
    <div className="fade-in grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <ModuleHeader
          eyebrow="Module · Assistant"
          title="AI Agent console"
          description="An agent that reads fleet state, diagnoses problems and proposes remediation. It can run safe probes through the CLI runner — with your approval."
          actions={
            <Badge tone={provider === "llm" ? "emerald" : "violet"}>
              {provider === "llm" ? "LLM connected" : "Built-in reasoning"}
            </Badge>
          }
        />

        <div className="glass-card flex h-[460px] flex-col overflow-hidden rounded-2xl">
          <div className="border-b border-[var(--glass-divider)] px-4 py-2 text-[12px] font-semibold text-[var(--text-muted)]">
            Conversation
          </div>
          <div ref={listRef} className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-[12.5px] text-[var(--text-subtle)]">
                Ask the agent to diagnose the fleet, explain an incident or suggest
                remediation. Try a prompt below.
              </p>
            ) : null}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-gradient-to-r from-violet-600/25 to-fuchsia-600/20 text-[var(--text-primary)] border border-purple-500/30"
                      : "glass-card text-[var(--text-secondary)]"
                  }`}
                >
                  {m.content}
                  {m.provider && m.role === "agent" ? (
                    <span className="mt-1.5 block text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                      via {m.provider === "llm" ? "LLM" : "heuristic engine"}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            {sending ? (
              <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
                Agent is reasoning…
              </div>
            ) : null}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-center gap-2 border-t border-[var(--glass-divider)] p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the agent to diagnose or fix something…"
              className="glass-input flex-1 rounded-xl px-3.5 py-2.5 text-[13px] outline-none"
            />
            <Button type="submit" disabled={sending}>
              {sending ? "…" : "Send"}
            </Button>
          </form>
        </div>

        <div className="flex flex-wrap gap-2">
          {PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => void send(p)}
              className="glass-card-interactive rounded-xl px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)]"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Side panel */}
      <div className="space-y-4">
        <div className="glass-card rounded-2xl p-4">
          <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Fleet health
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Total", stats?.total ?? "—"],
              ["Online", stats?.online ?? "—"],
              ["Warning", stats?.warning ?? "—"],
              ["Offline", stats?.offline ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="glass-input rounded-lg p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">{label}</p>
                <p className="text-[15px] font-bold text-[var(--text-primary)]">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Findings · {findings.length}
          </p>
          {findings.length === 0 ? (
            <p className="text-[12px] text-[var(--text-muted)]">No active findings.</p>
          ) : (
            <div className="space-y-2">
              {findings.map((f) => (
                <div key={f.id} className="rounded-xl border border-[var(--glass-border)] p-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                    <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">{f.title}</p>
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--text-muted)]">{f.detail}</p>
                  {f.evidence.length > 0 ? (
                    <ul className="mt-2 space-y-0.5">
                      {f.evidence.slice(0, 3).map((e) => (
                        <li key={e} className="font-mono text-[10.5px] text-[var(--text-subtle)]">
                          · {e}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void runProbe(f)}
                    className="mt-2.5 rounded-lg border border-purple-500/30 bg-purple-500/12 px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--accent-text)] transition hover:bg-purple-500/20"
                  >
                    Run probe: {f.probe}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {probe ? (
          <div className="glass-card overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-[var(--glass-divider)] px-4 py-2">
              <span className="text-[11.5px] font-semibold text-[var(--text-muted)]">
                probe · {probe.finding.title}
              </span>
              <button onClick={() => setProbe(null)} className="action-icon text-[11px]">✕</button>
            </div>
            <div className="thin-scroll h-44 overflow-y-auto bg-[#0a0517] p-3 font-mono text-[11.5px] leading-relaxed">
              {probe.lines.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.type === "stderr"
                      ? "text-rose-300"
                      : l.type === "system"
                        ? "text-amber-200/90"
                        : "text-[var(--text-secondary)]"
                  }
                >
                  {l.text || " "}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
