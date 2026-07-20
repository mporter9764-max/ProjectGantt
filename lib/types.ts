// Types mirror the pm_ Supabase schema. Dates are 'YYYY-MM-DD' day-level strings.

export type Project = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
};

export type Group = {
  id: string;
  project_id: string;
  name: string;
  color: string;
  sort_order: number;
};

export type Owner = {
  id: string;
  project_id: string;
  name: string;
  color: string;
  sort_order: number;
};

export type Task = {
  id: string;
  project_id: string;
  group_id: string;
  owner_id: string | null;
  parent_id: string | null;
  title: string;
  notes: string | null;
  callout: string | null;
  start_date: string;
  end_date: string | null;
  is_milestone: boolean;
  at_risk: boolean;
  pinned: boolean;
  is_complete: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Dependency = {
  id: string;
  project_id: string;
  task_id: string;        // this task…
  depends_on_id: string;  // …depends on this one finishing first
};

export type TaskDraft = {
  project_id: string;
  group_id: string;
  owner_id: string | null;
  parent_id: string | null;
  title: string;
  notes: string | null;
  callout: string | null;
  start_date: string;
  end_date: string | null;
  is_milestone: boolean;
  at_risk: boolean;
  pinned: boolean;
};

// ---- Notes (project-scoped port of the TaskMgt notes system) ----

export type Note = {
  id: string;
  project_id: string;
  title: string | null;
  content: string;
  created_at: string;
  updated_at: string;
};

export type NoteTag = {
  id: string;
  project_id: string;
  name: string;
  color: string;
  sort_order: number;
  show_in_recap: boolean;
  created_at: string;
};

export type NoteDraft = {
  title: string | null;
  content: string;
};

export type NoteSnippetCompletion = {
  id: string;
  note_id: string;
  tag: string;
  snippet_hash: string;
  completed_at: string;
};

export type NoteLink = {
  id: string;
  note_id: string;
  tag: string;
  snippet_hash: string;
  task_id: string;
  created_at: string;
};
