// Heuristic reasoning engine for the AI Agent. It works without an external
// LLM and produces evidence-backed diagnosis from fleet state.

export interface AgentAsset {
  hostname: string;
  status: string;
  organizationName: string;
  locationName?: string | null;
  ipAddress?: string | null;
}

export interface FleetSnapshot {
  total: number;
  online: number;
  warning: number;
  offline: number;
  maintenance: number;
  physical: number;
  virtual: number;
  assets: AgentAsset[];
}

export interface Finding {
  id: string;
  severity: "critical" | "warn" | "info";
  title: string;
  detail: string;
  evidence: string[];
  probe: string; // suggested CLI probe (allowlisted)
}

export function demoSnapshot(): FleetSnapshot {
  const orgs = ["Northwind Retail", "Helios Financial", "Cobalt Health", "Atlas Logistics"];
  const sites = ["AWS us-east-1", "Equinix DC2", "Digital Realty FRA10", "On-Prem DC Bengaluru", "On-Prem DC Singapore"];
  const statuses = ["online", "online", "online", "warning", "offline", "maintenance"];
  const assets: AgentAsset[] = [];
  for (let i = 1; i <= 48; i += 1) {
    assets.push({
      hostname: `${(["nwr", "hlf", "cbt", "atl"][i % 4])}-node-${String(i).padStart(3, "0")}`,
      status: statuses[i % statuses.length],
      organizationName: orgs[i % orgs.length],
      locationName: sites[i % sites.length],
      ipAddress: `10.${(i % 250) + 1}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    });
  }
  const count = (s: string) => assets.filter((a) => a.status === s).length;
  const physical = assets.filter((_, i) => i % 3 === 0).length;
  return {
    total: assets.length,
    online: count("online"),
    warning: count("warning"),
    offline: count("offline"),
    maintenance: count("maintenance"),
    physical,
    virtual: assets.length - physical,
    assets,
  };
}

export function diagnose(snapshot: FleetSnapshot): Finding[] {
  const findings: Finding[] = [];
  const offline = snapshot.assets.filter((a) => a.status === "offline");
  const warning = snapshot.assets.filter((a) => a.status === "warning");

  if (offline.length > 0) {
    findings.push({
      id: "offline",
      severity: "critical",
      title: `${offline.length} assets are offline`,
      detail:
        "Unreachable hosts should be triaged by site and owner before automatic restart. Verify connectivity and whether a neighbouring node absorbed the load.",
      evidence: offline.slice(0, 6).map((a) => `${a.hostname} (${a.organizationName})`),
      probe: "docker ps",
    });
  }
  if (warning.length > 0) {
    findings.push({
      id: "warning",
      severity: "warn",
      title: `${warning.length} assets are in warning state`,
      detail:
        "Warning usually means a degraded metric — disk pressure, latency or a failed health check. Inspect the recent logs before treating as an incident.",
      evidence: warning.slice(0, 6).map((a) => `${a.hostname} @ ${a.locationName ?? "unknown"}`),
      probe: "df -h",
    });
  }
  if (snapshot.maintenance > 0) {
    findings.push({
      id: "maintenance",
      severity: "info",
      title: `${snapshot.maintenance} assets in maintenance`,
      detail: "Planned maintenance windows are expected, but confirm the window is still open and no customer-facing dependency is pinned to the node.",
      evidence: snapshot.assets.filter((a) => a.status === "maintenance").slice(0, 4).map((a) => a.hostname),
      probe: "echo maintenance window check",
    });
  }
  findings.push({
    id: "capacity",
    severity: "info",
    title: "Check host capacity before scaling",
    detail:
      "Before adding capacity, confirm there is headroom on CPU, memory and disk. Use the runner to inspect the host you intend to scale.",
    evidence: ["df -h · free -h · uptime"],
    probe: "df -h",
  });
  return findings;
}

export function heuristicReply(
  question: string,
  snapshot: FleetSnapshot,
  findings: Finding[],
): string {
  const q = question.toLowerCase();
  const lines: string[] = [];

  if (/(diagnos|what.*wrong|why|problem|issue|health|status)/.test(q)) {
    lines.push(
      `I inspected the fleet: ${snapshot.total} assets — ${snapshot.online} online, ${snapshot.warning} warning, ${snapshot.offline} offline, ${snapshot.maintenance} in maintenance.`,
    );
    if (findings.length === 0) {
      lines.push("No anomalies detected. The estate looks healthy.");
    } else {
      lines.push(`I found ${findings.length} thing worth attention:`);
      findings.slice(0, 4).forEach((f) => {
        lines.push(`• ${f.title} — ${f.detail}`);
      });
    }
    lines.push("Pick a finding and run its probe, or ask me to suggest a remediation.");
    return lines.join("\n");
  }

  if (/(remedi|fix|restart|recover|remediate)/.test(q)) {
    lines.push(
      "Remediation should be staged and verified. A safe first step is to probe the affected host and confirm the failure domain, then restart the narrowest component:",
    );
    lines.push("1. Confirm the host is reachable and resources are not exhausted.");
    lines.push("2. Restart the specific container/service rather than the whole node.");
    lines.push("3. Watch the service map for the error rate to fall back.");
    lines.push("Tell me which finding to act on and I will run the probe with your approval.");
    return lines.join("\n");
  }

  if (/(map|topolog|which site|where)/.test(q)) {
    const bySite = new Map<string, number>();
    snapshot.assets.forEach((a) => {
      const site = a.locationName ?? "unassigned";
      bySite.set(site, (bySite.get(site) ?? 0) + 1);
    });
    lines.push("Assets by site:");
    [...bySite.entries()].sort((a, b) => b[1] - a[1]).forEach(([site, n]) => {
      lines.push(`• ${site}: ${n}`);
    });
    return lines.join("\n");
  }

  lines.push(
    `I can diagnose the fleet, explain what is wrong and suggest remediation. Right now: ${snapshot.online}/${snapshot.total} assets are online${
      snapshot.offline ? `, ${snapshot.offline} are offline` : ""
    }${snapshot.warning ? `, ${snapshot.warning} are in warning` : ""}.`,
  );
  lines.push("Try: “run diagnostics”, “why are hosts offline?” or “show assets by site”.");
  return lines.join("\n");
}
