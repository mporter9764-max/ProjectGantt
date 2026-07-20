"use client";

import { useMemo } from "react";
import type { Task, Project } from "@/lib/types";
import { eachDay, todayStr, addDays, daysBetween, isToday, isWeekend, parseYMD, monthName } from "@/lib/dates";
import { deepen, solidTint } from "@/lib/colors";
import { Diamond } from "./icons";
import { EmptyState } from "./ui";

const LABEL_W = 150;
const DAY_W = 22;
const BAR_H = 16;
const PAD = 8;

/** Cross-project master timeline: every pinned task, rows = projects, live-read. */
export function MasterView({
  pinnedTasks, projects, onOpenTask,
}: {
  pinnedTasks: Task[];
  projects: Project[];
  onOpenTask: (t: Task) => void;
}) {
  const today = todayStr();

  const { rangeStart, days } = useMemo(() => {
    let min = today, max = today;
    for (const t of pinnedTasks) {
      if (daysBetween(t.start_date, min) > 0) min = t.start_date;
      const end = t.end_date ?? t.start_date;
      if (daysBetween(max, end) > 0) max = end;
    }
    const start = addDays(min, -3);
    return { rangeStart: start, days: eachDay(start, addDays(max, 7)) };
  }, [pinnedTasks, today]);

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

  if (pinnedTasks.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <EmptyState title="Nothing pinned yet"
          hint="Pin tasks or milestones from any project (the pin toggle in the task editor) and they'll appear here as one cross-project picture." />
      </div>
    );
  }

  const xOf = (d: string) => daysBetween(rangeStart, d) * DAY_W;
  const todayX = xOf(today) + DAY_W / 2;

  return (
    <div className="h-full overflow-auto scroll-thin">
      <div style={{ width: LABEL_W + days.length * DAY_W }} className="min-w-full">
        <div className="sticky top-0 z-30 bg-canvas/95 backdrop-blur">
          <div className="flex">
            <div className="sticky left-0 z-40 flex-none bg-canvas" style={{ width: LABEL_W }} />
            {monthSegments.map((seg, i) => (
              <div key={seg.key}
                className="flex-none overflow-hidden whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted"
                style={{ width: seg.count * DAY_W, borderLeft: i === 0 ? "none" : "1px solid #E7E9EE" }}>
                {seg.label}
              </div>
            ))}
          </div>
          <div className="flex">
            <div className="sticky left-0 z-40 flex-none border-b border-line bg-canvas" style={{ width: LABEL_W }} />
            {days.map((day) => (
              <div key={day}
                className={`flex-none border-b border-line py-1 text-center ${isWeekend(day) ? "bg-black/[0.02]" : ""}`}
                style={{ width: DAY_W }}>
                <div className={`text-[11px] ${isToday(day) ? "font-bold text-accent" : "text-muted"}`}>{parseYMD(day).getDate()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 w-px bg-accent/70" style={{ left: LABEL_W + todayX }} />
          {projects.map((proj) => {
            const projTasks = pinnedTasks.filter((t) => t.project_id === proj.id);
            if (projTasks.length === 0) return null;

            // lane-pack
            const sorted = [...projTasks].sort((a, b) => daysBetween(b.start_date, a.start_date));
            const lanes: { end: string }[] = [];
            const laneOf = new Map<string, number>();
            for (const t of sorted) {
              const end = t.end_date ?? t.start_date;
              let idx = lanes.findIndex((l) => daysBetween(l.end, t.start_date) > 0);
              if (idx === -1) { lanes.push({ end }); idx = lanes.length - 1; }
              else lanes[idx].end = end;
              laneOf.set(t.id, idx);
            }
            const height = Math.max(lanes.length * (BAR_H + 14 + PAD) + PAD, 40);

            return (
              <div key={proj.id} className="relative border-b border-line" style={{ height }}>
                <div className="sticky left-0 z-20 absolute flex h-full flex-col justify-center px-3"
                  style={{ width: LABEL_W, backgroundColor: solidTint(proj.color), position: "absolute" }}>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: deepen(proj.color) }} />
                    <span className="truncate text-sm font-medium text-ink">{proj.name}</span>
                  </div>
                  <span className="pl-3.5 text-[11px] text-muted">{projTasks.length} pinned</span>
                </div>
                {projTasks.map((t) => {
                  const li = laneOf.get(t.id) ?? 0;
                  const top = PAD + li * (BAR_H + 14 + PAD);
                  const x1 = xOf(t.start_date);
                  if (t.is_milestone) {
                    return (
                      <button key={t.id} onClick={() => onOpenTask(t)} title={t.title}
                        className="absolute z-10 flex items-center"
                        style={{ left: LABEL_W + x1 + DAY_W / 2 - 8, top: top + 1 }}>
                        <Diamond width={15} height={15}
                          style={{ color: deepen(proj.color, 0.6), fill: t.is_complete ? "#E8EAEE" : proj.color }} />
                        <span className={`ml-1 whitespace-nowrap text-[11px] font-medium ${t.is_complete ? "text-faint line-through" : "text-ink"}`}>{t.title}</span>
                      </button>
                    );
                  }
                  const w = Math.max((daysBetween(t.start_date, t.end_date ?? t.start_date) + 1) * DAY_W - 2, 8);
                  return (
                    <button key={t.id} onClick={() => onOpenTask(t)} title={t.title}
                      className="absolute z-10 text-left" style={{ left: LABEL_W + x1 + 1, top }}>
                      <div className="rounded-[4px] shadow-card"
                        style={{
                          width: w, height: BAR_H,
                          backgroundColor: t.is_complete ? "#E8EAEE" : proj.color,
                          border: `1px solid ${deepen(proj.color, 0.85)}`,
                        }} />
                      <div className={`mt-[1px] truncate text-[11px] font-medium leading-tight ${t.is_complete ? "text-faint line-through" : "text-ink"}`}
                        style={{ maxWidth: Math.max(w, 160) }}>
                        {t.title}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
