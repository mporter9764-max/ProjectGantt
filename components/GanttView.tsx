"use client";

import { useMemo, useRef, useState } from "react";
import type { Task, Group, Owner, Dependency } from "@/lib/types";
import {
  eachDay, todayStr, addDays, daysBetween, weekday, isToday, isWeekend, parseYMD, monthName,
} from "@/lib/dates";
import { deepen, solidTint, tint } from "@/lib/colors";
import { upstreamOf, downstreamOf, criticalPath, blockedIds } from "@/lib/graph";
import { Diamond, Plus } from "./icons";

const LABEL_W = 150;
const BAR_H = 18;
const SUB_H = 10;
const LANE_PAD = 8;

type Pivot = "group" | "owner";
type DragState = {
  taskId: string; mode: "move" | "start" | "end";
  originX: number; origStart: string; origEnd: string | null; moved: boolean;
};

export type GanttProps = {
  tasks: Task[];
  groups: Group[];
  owners: Owner[];
  deps: Dependency[];
  pivot: Pivot;
  dayW: number;
  showCritical: boolean;
  showCallouts: boolean;
  collapsed: Set<string>;           // group/owner ids collapsed
  ownerFilter: Set<string>;         // empty = all
  selectedId: string | null;
  windowSel: { a: string; b: string } | null;
  onToggleCollapse: (rowId: string) => void;
  onSelect: (taskId: string | null) => void;
  onEdit: (task: Task) => void;
  onAddTask: (groupId?: string) => void;
  onCommitDates: (taskId: string, start: string, end: string | null) => void;
  onWindowSelect: (sel: { a: string; b: string } | null) => void;
};

type RowDef = { id: string; name: string; color: string };
type Placed = { t: Task; x1: number; x2: number; y: number; h: number; sub: boolean };

export function GanttView(props: GanttProps) {
  const {
    tasks, groups, owners, deps, pivot, dayW, showCritical, showCallouts,
    collapsed, ownerFilter, selectedId, windowSel,
    onToggleCollapse, onSelect, onEdit, onAddTask, onCommitDates, onWindowSelect,
  } = props;

  const today = todayStr();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<{ id: string; start: string; end: string | null } | null>(null);
  const axisDragRef = useRef<{ startDay: string } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // ---- date range ----
  const { rangeStart, days } = useMemo(() => {
    let min = today, max = today;
    for (const t of tasks) {
      if (daysBetween(t.start_date, min) > 0) min = t.start_date;
      const end = t.end_date ?? t.start_date;
      if (daysBetween(max, end) > 0) max = end;
    }
    const start = addDays(min, -3);
    return { rangeStart: start, days: eachDay(start, addDays(max, 7)) };
  }, [tasks, today]);

  const gridW = days.length * dayW;

  const monthSegments = useMemo(() => {
    const segs: { key: string; label: string; count: number }[] = [];
    for (const day of days) {
      const label = `${monthName(day)} ${parseYMD(day).getFullYear()}`;
      const last = segs[segs.length - 1];
      if (last && last.label === label) last.count += 1;
      else segs.push({ key: day, label, count: 1 });
    }
    return segs;
  }, [days]);

  // ---- selection / critical / blocked sets ----
  const chain = useMemo(() => {
    if (!selectedId) return null;
    return { up: upstreamOf(selectedId, deps), down: downstreamOf(selectedId, deps) };
  }, [selectedId, deps]);

  const critical = useMemo(
    () => (showCritical ? new Set(criticalPath(tasks.filter((t) => !t.is_complete), deps)) : new Set<string>()),
    [showCritical, tasks, deps]
  );
  const blocked = useMemo(() => blockedIds(tasks, deps), [tasks, deps]);

  // ---- effective dates (drag preview overrides) ----
  function eff(t: Task): { start: string; end: string | null } {
    if (preview && preview.id === t.id) return { start: preview.start, end: preview.end };
    return { start: t.start_date, end: t.end_date };
  }

  // ---- rows + layout ----
  const rows: RowDef[] = useMemo(() => {
    if (pivot === "group") return groups.map((g) => ({ id: g.id, name: g.name, color: g.color }));
    const list: RowDef[] = owners.map((o) => ({ id: o.id, name: o.name, color: o.color }));
    list.push({ id: "__none__", name: "Unassigned", color: "#D8DCE3" });
    return list;
  }, [pivot, groups, owners]);

  type RowLayout = { row: RowDef; y: number; height: number; placed: Placed[]; count: number; span: { x1: number; x2: number } | null };

  const layout: { rowLayouts: RowLayout[]; totalH: number; taskPos: Map<string, Placed> } = useMemo(() => {
    const rowLayouts: RowLayout[] = [];
    const taskPos = new Map<string, Placed>();
    let y = 0;

    const xOf = (d: string) => daysBetween(rangeStart, d) * dayW;

    for (const row of rows) {
      const rowTasks = tasks.filter((t) =>
        pivot === "group" ? t.group_id === row.id : (t.owner_id ?? "__none__") === row.id
      );
      // In group pivot, subtasks render on their parent's lane; in owner pivot all are top-level.
      const topTasks = pivot === "group" ? rowTasks.filter((t) => !t.parent_id || !rowTasks.some((p) => p.id === t.parent_id)) : rowTasks;
      const childrenOf = (id: string) => (pivot === "group" ? rowTasks.filter((t) => t.parent_id === id) : []);

      const isCollapsed = collapsed.has(row.id);
      const placed: Placed[] = [];

      if (isCollapsed) {
        let span: { x1: number; x2: number } | null = null;
        for (const t of rowTasks) {
          const e = eff(t);
          const x1 = xOf(e.start);
          const x2 = xOf(e.end ?? e.start) + dayW;
          if (!span) span = { x1, x2 };
          else { span.x1 = Math.min(span.x1, x1); span.x2 = Math.max(span.x2, x2); }
        }
        const height = 26;
        rowLayouts.push({ row, y, height, placed, count: rowTasks.length, span });
        y += height;
        continue;
      }

      // lane packing of top-level tasks
      const sorted = [...topTasks].sort((a, b) => daysBetween(eff(b).start, eff(a).start));
      const lanes: { end: string; items: Task[] }[] = [];
      const laneOf = new Map<string, number>();
      for (const t of sorted) {
        const e = eff(t);
        const endD = e.end ?? e.start;
        let idx = lanes.findIndex((l) => daysBetween(l.end, e.start) > 0);
        if (idx === -1) { lanes.push({ end: endD, items: [t] }); idx = lanes.length - 1; }
        else { lanes[idx].items.push(t); lanes[idx].end = endD; }
        laneOf.set(t.id, idx);
      }

      // per-lane heights depend on whether any task in it has subtasks
      const laneHeights: number[] = lanes.map((l) =>
        l.items.some((t) => childrenOf(t.id).length > 0) ? BAR_H + 4 + SUB_H : BAR_H
      );
      const laneY: number[] = [];
      let acc = LANE_PAD;
      for (const h of laneHeights) { laneY.push(acc); acc += h + LANE_PAD; }
      const height = Math.max(acc, 34);

      for (const t of topTasks) {
        const e = eff(t);
        const li = laneOf.get(t.id) ?? 0;
        const p: Placed = {
          t, x1: xOf(e.start), x2: xOf(e.end ?? e.start) + dayW,
          y: y + laneY[li], h: BAR_H, sub: false,
        };
        placed.push(p);
        taskPos.set(t.id, p);
        for (const c of childrenOf(t.id)) {
          const ce = eff(c);
          const cp: Placed = {
            t: c, x1: xOf(ce.start), x2: xOf(ce.end ?? ce.start) + dayW,
            y: y + laneY[li] + BAR_H + 4, h: SUB_H, sub: true,
          };
          placed.push(cp);
          taskPos.set(c.id, cp);
        }
      }

      rowLayouts.push({ row, y, height, placed, count: rowTasks.length, span: null });
      y += height;
    }

    return { rowLayouts, totalH: y, taskPos };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tasks, pivot, collapsed, rangeStart, dayW, preview]);

  // ---- drag handlers ----
  function startDrag(e: React.PointerEvent, t: Task, mode: DragState["mode"]) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ taskId: t.id, mode, originX: e.clientX, origStart: t.start_date, origEnd: t.end_date, moved: false });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const dxDays = Math.round((e.clientX - drag.originX) / dayW);
    if (dxDays === 0 && !drag.moved) return;
    let start = drag.origStart;
    let end = drag.origEnd;
    if (drag.mode === "move") {
      start = addDays(drag.origStart, dxDays);
      end = drag.origEnd ? addDays(drag.origEnd, dxDays) : null;
    } else if (drag.mode === "start") {
      start = addDays(drag.origStart, dxDays);
      const limit = drag.origEnd ?? drag.origStart;
      if (daysBetween(start, limit) < 0) start = limit;
    } else {
      const newEnd = addDays(drag.origEnd ?? drag.origStart, dxDays);
      end = daysBetween(drag.origStart, newEnd) < 0 ? drag.origStart : newEnd;
    }
    setDrag({ ...drag, moved: true });
    setPreview({ id: drag.taskId, start, end });
  }

  function onPointerUp() {
    if (drag && drag.moved && preview) {
      onCommitDates(drag.taskId, preview.start, preview.end);
    } else if (drag && !drag.moved) {
      const t = tasks.find((x) => x.id === drag.taskId);
      if (t) onSelect(selectedId === t.id ? null : t.id);
    }
    setDrag(null);
    setPreview(null);
  }

  // ---- axis window selection ----
  function dayAtClientX(clientX: number): string | null {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const x = clientX - rect.left + grid.scrollLeft - LABEL_W;
    const idx = Math.floor(x / dayW);
    if (idx < 0 || idx >= days.length) return null;
    return days[idx];
  }
  function axisDown(e: React.PointerEvent) {
    const d = dayAtClientX(e.clientX);
    if (!d) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    axisDragRef.current = { startDay: d };
    onWindowSelect({ a: d, b: d });
  }
  function axisMove(e: React.PointerEvent) {
    if (!axisDragRef.current) return;
    const d = dayAtClientX(e.clientX);
    if (!d) return;
    const a = axisDragRef.current.startDay;
    onWindowSelect(daysBetween(a, d) >= 0 ? { a, b: d } : { a: d, b: a });
  }
  function axisUp() { axisDragRef.current = null; }

  // ---- visual state helpers ----
  const dimForChain = (id: string) =>
    chain != null && id !== selectedId && !chain.up.has(id) && !chain.down.has(id);
  const dimForOwner = (t: Task) =>
    ownerFilter.size > 0 && !ownerFilter.has(t.owner_id ?? "__none__");

  function barStyle(p: Placed, rowColor: string) {
    const t = p.t;
    const color = pivot === "group"
      ? rowColor
      : (groups.find((g) => g.id === t.group_id)?.color ?? rowColor);
    const dim = dimForChain(t.id) || dimForOwner(t);
    const isSel = t.id === selectedId;
    const inUp = chain?.up.has(t.id);
    const inDown = chain?.down.has(t.id);
    const isCrit = critical.has(t.id);
    let border = deepen(color, 0.85);
    let ring = "";
    if (isCrit) { border = "#DC2626"; ring = "0 0 0 1.5px #DC2626"; }
    if (inUp) ring = "0 0 0 2px #D97706";
    if (inDown) ring = "0 0 0 2px #2563EB";
    if (isSel) ring = "0 0 0 2.5px #1F2933";
    return {
      backgroundColor: t.is_complete ? "#E8EAEE" : color,
      border: `1px solid ${t.at_risk && !t.is_complete ? "#D97706" : border}`,
      boxShadow: ring || undefined,
      opacity: dim ? 0.22 : 1,
    } as React.CSSProperties;
  }

  const windowX = windowSel
    ? {
        x1: daysBetween(rangeStart, windowSel.a) * dayW,
        x2: (daysBetween(rangeStart, windowSel.b) + 1) * dayW,
      }
    : null;

  // ---- arrows ----
  const arrows = useMemo(() => {
    const out: { d: Dependency; from: Placed; to: Placed }[] = [];
    for (const d of deps) {
      const from = layout.taskPos.get(d.depends_on_id);
      const to = layout.taskPos.get(d.task_id);
      if (from && to) out.push({ d, from, to });
    }
    return out;
  }, [deps, layout]);

  function arrowColor(a: { d: Dependency }) {
    if (!chain || !selectedId) {
      if (critical.size > 0 && critical.has(a.d.task_id) && critical.has(a.d.depends_on_id)) return "#DC2626";
      return "#C4C9D1";
    }
    const rel = (id: string) => id === selectedId || chain.up.has(id) || chain.down.has(id);
    if (!rel(a.d.task_id) || !rel(a.d.depends_on_id)) return "rgba(196,201,209,0.25)";
    const upSide = chain.up.has(a.d.depends_on_id) || a.d.task_id === selectedId
      ? (a.d.task_id === selectedId || chain.up.has(a.d.task_id)) : false;
    return upSide ? "#D97706" : "#2563EB";
  }

  const todayX = daysBetween(rangeStart, today) * dayW;

  return (
    <div ref={gridRef} className="h-full overflow-auto scroll-thin" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <div style={{ width: LABEL_W + gridW }} className="min-w-full">
        {/* Month band + day axis */}
        <div className="sticky top-0 z-30 bg-canvas/95 backdrop-blur">
          <div className="flex">
            <div className="sticky left-0 z-40 flex-none bg-canvas" style={{ width: LABEL_W }} />
            {monthSegments.map((seg, i) => (
              <div key={seg.key}
                className="flex-none overflow-hidden whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted"
                style={{ width: seg.count * dayW, borderLeft: i === 0 ? "none" : "1px solid #E7E9EE" }}>
                {seg.label}
              </div>
            ))}
          </div>
          <div className="flex touch-none" onPointerDown={axisDown} onPointerMove={axisMove} onPointerUp={axisUp}>
            <div className="sticky left-0 z-40 flex-none border-b border-line bg-canvas" style={{ width: LABEL_W }}>
              <p className="px-3 pb-1 text-[10px] text-faint">drag dates to focus ↴</p>
            </div>
            {days.map((day) => (
              <div key={day}
                className={`flex-none cursor-crosshair border-b border-line py-1 text-center select-none ${isWeekend(day) ? "bg-black/[0.02]" : ""}`}
                style={{ width: dayW }}>
                {dayW >= 22 && (
                  <div className={`text-[9px] uppercase ${isToday(day) ? "font-bold text-accent" : "text-faint"}`}>{weekday(day)}</div>
                )}
                <div className={`text-[11px] ${isToday(day) ? "font-bold text-accent" : "text-muted"}`}>{parseYMD(day).getDate()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="relative" style={{ height: layout.totalH }}>
          {/* column shading + today + window */}
          <div className="absolute inset-y-0" style={{ left: LABEL_W, width: gridW }}>
            {days.map((day, i) =>
              isWeekend(day) ? (
                <div key={day} className="absolute inset-y-0 bg-black/[0.015]" style={{ left: i * dayW, width: dayW }} />
              ) : null
            )}
            {windowX && (
              <div className="absolute inset-y-0 bg-accent/[0.06] ring-1 ring-inset ring-accent/30"
                style={{ left: windowX.x1, width: windowX.x2 - windowX.x1 }} />
            )}
            <div className="absolute inset-y-0 w-px bg-accent/70" style={{ left: todayX + dayW / 2 }} />
          </div>

          {/* rows */}
          {layout.rowLayouts.map(({ row, y, height, placed, count, span }) => (
            <div key={row.id}>
              <div className="absolute border-b border-line" style={{ top: y, height, left: 0, right: 0 }} />
              {/* sticky label */}
              <div className="group/lbl sticky left-0 z-20 absolute flex flex-col justify-center px-3"
                style={{ top: y, height, width: LABEL_W, backgroundColor: solidTint(row.color), position: "absolute" }}>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => onToggleCollapse(row.id)}
                    className="text-xs text-muted hover:text-ink" title={collapsed.has(row.id) ? "Expand" : "Collapse"}>
                    {collapsed.has(row.id) ? "▸" : "▾"}
                  </button>
                  <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: deepen(row.color) }} />
                  <span className="truncate text-sm font-medium text-ink">{row.name}</span>
                  {pivot === "group" && (
                    <button aria-label={`Add task to ${row.name}`} onClick={() => onAddTask(row.id)}
                      className="ml-auto flex h-5 w-5 flex-none items-center justify-center rounded-full text-muted opacity-0 hover:bg-black/[0.08] hover:text-ink group-hover/lbl:opacity-100">
                      <Plus width={12} height={12} />
                    </button>
                  )}
                </div>
                <span className="pl-5 text-[11px] text-muted">{count} task{count === 1 ? "" : "s"}</span>
              </div>

              {/* collapsed span line */}
              {span && (
                <div className="absolute rounded-full"
                  style={{ top: y + 11, height: 4, left: LABEL_W + span.x1, width: Math.max(span.x2 - span.x1, 6), backgroundColor: deepen(row.color, 0.8), opacity: 0.6 }} />
              )}

              {/* bars */}
              {placed.map((p) => {
                const t = p.t;
                const style = barStyle(p, row.color);
                if (t.is_milestone) {
                  const size = p.sub ? 12 : 16;
                  return (
                    <button key={t.id}
                      onPointerDown={(e) => startDrag(e, t, "move")}
                      onDoubleClick={() => onEdit(t)}
                      title={t.title}
                      className="absolute z-10 flex touch-none items-center"
                      style={{ left: LABEL_W + p.x1 + dayW / 2 - size / 2, top: p.y + (p.h - size) / 2, opacity: style.opacity }}>
                      <Diamond width={size} height={size}
                        style={{ color: t.is_complete ? "#9AA1AC" : deepen(row.color, 0.6), fill: t.is_complete ? "#E8EAEE" : (style.backgroundColor as string) }} />
                      {dayW >= 14 && (
                        <span className={`ml-1 whitespace-nowrap text-[11px] font-medium ${t.is_complete ? "text-faint line-through" : "text-ink"}`}
                          style={{ opacity: style.opacity }}>
                          {t.title}
                        </span>
                      )}
                    </button>
                  );
                }
                const w = Math.max(p.x2 - p.x1 - 2, 8);
                return (
                  <div key={t.id} className="absolute z-10 touch-none"
                    style={{ left: LABEL_W + p.x1 + 1, top: p.y, width: w }}>
                    <div
                      role="button"
                      onPointerDown={(e) => startDrag(e, t, "move")}
                      onDoubleClick={() => onEdit(t)}
                      title={`${t.title} (tap to trace, double-tap to edit)`}
                      className={`relative cursor-grab rounded-[4px] shadow-card ${p.sub ? "" : ""}`}
                      style={{ ...style, height: p.h }}>
                      {/* resize handles */}
                      {!p.sub && (
                        <>
                          <div onPointerDown={(e) => startDrag(e, t, "start")}
                            className="absolute inset-y-0 left-0 w-2 cursor-col-resize" />
                          <div onPointerDown={(e) => startDrag(e, t, "end")}
                            className="absolute inset-y-0 right-0 w-2 cursor-col-resize" />
                        </>
                      )}
                      {t.callout && !showCallouts && (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-surface bg-amber-400" />
                      )}
                      {blocked.has(t.id) && (
                        <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full border border-surface bg-red-500" />
                      )}
                    </div>
                    {/* label to the right of the bar */}
                    <div className={`pointer-events-none mt-[1px] truncate text-[11px] font-medium leading-tight ${t.is_complete ? "text-faint line-through" : "text-ink"}`}
                      style={{ opacity: style.opacity, maxWidth: Math.max(w, 160) }}>
                      {p.sub && <span className="text-faint">↳ </span>}{t.title}
                    </div>
                    {showCallouts && t.callout && (
                      <div className="pointer-events-none mt-0.5 max-w-[240px] truncate rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800 ring-1 ring-amber-200"
                        style={{ opacity: style.opacity }}>
                        {t.callout}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* dependency arrows */}
          <svg className="pointer-events-none absolute inset-0 z-[5]" width={LABEL_W + gridW} height={layout.totalH}>
            <defs>
              <marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill="context-stroke" />
              </marker>
            </defs>
            {arrows.map((a, i) => {
              const color = arrowColor(a);
              const x1 = LABEL_W + a.from.x2 - 1;
              const y1 = a.from.y + a.from.h / 2;
              const x2 = LABEL_W + a.to.x1 - 2;
              const y2 = a.to.y + a.to.h / 2;
              const bend = Math.max(18, Math.min(40, (x2 - x1) / 2));
              const path = x2 > x1 + 8
                ? `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
                : `M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x1 + 24} ${(y1 + y2) / 2}, ${(x1 + x2) / 2} ${(y1 + y2) / 2} S ${x2 - 24} ${y2}, ${x2} ${y2}`;
              return <path key={i} d={path} fill="none" stroke={color} strokeWidth={1.5} markerEnd="url(#arr)" />;
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
