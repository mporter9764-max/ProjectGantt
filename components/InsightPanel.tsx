"use client";

import { useMemo } from "react";
import type { Task, Owner, Dependency } from "@/lib/types";
import { computeDigest } from "@/lib/graph";
import { daysBetween, monthDay } from "@/lib/dates";
import { deepen } from "@/lib/colors";
import { X } from "./icons";

/** Right-side panel: the weekly digest, or the time-window focus when a range is selected. */
export function InsightPanel({
  tasks, owners, deps, windowSel, onClose, onPick, onClearWindow,
}: {
  tasks: Task[];
  owners: Owner[];
  deps: Dependency[];
  windowSel: { a: string; b: string } | null;
  onClose: () => void;
  onPick: (t: Task) => void;
  onClearWindow: () => void;
}) {
  const digest = useMemo(() => computeDigest(tasks, deps), [tasks, deps]);

  const windowTasks = useMemo(() => {
    if (!windowSel) return null;
    const active = tasks.filter((t) => {
      const end = t.end_date ?? t.start_date;
      return daysBetween(t.start_date, windowSel.b) >= 0 && daysBetween(windowSel.a, end) >= 0;
    });
    const byOwner = new Map<string, Task[]>();
    for (const t of active) {
      const key = t.owner_id ?? "__none__";
      byOwner.set(key, [...(byOwner.get(key) ?? []), t]);
    }
    return byOwner;
  }, [windowSel, tasks]);

  const ownerName = (id: string) =>
    id === "__none__" ? "Unassigned" : owners.find((o) => o.id === id)?.name ?? "Unassigned";
  const ownerColor = (id: string) =>
    id === "__none__" ? "#D8DCE3" : owners.find((o) => o.id === id)?.color ?? "#D8DCE3";

  return (
    <div className="flex h-full w-72 flex-none flex-col border-l border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h3 className="text-sm font-semibold">
          {windowSel ? `${monthDay(windowSel.a)} – ${monthDay(windowSel.b)}` : "This week"}
        </h3>
        <div className="flex items-center gap-1">
          {windowSel && (
            <button onClick={onClearWindow} className="text-xs text-muted hover:text-ink">clear range</button>
          )}
          <button onClick={onClose} aria-label="Close panel"
            className="flex h-6 w-6 items-center justify-center rounded text-faint hover:text-ink">
            <X width={14} height={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {windowSel && windowTasks ? (
          windowTasks.size === 0 ? (
            <p className="text-sm text-faint">Nothing active in this window.</p>
          ) : (
            Array.from(windowTasks.entries()).map(([oid, list]) => (
              <div key={oid}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: deepen(ownerColor(oid)) }} />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">{ownerName(oid)}</span>
                  <span className="text-xs text-faint">{list.length}</span>
                </div>
                <div className="space-y-1">
                  {list.map((t) => <Item key={t.id} t={t} onPick={onPick} />)}
                </div>
              </div>
            ))
          )
        ) : (
          <>
            <Section label="Ready to start" hint="All dependencies complete" items={digest.ready} onPick={onPick} />
            <Section label="Blocked" hint="Waiting on incomplete inputs" items={digest.blocked} onPick={onPick} tone="red" />
            <Section label="Overdue" items={digest.overdue} onPick={onPick} tone="red" />
            <Section label="At risk" items={digest.atRisk} onPick={onPick} tone="amber" />
            <Section label="Starting this week" items={digest.startingSoon} onPick={onPick} />
            <Section label="Finishing this week" items={digest.finishingSoon} onPick={onPick} />
          </>
        )}
      </div>
    </div>
  );
}

function Section({ label, hint, items, onPick, tone }: {
  label: string; hint?: string; items: Task[]; onPick: (t: Task) => void; tone?: "red" | "amber";
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-1.5">
        <h4 className={`text-xs font-semibold uppercase tracking-wide ${tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-muted"}`}>{label}</h4>
        <span className="text-xs text-faint">{items.length}</span>
      </div>
      {hint && <p className="mb-1 text-[11px] text-faint">{hint}</p>}
      {items.length === 0 ? (
        <p className="text-xs text-faint">—</p>
      ) : (
        <div className="space-y-1">{items.map((t) => <Item key={t.id} t={t} onPick={onPick} />)}</div>
      )}
    </div>
  );
}

function Item({ t, onPick }: { t: Task; onPick: (t: Task) => void }) {
  return (
    <button onClick={() => onPick(t)}
      className="block w-full truncate rounded-md border border-line px-2 py-1 text-left text-xs text-ink hover:border-faint">
      {t.title}
      <span className="ml-1 text-faint">{monthDay(t.start_date)}{t.end_date ? `–${monthDay(t.end_date)}` : ""}</span>
    </button>
  );
}
