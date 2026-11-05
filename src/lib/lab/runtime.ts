export interface MemoryPool { name: string; used: number; committed: number; max: number }
export interface GcEvent { at: string; collector: string; cause: string; durationMs: number; beforeBytes: number; afterBytes: number }
export interface RuntimeSnapshot {
  service: 'accounting' | 'assets'; language: 'java' | 'go'; source: 'demo' | 'live'; available: boolean;
  sampledAt: string; uptimeMs: number; heapUsed: number; heapCommitted: number; heapMax: number;
  nonHeapUsed: number; threads: number; cpuPercent: number; allocationBytes: number;
  gcCount: number; gcTimeMs: number; pools: MemoryPool[]; events: GcEvent[]; collectors: { name: string; count: number; timeMs: number }[];
  runtimeVersion: string; error?: string;
}
const MiB = 1024 * 1024;
export function demoRuntime(service: 'accounting' | 'assets', tick: number, pressure = false): RuntimeSnapshot {
  const java = service === 'accounting';
  const phase = tick % 24;
  const heapMax = (java ? 256 : 128) * MiB;
  const heapUsed = Math.round((java ? 48 + phase * 4.7 : 12 + phase * 2.1) * MiB + (pressure ? 28 * MiB : 0));
  const gcCount = 12 + Math.floor(tick / 24);
  const reclaimed = Math.round((java ? 86 : 48) * MiB);
  const at = new Date(Date.now() - (tick % 24) * 2000).toISOString();
  return {
    service, language: java ? 'java' : 'go', source: 'demo', available: true, sampledAt: new Date().toISOString(),
    uptimeMs: 1260000 + tick * 2000, heapUsed, heapCommitted: (java ? 192 : 80) * MiB, heapMax,
    nonHeapUsed: (java ? 57 : 8) * MiB, threads: java ? 26 + tick % 3 : 14 + tick % 5,
    cpuPercent: Number((8 + 12 * Math.abs(Math.sin(tick / 5)) + (pressure ? 22 : 0)).toFixed(1)),
    allocationBytes: tick * 19 * MiB, gcCount, gcTimeMs: gcCount * (java ? 8.4 : 1.2),
    pools: java ? [
      { name: 'G1 Eden Space', used: heapUsed * .66, committed: 96 * MiB, max: -1 },
      { name: 'G1 Survivor Space', used: 12 * MiB, committed: 16 * MiB, max: -1 },
      { name: 'G1 Old Gen', used: heapUsed * .34, committed: 80 * MiB, max: heapMax },
      { name: 'Metaspace', used: 43 * MiB, committed: 48 * MiB, max: -1 },
    ] : [
      { name: 'Heap in use', used: heapUsed * .7, committed: 56 * MiB, max: -1 },
      { name: 'Heap idle', used: heapUsed * .3, committed: 24 * MiB, max: -1 },
      { name: 'Stacks', used: 3 * MiB, committed: 3 * MiB, max: -1 },
      { name: 'Runtime metadata', used: 5 * MiB, committed: 5 * MiB, max: -1 },
    ],
    events: phase < 3 ? [{ at, collector: java ? 'G1 Young Generation' : 'Go concurrent mark/sweep', cause: pressure ? 'allocation pressure' : java ? 'G1 Evacuation Pause' : 'heap growth', durationMs: java ? 7 + tick % 8 : .4 + tick % 3 * .2, beforeBytes: heapUsed + reclaimed, afterBytes: heapUsed }] : [],
    collectors: [{ name: java ? 'G1 Young Generation' : 'Go GC', count: gcCount, timeMs: gcTimeFor(gcCount, java) }],
    runtimeVersion: java ? 'Illustrative JVM 21 · G1' : 'Illustrative Go runtime',
  };
}
function gcTimeFor(count: number, java: boolean) { return Number((count * (java ? 8.4 : 1.2)).toFixed(2)); }
