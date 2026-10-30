// L6 — Security & Posture data model + deterministic demo dataset.
// Demonstrates vulnerability management with reachability, SBOM, policy/
// compliance state and eBPF-style runtime security events.

export type Severity = "critical" | "high" | "medium" | "low";
export type Reachability = "reachable" | "present" | "unknown";
export type VulnStatus = "open" | "remediated" | "accepted" | "investigating";

export interface Vulnerability {
  id: string;
  title: string;
  severity: Severity;
  cvss: number;
  cwe: string;
  package: string;
  version: string;
  fixedVersion?: string;
  service?: string;
  asset?: string;
  image?: string;
  reachability: Reachability;
  exploitAvailable: boolean;
  discoveredAt: string;
  status: VulnStatus;
  remediation: string;
  acceptedReason?: string;
}

export interface SbomEntry {
  name: string;
  version: string;
  license: string;
  purl: string;
  type: "library" | "binary" | "os";
  vulnerabilities: string[];
}

export interface Sbom {
  id: string;
  name: string;
  digest: string;
  generatedAt: string;
  entries: SbomEntry[];
}

export interface ComplianceControl {
  id: string;
  name: string;
  status: "pass" | "fail" | "warn" | "n/a";
  evidence: string;
}

export interface ComplianceFramework {
  id: string;
  name: string;
  short: string;
  score: number;
  status: "compliant" | "partial" | "non-compliant";
  controls: ComplianceControl[];
  updatedAt: string;
}

export interface RuntimeEvent {
  id: string;
  time: string;
  kind: "process" | "network" | "file" | "auth" | "config";
  severity: Severity;
  description: string;
  source: string;
  status: "new" | "investigating" | "allowed" | "blocked";
}

export interface PostureSummary {
  score: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  reachable: number;
  exploitAvailable: number;
  exposure: number;
  trend: number[];
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function severityRank(s: Severity): number {
  return SEVERITY_ORDER[s];
}

export function riskScore(v: Vulnerability): number {
  let score = (v.cvss / 10) * 25;
  if (v.severity === "critical") score += 15;
  if (v.reachability === "reachable") score += 25;
  else if (v.reachability === "present") score += 10;
  if (v.exploitAvailable) score += 15;
  return Math.round(Math.min(100, score));
}

function mulberry(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const SERVICES = [
  "api-gateway",
  "payments-svc",
  "ledger-svc",
  "notify-svc",
  "identity-svc",
  "config-svc",
  "audit-svc",
  "search-svc",
];

const ASSETS = [
  "nwr-node-001",
  "hlf-node-002",
  "cbt-node-007",
  "atl-node-011",
  "nwr-node-019",
  "hlf-node-024",
];

const IMAGES = [
  "node:22-alpine",
  "nginx:1.27-alpine",
  "python:3.12-slim",
  "postgres:16.4",
  "redis:7.4-alpine",
  "traefik:v3.2",
];

const PACKAGES = [
  ["openssl", "3.0.12", "3.0.14", "CWE-327", "Use of a Broken or Risky Cryptographic Algorithm"],
  ["libxml2", "2.11.4", "2.11.5", "CWE-776", "Improper Restriction of Recursive Entity References"],
  ["log4j-core", "2.17.1", "2.17.2", "CWE-502", "Deserialization of Untrusted Data"],
  ["fastjson", "1.2.83", "1.2.83", "CWE-502", "Deserialization of Untrusted Data"],
  ["jackson-databind", "2.14.0", "2.14.2", "CWE-502", "Deserialization of Untrusted Data"],
  ["curl", "8.3.0", "8.4.0", "CWE-319", "Cleartext Transmission of Sensitive Information"],
  ["glibc", "2.35", "2.36", "CWE-787", "Out-of-bounds Write"],
  ["busybox", "1.36.1", "1.36.1", "CWE-78", "Improper Neutralization of Special Elements"],
  ["openssl", "1.1.1w", "3.0.x", "CWE-1204", "Weak Initialization of RNG"],
  ["nginx", "1.25.3", "1.27.0", "CWE-400", "Uncontrolled Resource Consumption"],
  ["tomcat", "9.0.70", "9.0.83", "CWE-22", "Path Traversal"],
  ["sqlite3", "3.44.0", "3.45.1", "CWE-125", "Out-of-bounds Read"],
  ["libssl3", "3.0.11", "3.0.13", "CWE-326", "Inadequate Encryption Strength"],
  ["musl", "1.2.4", "1.2.5", "CWE-787", "Out-of-bounds Write"],
  ["python", "3.11.5", "3.11.7", "CWE-20", "Improper Input Validation"],
  ["node", "18.17.0", "20.11.0", "CWE-1333", "Inefficient Regular Expression"],
  ["libcurl4", "8.3.0", "8.5.0", "CWE-476", "NULL Pointer Dereference"],
  ["zlib", "1.2.13", "1.3", "CWE-190", "Integer Overflow"],
  ["openldap", "2.6.7", "2.6.8", "CWE-200", "Exposure of Sensitive Information"],
  ["apache2", "2.4.57", "2.4.60", "CWE-918", "Server-Side Request Forgery"],
  ["chromium", "121.0", "122.0", "CWE-1021", "Improper Restriction of Rendered UI Layers"],
  ["openssl", "3.1.0", "3.1.2", "CWE-327", "Use of a Broken or Risky Cryptographic Algorithm"],
  ["harfbuzz", "8.0.0", "8.1.0", "CWE-787", "Out-of-bounds Write"],
  ["icu", "74.1", "74.2", "CWE-190", "Integer Overflow"],
];

const STATUSES: VulnStatus[] = [
  "open",
  "open",
  "open",
  "investigating",
  "remediated",
  "accepted",
];

const REMEDIATIONS: Record<string, string> = {
  upgrade: "Upgrade the package to the fixed version and rebuild/redeploy the image.",
  patch: "Apply the upstream patch and validate with the service test suite.",
  mitigate: "Restrict network exposure and enforce the compensating control.",
  verify: "Confirm the fix in staging before promoting to production.",
};

export function createSecurityStore() {
  const rand = mulberry(20260131);
  const vulnerabilities: Vulnerability[] = PACKAGES.map(
    ([pkg, version, fixed, cwe, title], i) => {
      const severity =
        i % 7 === 0 ? "critical" : i % 3 === 0 ? "high" : i % 2 === 0 ? "medium" : "low";
      const cvss =
        severity === "critical"
          ? Number((9 + rand() * 1).toFixed(1))
          : severity === "high"
            ? Number((7 + rand() * 2).toFixed(1))
            : severity === "medium"
              ? Number((4 + rand() * 2).toFixed(1))
              : Number((2 + rand() * 1.5).toFixed(1));
      const reachability: Reachability =
        rand() > 0.62 ? "reachable" : rand() > 0.3 ? "present" : "unknown";
      const exploitAvailable = severity === "critical" || rand() > 0.75;
      const status = STATUSES[i % STATUSES.length];
      return {
        id: `CVE-2025-${String(1001 + i)}`,
        title,
        severity,
        cvss,
        cwe,
        package: pkg as string,
        version: version as string,
        fixedVersion: (fixed as string) === version ? undefined : (fixed as string),
        service: rand() > 0.3 ? SERVICES[i % SERVICES.length] : undefined,
        asset: rand() > 0.5 ? ASSETS[i % ASSETS.length] : undefined,
        image: IMAGES[i % IMAGES.length],
        reachability,
        exploitAvailable,
        discoveredAt: `2026-0${1 + (i % 9)}-${String(1 + (i % 27)).padStart(2, "0")}`,
        status,
        remediation:
          i % 3 === 0 ? REMEDIATIONS.upgrade : i % 3 === 1 ? REMEDIATIONS.patch : REMEDIATIONS.mitigate,
        acceptedReason: status === "accepted" ? "Compensating control in place; re-review next quarter." : undefined,
      };
    },
  );

  // SBOMs derived from images.
  const sboms: Sbom[] = IMAGES.slice(0, 6).map((image, ii) => {
    const entries: SbomEntry[] = PACKAGES.slice(ii * 3, ii * 3 + 6).map(
      ([pkg, version]) => {
        const linked = vulnerabilities.filter(
          (v) => v.package === pkg && v.status !== "remediated",
        );
        return {
          name: pkg as string,
          version: version as string,
          license: ["MIT", "Apache-2.0", "BSD-3-Clause", "GPL-2.0", "ISC", "MPL-2.0"][
            ii % 6
          ],
          purl: `pkg:generic/${pkg}@${version}`,
          type: (pkg as string).includes("openssl") || (pkg as string).includes("glibc")
            ? ("binary" as const)
            : ("library" as const),
          vulnerabilities: linked.map((l) => l.id),
        };
      },
    );
    return {
      id: `sbom-${ii}`,
      name: image,
      digest: `sha256:${(0x1000 + ii).toString(16)}${Math.floor(rand() * 1e12).toString(16)}`,
      generatedAt: `2026-10-${String(1 + ii).padStart(2, "0")}`,
      entries,
    };
  });

  const frameworks: ComplianceFramework[] = [
    {
      id: "soc2",
      name: "SOC 2 Type II",
      short: "SOC 2",
      score: 92,
      status: "compliant",
      updatedAt: "2026-10-12",
      controls: [
        { id: "CC6.1", name: "Logical access controls", status: "pass", evidence: "IAM policy review · zero drift in 90 days" },
        { id: "CC7.1", name: "System monitoring", status: "pass", evidence: "eBPF sensors streaming to SIEM" },
        { id: "CC7.3", name: "Security incident response", status: "warn", evidence: "Median detect 4m · target 5m" },
        { id: "A1.1", name: "Capacity management", status: "pass", evidence: "Headroom forecast within 10%" },
      ],
    },
    {
      id: "iso27001",
      name: "ISO/IEC 27001:2022",
      short: "ISO 27001",
      score: 86,
      status: "partial",
      updatedAt: "2026-10-08",
      controls: [
        { id: "A.8.25", name: "Secure development lifecycle", status: "warn", evidence: "SAST gate enabled in 6/8 pipelines" },
        { id: "A.8.28", name: "Secure coding", status: "pass", evidence: "Code review + SAST on all merges" },
        { id: "A.8.20", name: "Network security", status: "pass", evidence: "Zero-trust mesh enforced" },
        { id: "A.5.36", name: "Compliance review", status: "pass", evidence: "Quarterly review scheduled" },
      ],
    },
    {
      id: "hipaa",
      name: "HIPAA Security Rule",
      short: "HIPAA",
      score: 78,
      status: "partial",
      updatedAt: "2026-10-04",
      controls: [
        { id: "164.312", name: "Technical safeguards", status: "warn", evidence: "Encryption at rest verified for 92% of stores" },
        { id: "164.316", name: "Documentation", status: "pass", evidence: "Policies versioned & auditable" },
        { id: "164.308", name: "Administrative safeguards", status: "fail", evidence: "2 outstanding risk analyses overdue" },
        { id: "164.312(a)", name: "Access control", status: "pass", evidence: "JIT elevation with approval" },
      ],
    },
    {
      id: "pci",
      name: "PCI-DSS 4.0",
      short: "PCI-DSS",
      score: 95,
      status: "compliant",
      updatedAt: "2026-10-15",
      controls: [
        { id: "6.3", name: "Secure software", status: "pass", evidence: "SCA on all components" },
        { id: "11.3", name: "External vulnerability scans", status: "pass", evidence: "Weekly ASV scans" },
        { id: "10.2", name: "Audit logging", status: "pass", evidence: "Immutable audit trail" },
        { id: "8.2", name: "Authentication", status: "pass", evidence: "MFA on all admin access" },
      ],
    },
  ];

  const eventTemplates = [
    ["process", "critical", "Unexpected process spawn outside allowlist", "payments-svc"],
    ["network", "high", "Outbound connection to unlisted egress host", "api-gateway"],
    ["file", "medium", "Configuration drift detected on /etc/nginx", "config-svc"],
    ["auth", "high", "Failed privileged login attempt (3x)", "identity-svc"],
    ["process", "medium", "New binary observed in container", "ledger-svc"],
    ["network", "critical", "Lateral movement attempt to ledger-svc", "payments-svc"],
    ["file", "low", "World-writable file created", "search-svc"],
    ["auth", "medium", "Service account token refreshed outside window", "audit-svc"],
    ["config", "high", "Policy violation: public S3 bucket", "config-svc"],
    ["network", "medium", "DNS query to a new resolver", "cdn-edge"],
    ["process", "high", "Shell spawned from web runtime", "api-gateway"],
    ["file", "medium", "Sensitive file read by non-admin account", "notify-svc"],
    ["auth", "critical", "Brute-force against admin API", "identity-svc"],
    ["config", "low", "TLS certificate expiring in 14 days", "config-svc"],
  ];

  const events: RuntimeEvent[] = eventTemplates.map(
    ([kind, severity, description, source], i) => {
      const status: RuntimeEvent["status"] =
        severity === "critical" ? (i % 2 === 0 ? "new" : "investigating") : "allowed";
      return {
        id: `rt-${1000 + i}`,
        time: `2026-10-30 1${i % 10}:${String(i * 3 % 60).padStart(2, "0")}`,
        kind: kind as RuntimeEvent["kind"],
        severity: severity as Severity,
        description: description as string,
        source: source as string,
        status,
      };
    },
  );

  return { vulnerabilities, sboms, frameworks, events };
}

export function recomputePosture(vulnerabilities: Vulnerability[]): PostureSummary {
  const open = vulnerabilities.filter((v) => v.status !== "remediated");
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  let reachable = 0;
  let exploits = 0;
  for (const v of open) {
    counts[v.severity] += 1;
    if (v.reachability === "reachable") reachable += 1;
    if (v.exploitAvailable) exploits += 1;
  }
  // Higher exposure lowers posture score.
  const penalty = open.length * 3 + reachable * 2 + exploits * 3;
  const score = Math.max(12, Math.round(100 - penalty / 2));
  const rand = mulberry(7);
  const trend = Array.from({ length: 16 }, () => Math.max(20, Math.round(score + (rand() - 0.5) * 6)));
  return {
    score,
    ...counts,
    reachable,
    exploitAvailable: exploits,
    exposure: reachable + exploits * 2,
    trend,
  };
}

export function remediate(vulns: Vulnerability[], id: string): Vulnerability[] {
  return vulns.map((v) => (v.id === id ? { ...v, status: "remediated" } : v));
}

export function acceptRisk(
  vulns: Vulnerability[],
  id: string,
  reason: string,
): Vulnerability[] {
  return vulns.map((v) =>
    v.id === id ? { ...v, status: "accepted", acceptedReason: reason } : v,
  );
}

export function investigate(vulns: Vulnerability[], id: string): Vulnerability[] {
  return vulns.map((v) => (v.id === id ? { ...v, status: "investigating" } : v));
}

export const SEVERITY_TONE: Record<Severity, string> = {
  critical: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  low: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
};

export const STATUS_TONE: Record<VulnStatus, string> = {
  open: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  investigating: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  remediated: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  accepted: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
};

export const REACHABILITY_TONE: Record<Reachability, string> = {
  reachable: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  present: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  unknown: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
};
