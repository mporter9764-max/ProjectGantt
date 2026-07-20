"use client";

import { useEffect, useState } from "react";
import { createEntity, updateEntity, deleteEntity, reorderEntities } from "@/lib/api";
import { PASTEL_PALETTE, deepen } from "@/lib/colors";
import { Modal, Button, TextInput } from "./ui";
import { Plus, Trash, Check, ChevronUp, ChevronDown } from "./icons";

type Entity = { id: string; name: string; color: string; sort_order: number };

/** Shared manager for projects, groups, and owners (all {name,color,order} entities). */
export function EntityManager({
  open, title, table, items, projectId, blockDelete, deleteHint, onClose, onChanged,
}: {
  open: boolean;
  title: string;
  table: "pm_projects" | "pm_groups" | "pm_owners";
  items: Entity[];
  projectId?: string; // required for groups/owners
  blockDelete?: (item: Entity) => string | null; // return message to block
  deleteHint?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [order, setOrder] = useState<Entity[]>(items);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PASTEL_PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setOrder(items), [items]);

  async function add() {
    if (!newName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const row: Record<string, unknown> = { name: newName.trim(), color: newColor, sort_order: order.length + 1 };
      if (table !== "pm_projects") row.project_id = projectId;
      await createEntity(table, row);
      setNewName("");
      setNewColor(PASTEL_PALETTE[(order.length + 1) % PASTEL_PALETTE.length]);
      onChanged();
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't add.");
    } finally {
      setBusy(false);
    }
  }

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    try {
      await reorderEntities(table, next.map((x) => x.id));
      onChanged();
    } catch (e: any) {
      setOrder(order);
      setErr(e?.message ?? "Couldn't reorder.");
    }
  }

  async function rename(item: Entity, name: string) {
    if (!name.trim() || name === item.name) return;
    try { await updateEntity(table, item.id, { name: name.trim() }); onChanged(); } catch {}
  }

  async function recolor(item: Entity, color: string) {
    try { await updateEntity(table, item.id, { color }); onChanged(); } catch {}
  }

  async function remove(item: Entity) {
    const blockMsg = blockDelete?.(item);
    if (blockMsg) { setErr(blockMsg); return; }
    if (!window.confirm(`Delete "${item.name}"?${deleteHint ? ` ${deleteHint}` : ""}`)) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteEntity(table, item.id);
      onChanged();
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't delete — it may still be in use.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} widthClassName="max-w-lg sm:max-w-xl">
      <div className="space-y-3">
        <div className="space-y-2">
          {order.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg border border-line p-2">
              <div className="flex flex-none flex-col">
                <button disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"
                  className="flex h-4 w-6 items-center justify-center rounded text-faint hover:bg-black/[0.05] hover:text-ink disabled:opacity-20">
                  <ChevronUp width={13} height={13} />
                </button>
                <button disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move down"
                  className="flex h-4 w-6 items-center justify-center rounded text-faint hover:bg-black/[0.05] hover:text-ink disabled:opacity-20">
                  <ChevronDown width={13} height={13} />
                </button>
              </div>
              <ColorDots value={item.color} onPick={(c) => recolor(item, c)} />
              <input defaultValue={item.name} onBlur={(e) => rename(item, e.target.value)}
                className="flex-1 rounded-md border border-transparent px-2 py-1 text-sm text-ink focus:border-line focus:outline-none" />
              <button onClick={() => remove(item)} aria-label={`Delete ${item.name}`}
                className="flex h-7 w-7 flex-none items-center justify-center rounded text-faint hover:bg-red-50 hover:text-red-600">
                <Trash width={15} height={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-dashed border-line p-3">
          <div className="flex items-center gap-2">
            <TextInput value={newName} placeholder="New name" onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()} />
            <Button size="sm" onClick={add} disabled={busy || !newName.trim()}>
              <Plus width={14} height={14} /> Add
            </Button>
          </div>
          <div className="mt-2"><ColorDots value={newColor} onPick={setNewColor} /></div>
        </div>

        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      </div>
    </Modal>
  );
}

function ColorDots({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  const [openPicker, setOpenPicker] = useState(false);
  return (
    <div className="relative flex-none">
      <button onClick={() => setOpenPicker((v) => !v)} aria-label="Change color"
        className="flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-inset ring-black/10 hover:scale-110"
        style={{ backgroundColor: value }} />
      {openPicker && (
        <div className="absolute left-0 top-7 z-20 flex w-52 flex-wrap gap-1.5 rounded-lg border border-line bg-surface p-2 shadow-pop">
          {PASTEL_PALETTE.map((c) => (
            <button key={c} onClick={() => { onPick(c); setOpenPicker(false); }}
              className="flex h-6 w-6 items-center justify-center rounded-full hover:scale-110"
              style={{ backgroundColor: c, boxShadow: c.toLowerCase() === value.toLowerCase() ? `0 0 0 2px ${deepen(c)}` : "none" }}>
              {c.toLowerCase() === value.toLowerCase() && <Check width={11} height={11} color={deepen(c)} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
