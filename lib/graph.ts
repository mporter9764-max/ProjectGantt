import type { Task, Dependency } from "./types";
import { daysBetween, todayStr } from "./dates";

/** deps as adjacency maps: upOf[t] = tasks t depends on; downOf[t] = tasks depending on t */
export function buildAdjacency(deps: Dependency[]) {
  const upOf = new Map<string, string[]>();
  const downOf = new Map<string, string[]>();
  for (const d of deps) {
    upOf.set(d.task_id, [...(upOf.get(d.task_id) ?? []), d.depends_on_id]);
    downOf.set(d.depends_on_id, [...(downOf.get(d.depends_on_id) ?? []), d.task_id]);
  }
  return { upOf, downOf };
}

function collect(start: string, adj: Map<string, string[]>): Set<string> {
  const out = new Set<string>();
  const stack = [...(adj.get(start) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
  return out;
}

/** Everything that must finish before `taskId` (transitive inputs). */
export function upstreamOf(taskId: string, deps: Dependency[]): Set<string> {
  return collect(taskId, buildAdjacency(deps).upOf);
}

/** Everything downstream of `taskId` (transitively depends on it). */
export function downstreamOf(taskId: string, deps: Dependency[]): Set<string> {
  return collect(taskId, buildAdjacency(deps).downOf);
}

/** Task ids that `taskId` may legally depend on (no self, no cycles). */
export function legalDependencyTargets(taskId: string, all: Task[], deps: Dependency[]): Task[] {
  const down = downstreamOf(taskId, deps);
  return all.filter((t) => t.id !== taskId && !down.has(t.id));
}

/** duration in days (min 1; milestones count as 1) */
function dur(t: Task): number {
  if (!t.end_date) return 1;
  return daysBetween(t.start_date, t.end_date) + 1;
}

/**
 * Critical path: the dependency chain with the greatest total duration.
 * Simple longest-path over the DAG (no scheduling math — informational).
 * Returns the set of task ids on that chain, in order.
 */
export function criticalPath(tasks: Task[], deps: Dependency[]): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const { upOf } = buildAdjacency(deps);
  const memo = new Map<string, { len: number; path: string[] }>();

  function best(id: string): { len: number; path: string[] } {
    const hit = memo.get(id);
    if (hit) return hit;
    const t = byId.get(id);
    if (!t) return { len: 0, path: [] };
    memo.set(id, { len: dur(t), path: [id] }); // guard against cycles
    let bestUp = { len: 0, path: [] as string[] };
    for (const up of upOf.get(id) ?? []) {
      const r = best(up);
      if (r.len > bestUp.len) bestUp = r;
    }
    const res = { len: dur(t) + bestUp.len, path: [...bestUp.path, id] };
    memo.set(id, res);
    return res;
  }

  let overall = { len: 0, path: [] as string[] };
  for (const t of tasks) {
    const r = best(t.id);
    if (r.len > overall.len) overall = r;
  }
  return overall.path;
}

/** Blocked: incomplete task with at least one incomplete dependency. */
export function blockedIds(tasks: Task[], deps: Dependency[]): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const { upOf } = buildAdjacency(deps);
  const out = new Set<string>();
  for (const t of tasks) {
    if (t.is_complete) continue;
    const ups = upOf.get(t.id) ?? [];
    if (ups.some((u) => byId.get(u) && !byId.get(u)!.is_complete)) out.add(t.id);
  }
  return out;
}

/** Ready to start: incomplete, has dependencies, and ALL of them are complete. */
export function readyIds(tasks: Task[], deps: Dependency[]): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const { upOf } = buildAdjacency(deps);
  const out = new Set<string>();
  for (const t of tasks) {
    if (t.is_complete) continue;
    const ups = upOf.get(t.id) ?? [];
    if (ups.length > 0 && ups.every((u) => byId.get(u)?.is_complete)) out.add(t.id);
  }
  return out;
}

export type Digest = {
  ready: Task[]; blocked: Task[]; overdue: Task[]; atRisk: Task[];
  startingSoon: Task[]; finishingSoon: Task[];
};

export function computeDigest(tasks: Task[], deps: Dependency[]): Digest {
  const today = todayStr();
  const ready = readyIds(tasks, deps);
  const blocked = blockedIds(tasks, deps);
  const active = tasks.filter((t) => !t.is_complete);
  const within = (d: string, n: number) => {
    const diff = daysBetween(today, d);
    return diff >= 0 && diff <= n;
  };
  return {
    ready: active.filter((t) => ready.has(t.id)),
    blocked: active.filter((t) => blocked.has(t.id)),
    overdue: active.filter((t) => daysBetween(today, t.end_date ?? t.start_date) < 0),
    atRisk: active.filter((t) => t.at_risk),
    startingSoon: active.filter((t) => within(t.start_date, 7)),
    finishingSoon: active.filter((t) => t.end_date != null && within(t.end_date, 7)),
  };
}
