"use client";

import { useEffect, useState } from "react";
import type { Task, Group, Owner, Dependency, TaskDraft } from "@/lib/types";
import { todayStr } from "@/lib/dates";
import { legalDependencyTargets } from "@/lib/graph";
import { createTask, updateTask, deleteTask, saveDependencies, setTaskComplete } from "@/lib/api";
import { Sheet, Button, Field, TextInput, TextArea, DateInput } from "./ui";
import { Trash, Diamond, Pin, Flag, Check } from "./icons";

export function TaskEditor({
  open, projectId, task, tasks, groups, owners, deps,
  defaultGroupId, defaultTitle, onClose, onSaved, onLinkCreated,
}: {
  open: boolean;
  projectId: string;
  task: Task | null;
  tasks: Task[];
  groups: Group[];
  owners: Owner[];
  deps: Dependency[];
  defaultGroupId?: string;
  defaultTitle?: string;
  onClose: () => void;
  onSaved: () => void;
  /** When creating from a note snippet, called with the new task id so the link can be stored. */
  onLinkCreated?: (taskId: string) => void;
}) {
  const editing = Boolean(task);
  const [title, setTitle] = useState("");
  const [groupId, setGroupId] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [parentId, setParentId] = useState<string>("");
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState("");
  const [isMilestone, setIsMilestone] = useState(false);
  const [atRisk, setAtRisk] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [callout, setCallout] = useState("");
  const [notes, setNotes] = useState("");
  const [dependsOn, setDependsOn] = useState<Set<string>>(new Set());
  const [depSearch, setDepSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setDepSearch("");
    if (task) {
      setTitle(task.title);
      setGroupId(task.group_id);
      setOwnerId(task.owner_id ?? "");
      setParentId(task.parent_id ?? "");
      setStartDate(task.start_date);
      setEndDate(task.end_date ?? "");
      setIsMilestone(task.is_milestone);
      setAtRisk(task.at_risk);
      setPinned(task.pinned);
      setCallout(task.callout ?? "");
      setNotes(task.notes ?? "");
      setDependsOn(new Set(deps.filter((d) => d.task_id === task.id).map((d) => d.depends_on_id)));
    } else {
      setTitle(defaultTitle ?? "");
      setGroupId(defaultGroupId ?? groups[0]?.id ?? "");
      setOwnerId("");
      setParentId("");
      setStartDate(todayStr());
      setEndDate("");
      setIsMilestone(false);
      setAtRisk(false);
      setPinned(false);
      setCallout("");
      setNotes("");
      setDependsOn(new Set());
    }
  }, [open, task, deps, defaultGroupId, defaultTitle, groups]);

  const depCandidates = (task ? legalDependencyTargets(task.id, tasks, deps) : tasks)
    .filter((t) => !depSearch || t.title.toLowerCase().includes(depSearch.toLowerCase()));
  const parentCandidates = tasks.filter((t) => t.id !== task?.id && !t.parent_id && !t.is_milestone);

  async function handleSave() {
    if (!title.trim()) return setErr("Give the task a title.");
    if (!groupId) return setErr("Pick a group.");
    if (!isMilestone && endDate && endDate < startDate) return setErr("End can't be before start.");
    setBusy(true);
    setErr(null);
    try {
      const draft: TaskDraft = {
        project_id: projectId,
        group_id: groupId,
        owner_id: ownerId || null,
        parent_id: parentId || null,
        title: title.trim(),
        notes: notes.trim() || null,
        callout: callout.trim() || null,
        start_date: startDate,
        end_date: isMilestone ? null : endDate || null,
        is_milestone: isMilestone,
        at_risk: atRisk,
        pinned,
      };
      const saved = task ? await updateTask(task.id, draft) : await createTask(draft);
      await saveDependencies(projectId, saved.id, Array.from(dependsOn));
      if (!task && onLinkCreated) onLinkCreated(saved.id);
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong saving.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (!window.confirm("Delete this task permanently? Dependencies to and from it are removed too.")) return;
    setBusy(true);
    try {
      await deleteTask(task.id);
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't delete.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleComplete() {
    if (!task) return;
    try {
      await setTaskComplete(task.id, !task.is_complete);
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't update.");
    }
  }

  const selectCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none";

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Edit task" : "New task"}
      widthClassName="sm:w-[480px] lg:w-[560px]"
      footer={
        <>
          {editing ? (
            <div className="flex gap-2">
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={busy}>
                <Trash width={14} height={14} /> Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={toggleComplete} disabled={busy}>
                <Check width={14} height={14} /> {task?.is_complete ? "Restore" : "Complete"}
              </Button>
            </div>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create task"}
            </Button>
          </div>
        </>
      }>
      <div className="space-y-4">
        <Field label="Title">
          <TextInput value={title} autoFocus placeholder="What needs doing?" onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Group / workstream">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={selectCls}>
              {groups.length === 0 && <option value="">No groups yet</option>}
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
          <Field label="Owner">
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={selectCls}>
              <option value="">Unassigned</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-2">
          <Toggle active={isMilestone} onClick={() => setIsMilestone(!isMilestone)} icon={<Diamond width={13} height={13} />} label="Milestone" />
          <Toggle active={atRisk} onClick={() => setAtRisk(!atRisk)} icon={<Flag width={13} height={13} />} label="At risk" activeCls="bg-amber-100 text-amber-800 border-amber-300" />
          <Toggle active={pinned} onClick={() => setPinned(!pinned)} icon={<Pin width={13} height={13} />} label="Pin to Master" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={isMilestone ? "Date" : "Start"}>
            <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          {!isMilestone && (
            <Field label="End" hint="Blank = single day">
              <DateInput value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          )}
        </div>

        {!isMilestone && (
          <Field label="Subtask of" hint="Renders on the parent's row as a leading input">
            <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={selectCls}>
              <option value="">— none (top-level task) —</option>
              {parentCandidates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
        )}

        <Field label="Depends on" hint="Must finish before this task (arrows on the chart)">
          <TextInput value={depSearch} placeholder="Filter tasks…" onChange={(e) => setDepSearch(e.target.value)} className="mb-1.5" />
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
            {depCandidates.length === 0 && <p className="text-xs text-faint">No other tasks yet.</p>}
            {depCandidates.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-black/[0.03]">
                <input type="checkbox" checked={dependsOn.has(t.id)}
                  onChange={() => setDependsOn((prev) => {
                    const next = new Set(prev);
                    next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                    return next;
                  })} />
                <span className={t.is_complete ? "text-faint line-through" : "text-ink"}>{t.title}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Callout" hint="Short annotation shown on the chart (toggle callouts in the toolbar)">
          <TextInput value={callout} placeholder="e.g. Waiting on vendor contract" onChange={(e) => setCallout(e.target.value)} />
        </Field>

        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      </div>
    </Sheet>
  );
}

function Toggle({ active, onClick, icon, label, activeCls }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; activeCls?: string;
}) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? (activeCls ?? "border-accent bg-accent text-white") : "border-line text-muted hover:text-ink"
      }`}>
      {icon}{label}
    </button>
  );
}
