// Deterministic demo data + a tiny "engine" model for the Docker Desktop module.
// The module is always demoable; a real `docker` integration would replace
// createDockerStore() with a call to the engine (see src/app/api/cli).

export type ContainerStatus = "running" | "exited" | "paused" | "created" | "restarting";

export interface Container {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  state: "Running" | "Exited" | "Paused" | "Created" | "Restarting";
  ports: string[];
  cpu: number;
  memMb: number;
  uptime: string;
  command: string;
}

export interface Image {
  id: string;
  repo: string;
  tag: string;
  sizeMb: number;
  created: string;
  containers: number;
  dangling: boolean;
}

export interface Volume {
  name: string;
  driver: string;
  sizeMb: number;
  inUse: number;
}

export interface Network {
  name: string;
  driver: string;
  scope: string;
  containers: number;
}

export interface ComposeService {
  name: string;
  image: string;
  status: ContainerStatus;
  desired: "running" | "stopped";
}

export interface ComposeProject {
  name: string;
  path: string;
  status: "running" | "stopped" | "starting";
  services: ComposeService[];
}

export interface DockerEngine {
  name: string;
  version: string;
  os: string;
  cpuPct: number;
  memPct: number;
  memUsedMb: number;
  memLimitMb: number;
  ioReadMb: number;
  ioWriteMb: number;
  networks: number;
}

const statuses: ContainerStatus[] = [
  "running",
  "running",
  "running",
  "running",
  "running",
  "running",
  "exited",
  "exited",
  "paused",
  "created",
];

export function createDockerStore() {
  const containers: Container[] = [
    ["web-edge-nginx", "nginx:1.27-alpine", "80/tcp, 443/tcp"],
    ["api-gateway", "node:22-alpine", "3000/tcp"],
    ["api-users", "node:22-alpine", "3001/tcp"],
    ["api-billing", "node:22-alpine", "3002/tcp"],
    ["workers-queue", "python:3.12-slim", "—"],
    ["postgres-primary", "postgres:16.4", "5432/tcp"],
    ["redis-cache", "redis:7.4-alpine", "6379/tcp"],
    ["metrics-agent", "grafana/prom-agent:latest", "9101/tcp"],
    ["log-shipper", "fluent/fluent-bit:3.2", "—"],
    ["batch-etl", "python:3.12-slim", "—"],
  ].map(([name, image, ports], i) => {
    const status = statuses[i % statuses.length];
    return {
      id: `c${100 + i}`,
      name: name as string,
      image: image as string,
      status,
      state:
        status === "running"
          ? ("Running" as const)
          : status === "exited"
            ? ("Exited" as const)
            : status === "paused"
              ? ("Paused" as const)
              : status === "created"
                ? ("Created" as const)
                : ("Restarting" as const),
      ports: (ports as string).split(", ").filter((p) => p !== "—"),
      cpu: Number((Math.random() * 18 + 0.4).toFixed(1)),
      memMb: Math.round(Math.random() * 480 + 18),
      uptime: status === "running" ? `${Math.floor(Math.random() * 240)}h${Math.floor(Math.random() * 60)}m` : "—",
      command: image.includes("python")
        ? "python -m etl.pipeline --loop"
        : image.includes("postgres")
          ? "postgres -c config_file=/etc/postgresql/postgresql.conf"
          : image.includes("redis")
            ? "redis-server *:6379"
            : "node server.js",
    };
  });

  const images: Image[] = [
    ["nginx", "1.27-alpine", 41],
    ["node", "22-alpine", 134],
    ["python", "3.12-slim", 149],
    ["postgres", "16.4", 428],
    ["redis", "7.4-alpine", 32],
    ["grafana/prom-agent", "latest", 58],
    ["fluent/fluent-bit", "3.2", 66],
    ["alpine", "latest", 8],
    ["traefik", "v3.2", 104],
  ].map(([repo, tag, size], i) => ({
    id: `sha256:${i}${i}${i}${i}${i}${i}${i}${i}`,
    repo: repo as string,
    tag: tag as string,
    sizeMb: size as number,
    created: `${1 + (i % 12)} months ago`,
    containers: i < 4 ? 1 : i % 3,
    dangling: i === 8,
  }));

  const volumes: Volume[] = [
    ["pg_primary_data", "local", 10240, 6],
    ["pg_wal", "local", 2048, 2],
    ["redis_dump", "local", 16, 1],
    ["fluent_buffer", "local", 256, 1],
    ["compose_default", "local", 64, 0],
  ].map(([name, driver, sizeMb, inUse]) => ({
    name: String(name),
    driver: String(driver),
    sizeMb: Number(sizeMb),
    inUse: Number(inUse),
  }));

  const networks: Network[] = [
    ["bridge", "bridge", "local", 4],
    ["app_net", "bridge", "local", 5],
    ["db_net", "bridge", "local", 2],
    ["ingress", "overlay", "swarm", 0],
    ["host", "host", "local", 0],
  ].map(([name, driver, scope, containers]) => ({
    name: String(name),
    driver: String(driver),
    scope: String(scope),
    containers: Number(containers),
  }));

  const compose: ComposeProject[] = [
    {
      name: "payments-stack",
      path: "/srv/apps/payments",
      status: "running",
      services: [
        { name: "gateway", image: "node:22-alpine", status: "running", desired: "running" },
        { name: "billing", image: "node:22-alpine", status: "running", desired: "running" },
        { name: "postgres", image: "postgres:16.4", status: "running", desired: "running" },
      ],
    },
    {
      name: "observability",
      path: "/srv/apps/observability",
      status: "running",
      services: [
        { name: "prom-agent", image: "grafana/prom-agent:latest", status: "running", desired: "running" },
        { name: "fluent-bit", image: "fluent/fluent-bit:3.2", status: "exited", desired: "running" },
      ],
    },
    {
      name: "batch",
      path: "/srv/apps/batch",
      status: "stopped",
      services: [
        { name: "etl", image: "python:3.12-slim", status: "exited", desired: "stopped" },
      ],
    },
  ];

  const engine: DockerEngine = {
    name: "Docker Desktop",
    version: "4.43.0",
    os: "linux/amd64",
    cpuPct: 12.4,
    memPct: 34.2,
    memUsedMb: 2180,
    memLimitMb: 6400,
    ioReadMb: 12.8,
    ioWriteMb: 6.4,
    networks: networks.length,
  };

  return { containers, images, volumes, networks, compose, engine, seed: 42 };
}

export function jitterEngine(engine: DockerEngine): DockerEngine {
  const delta = () => (Math.random() - 0.5) * 4;
  return {
    ...engine,
    cpuPct: Math.max(0.4, Number((engine.cpuPct + delta()).toFixed(1))),
    memPct: Math.min(96, Math.max(8, Number((engine.memPct + delta() / 2).toFixed(1)))),
    memUsedMb: Math.round(engine.memLimitMb * (engine.memPct / 100)),
    ioReadMb: Number((engine.ioReadMb + delta()).toFixed(1)),
    ioWriteMb: Number((engine.ioWriteMb + delta()).toFixed(1)),
  };
}

export function jitterContainers(containers: Container[]): Container[] {
  return containers.map((c) =>
    c.status === "running"
      ? {
          ...c,
          cpu: Number(Math.max(0.1, Math.min(64, c.cpu + (Math.random() - 0.5) * 2)).toFixed(1)),
          memMb: Math.max(8, Math.round(c.memMb + (Math.random() - 0.5) * 12)),
        }
      : c,
  );
}

export function setContainerStatus(
  containers: Container[],
  id: string,
  status: ContainerStatus,
): Container[] {
  const stateMap: Record<ContainerStatus, Container["state"]> = {
    running: "Running",
    exited: "Exited",
    paused: "Paused",
    created: "Created",
    restarting: "Restarting",
  };
  return containers.map((c) =>
    c.id === id
      ? {
          ...c,
          status,
          state: stateMap[status],
          uptime: status === "running" ? "0m" : "—",
        }
      : c,
  );
}

export function composeAction(
  projects: ComposeProject[],
  name: string,
  action: "up" | "down",
): ComposeProject[] {
  return projects.map((p) =>
    p.name === name
      ? {
          ...p,
          status: action === "up" ? "starting" : "stopped",
          services: p.services.map((s) =>
            action === "up"
              ? { ...s, status: "restarting", desired: "running" }
              : { ...s, status: "exited", desired: "stopped" },
          ),
        }
      : p,
  );
}

export const CONTAINER_STATUS_TONE: Record<ContainerStatus, string> = {
  running: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  exited: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  paused: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  created: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  restarting: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30",
};
