import { supabase } from "./supabase";
import { NOTE_TAG_PALETTE } from "./colors";
import type {
  Project, Group, Owner, Task, Dependency, TaskDraft,
  Note, NoteTag, NoteDraft, NoteSnippetCompletion, NoteLink,
} from "./types";

// ---- Generic helpers for the three {name,color,sort_order} entity tables ----

type EntityTable = "pm_projects" | "pm_groups" | "pm_owners";

export async function createEntity(
  table: EntityTable, row: Record<string, unknown>
): Promise<any> {
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateEntity(
  table: EntityTable, id: string, patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteEntity(table: EntityTable, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

export async function reorderEntities(table: EntityTable, orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, i) => supabase.from(table).update({ sort_order: i + 1 }).eq("id", id))
  );
}

// ---- Fetches ----

export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from("pm_projects").select("*")
    .order("sort_order").order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function fetchGroups(projectId: string): Promise<Group[]> {
  const { data, error } = await supabase.from("pm_groups").select("*")
    .eq("project_id", projectId).order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function fetchOwners(projectId: string): Promise<Owner[]> {
  const { data, error } = await supabase.from("pm_owners").select("*")
    .eq("project_id", projectId).order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function fetchTasks(projectId: string): Promise<Task[]> {
  const { data, error } = await supabase.from("pm_tasks").select("*")
    .eq("project_id", projectId).order("start_date");
  if (error) throw error;
  return data ?? [];
}

export async function fetchDependencies(projectId: string): Promise<Dependency[]> {
  const { data, error } = await supabase.from("pm_dependencies").select("*")
    .eq("project_id", projectId);
  if (error) throw error;
  return data ?? [];
}

/** All pinned tasks across every project — feeds the Master timeline. */
export async function fetchPinnedTasks(): Promise<Task[]> {
  const { data, error } = await supabase.from("pm_tasks").select("*")
    .eq("pinned", true).order("start_date");
  if (error) throw error;
  return data ?? [];
}

// ---- Tasks ----

export async function createTask(draft: TaskDraft): Promise<Task> {
  const { data, error } = await supabase.from("pm_tasks").insert(draft).select().single();
  if (error) throw error;
  return data;
}

export async function updateTask(id: string, draft: Partial<TaskDraft>): Promise<Task> {
  const { data, error } = await supabase.from("pm_tasks").update(draft).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function setTaskDates(id: string, start: string, end: string | null): Promise<void> {
  const { error } = await supabase.from("pm_tasks")
    .update({ start_date: start, end_date: end }).eq("id", id);
  if (error) throw error;
}

export async function setTaskComplete(id: string, complete: boolean): Promise<void> {
  const { error } = await supabase.from("pm_tasks").update({ is_complete: complete }).eq("id", id);
  if (error) throw error;
}

export async function setTaskPinned(id: string, pinned: boolean): Promise<void> {
  const { error } = await supabase.from("pm_tasks").update({ pinned }).eq("id", id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("pm_tasks").delete().eq("id", id);
  if (error) throw error;
}

// ---- Dependencies ----

export async function saveDependencies(
  projectId: string, taskId: string, dependsOnIds: string[]
): Promise<void> {
  const del = await supabase.from("pm_dependencies").delete().eq("task_id", taskId);
  if (del.error) throw del.error;
  if (dependsOnIds.length === 0) return;
  const rows = dependsOnIds.map((d) => ({ project_id: projectId, task_id: taskId, depends_on_id: d }));
  const { error } = await supabase.from("pm_dependencies").insert(rows);
  if (error) throw error;
}

// ---- Notes ----

export async function fetchNotes(projectId: string): Promise<Note[]> {
  const { data, error } = await supabase.from("pm_notes").select("*")
    .eq("project_id", projectId).order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createNote(projectId: string, draft: NoteDraft): Promise<Note> {
  const { data, error } = await supabase.from("pm_notes")
    .insert({ project_id: projectId, title: draft.title, content: draft.content })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateNote(id: string, draft: NoteDraft): Promise<Note> {
  const { data, error } = await supabase.from("pm_notes")
    .update({ title: draft.title, content: draft.content }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from("pm_notes").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchNoteTags(projectId: string): Promise<NoteTag[]> {
  const { data, error } = await supabase.from("pm_note_tags").select("*")
    .eq("project_id", projectId).order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function updateNoteTag(
  id: string,
  patch: Partial<Pick<NoteTag, "name" | "color" | "sort_order" | "show_in_recap">>
): Promise<void> {
  const { error } = await supabase.from("pm_note_tags").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteNoteTag(id: string): Promise<void> {
  const { error } = await supabase.from("pm_note_tags").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderNoteTags(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, i) => supabase.from("pm_note_tags").update({ sort_order: i + 1 }).eq("id", id))
  );
}

export async function ensureNoteTagsExist(
  projectId: string, names: string[], existing: NoteTag[]
): Promise<void> {
  const have = new Set(existing.map((t) => t.name.toLowerCase()));
  const toCreate = names.filter((n) => !have.has(n.toLowerCase()));
  if (toCreate.length === 0) return;
  const startIdx = existing.length;
  const rows = toCreate.map((n, i) => ({
    project_id: projectId,
    name: n.toLowerCase(),
    color: NOTE_TAG_PALETTE[(startIdx + i) % NOTE_TAG_PALETTE.length],
    sort_order: startIdx + i + 1,
  }));
  const { error } = await supabase.from("pm_note_tags")
    .upsert(rows, { onConflict: "project_id,name", ignoreDuplicates: true });
  if (error) throw error;
}

export async function fetchSnippetCompletions(projectId: string): Promise<NoteSnippetCompletion[]> {
  // join via notes of this project
  const { data, error } = await supabase
    .from("pm_snippet_completions")
    .select("*, pm_notes!inner(project_id)")
    .eq("pm_notes.project_id", projectId);
  if (error) throw error;
  return (data ?? []).map(({ pm_notes, ...rest }: any) => rest);
}

export async function completeSnippet(noteId: string, tag: string, hash: string): Promise<void> {
  const { error } = await supabase.from("pm_snippet_completions")
    .upsert({ note_id: noteId, tag, snippet_hash: hash }, { onConflict: "note_id,tag,snippet_hash" });
  if (error) throw error;
}

export async function uncompleteSnippet(noteId: string, tag: string, hash: string): Promise<void> {
  const { error } = await supabase.from("pm_snippet_completions").delete()
    .eq("note_id", noteId).eq("tag", tag).eq("snippet_hash", hash);
  if (error) throw error;
}

// ---- Note ↔ chart-task links ----

export async function fetchNoteLinks(projectId: string): Promise<NoteLink[]> {
  const { data, error } = await supabase
    .from("pm_note_links")
    .select("*, pm_notes!inner(project_id)")
    .eq("pm_notes.project_id", projectId);
  if (error) throw error;
  return (data ?? []).map(({ pm_notes, ...rest }: any) => rest);
}

export async function createNoteLink(
  noteId: string, tag: string, hash: string, taskId: string
): Promise<void> {
  const { error } = await supabase.from("pm_note_links")
    .upsert({ note_id: noteId, tag, snippet_hash: hash, task_id: taskId },
            { onConflict: "note_id,tag,snippet_hash" });
  if (error) throw error;
}
