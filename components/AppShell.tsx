"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Project, Group, Owner, Task, Dependency,
  Note, NoteTag, NoteSnippetCompletion, NoteLink,
} from "@/lib/types";
import { isConfigured } from "@/lib/supabase";
import {
  fetchProjects, fetchGroups, fetchOwners, fetchTasks, fetchDependencies, fetchPinnedTasks,
  fetchNotes, fetchNoteTags, fetchSnippetCompletions, fetchNoteLinks,
  setTaskDates, completeSnippet, uncompleteSnippet, createNoteLink,
} from "@/lib/api";
import { deepen } from "@/lib/colors";
import { GanttView } from "./GanttView";
import { TaskEditor } from "./TaskEditor";
import { EntityManager } from "./EntityManager";
import { InsightPanel } from "./InsightPanel";
import { MasterView } from "./MasterView";
import { NotesView } from "./NotesView";
import { NoteEditor } from "./NoteEditor";
import { NoteTagManager } from "./NoteTagManager";
import { Button, IconButton } from "./ui";
import { Plus, Cog, Users, Rows, GitBranch, MessageSquare, ZoomIn, ZoomOut, PanelRight } from "./icons";

type Tab = "chart" | "notes" | "master";
type PendingLink = { noteId: string; tag: string; hash: string; title: string } | null;

export default function AppShell() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [pinned, setPinned] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteTags, setNoteTags] = useState<NoteTag[]>([]);
  const [snippetCompletions, setSnippetCompletions] = useState<NoteSnippetCompletion[]>([]);
  const [noteLinks, setNoteLinks] = useState<NoteLink[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chart");

  // chart controls
  const [pivot, setPivot] = useState<"group" | "owner">("group");
  const [dayW, setDayW] = useState(28);
  const [showCritical, setShowCritical] = useState(false);
  const [showCallouts, setShowCallouts] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [ownerFilter, setOwnerFilter] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [windowSel, setWindowSel] = useState<{ a: string; b: string } | null>(null);

  // editors
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);
  const [editorTask, setEditorTask] = useState<Task | null>(null);
  const [newTaskGroupId, setNewTaskGroupId] = useState<string | undefined>(undefined);
  const [newTaskTitle, setNewTaskTitle] = useState<string | undefined>(undefined);
  const [pendingLink, setPendingLink] = useState<PendingLink>(null);
  const [projMgrOpen, setProjMgrOpen] = useState(false);
  const [groupMgrOpen, setGroupMgrOpen] = useState(false);
  const [ownerMgrOpen, setOwnerMgrOpen] = useState(false);
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [editorNote, setEditorNote] = useState<Note | null>(null);
  const [noteTagMgrOpen, setNoteTagMgrOpen] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const p = await fetchProjects();
      setProjects(p);
      setProjectId((cur) => cur && p.some((x) => x.id === cur) ? cur : p[0]?.id ?? null);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProject = useCallback(async (pid: string) => {
    try {
      const [g, o, t, d, n, nt, sc, nl] = await Promise.all([
        fetchGroups(pid), fetchOwners(pid), fetchTasks(pid), fetchDependencies(pid),
        fetchNotes(pid), fetchNoteTags(pid), fetchSnippetCompletions(pid), fetchNoteLinks(pid),
      ]);
      setGroups(g); setOwners(o); setTasks(t); setDeps(d);
      setNotes(n); setNoteTags(nt); setSnippetCompletions(sc); setNoteLinks(nl);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load this project.");
    }
  }, []);

  const loadPinned = useCallback(async () => {
    try { setPinned(await fetchPinnedTasks()); } catch {}
  }, []);

  useEffect(() => { if (isConfigured) loadProjects(); else setLoading(false); }, [loadProjects]);
  useEffect(() => { if (projectId) { loadProject(projectId); setSelectedId(null); setWindowSel(null); setCollapsed(new Set()); setOwnerFilter(new Set()); } }, [projectId, loadProject]);
  useEffect(() => { if (tab === "master") loadPinned(); }, [tab, loadPinned]);

  const reload = useCallback(() => {
    if (projectId) loadProject(projectId);
    loadPinned();
  }, [projectId, loadProject, loadPinned]);

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const project = projects.find((p) => p.id === projectId) ?? null;

  // ---- task editor open helpers ----
  const openNewTask = (groupId?: string, title?: string, link?: PendingLink) => {
    setEditorTask(null);
    setNewTaskGroupId(groupId);
    setNewTaskTitle(title);
    setPendingLink(link ?? null);
    setTaskEditorOpen(true);
  };
  const openEditTask = (t: Task) => {
    setEditorTask(t);
    setPendingLink(null);
    setTaskEditorOpen(true);
  };

  // ---- drag commit with optimistic update ----
  const commitDates = async (taskId: string, start: string, end: string | null) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, start_date: start, end_date: end } : t)));
    try { await setTaskDates(taskId, start, end); } catch { reload(); }
  };

  // ---- note snippet handlers ----
  const markSnippetDone = async (noteId: string, tag: string, hash: string) => {
    setSnippetCompletions((prev) => [...prev, { id: `tmp`, note_id: noteId, tag, snippet_hash: hash, completed_at: new Date().toISOString() }]);
    try { await completeSnippet(noteId, tag, hash); reload(); } catch { reload(); }
  };
  const markSnippetNotDone = async (noteId: string, tag: string, hash: string) => {
    setSnippetCompletions((prev) => prev.filter((c) => !(c.note_id === noteId && c.tag === tag && c.snippet_hash === hash)));
    try { await uncompleteSnippet(noteId, tag, hash); reload(); } catch { reload(); }
  };

  const sendSnippetToChart = (noteId: string, tag: string, hash: string, text: string) => {
    setTab("chart");
    openNewTask(undefined, text, { noteId, tag, hash, title: text });
  };

  const handleLinkCreated = async (taskId: string) => {
    if (!pendingLink) return;
    try { await createNoteLink(pendingLink.noteId, pendingLink.tag, pendingLink.hash, taskId); } catch {}
    setPendingLink(null);
  };

  const toggleCollapse = (rowId: string) =>
    setCollapsed((prev) => { const n = new Set(prev); n.has(rowId) ? n.delete(rowId) : n.add(rowId); return n; });
  const toggleOwnerFilter = (id: string) =>
    setOwnerFilter((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const jumpToProjectTask = (t: Task) => {
    setProjectId(t.project_id);
    setTab("chart");
  };

  if (!isConfigured) return <SetupScreen />;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex-none border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-2 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-base font-semibold tracking-tight">ProjectMgt</span>
            {tab !== "master" && (
              <>
                <select value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value)}
                  className="max-w-[180px] truncate rounded-lg border border-line bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none">
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <IconButton label="Manage projects" onClick={() => setProjMgrOpen(true)}><Cog /></IconButton>
              </>
            )}
          </div>
          <nav className="flex gap-1">
            {(["chart", "notes", "master"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${tab === t ? "bg-accent text-white" : "text-muted hover:bg-black/[0.04]"}`}>
                {t}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            {tab === "chart" && (
              <Button size="sm" onClick={() => openNewTask()} className="hidden sm:inline-flex">
                <Plus width={16} height={16} /> Task
              </Button>
            )}
            {tab === "notes" && (
              <Button size="sm" onClick={() => { setEditorNote(null); setNoteEditorOpen(true); }} className="hidden sm:inline-flex">
                <Plus width={16} height={16} /> Note
              </Button>
            )}
          </div>
        </div>

        {/* Chart toolbar */}
        {tab === "chart" && (
          <div className="border-t border-line bg-canvas/60 px-4 py-1.5">
            <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-1.5">
              <ToolToggle active={pivot === "owner"} onClick={() => setPivot(pivot === "group" ? "owner" : "group")}
                icon={pivot === "group" ? <Users width={13} height={13} /> : <Rows width={13} height={13} />}
                label={pivot === "group" ? "By owner" : "By group"} />
              <ToolToggle active={showCritical} onClick={() => setShowCritical(!showCritical)}
                icon={<GitBranch width={13} height={13} />} label="Critical path" activeCls="bg-red-600 text-white border-red-600" />
              <ToolToggle active={showCallouts} onClick={() => setShowCallouts(!showCallouts)}
                icon={<MessageSquare width={13} height={13} />} label="Callouts" />
              <ToolToggle active={panelOpen} onClick={() => setPanelOpen(!panelOpen)}
                icon={<PanelRight width={13} height={13} />} label="Insight" />
              <div className="mx-1 h-4 w-px bg-line" />
              <IconButton label="Zoom out" onClick={() => setDayW((w) => Math.max(10, w - 6))}><ZoomOut width={15} height={15} /></IconButton>
              <IconButton label="Zoom in" onClick={() => setDayW((w) => Math.min(46, w + 6))}><ZoomIn width={15} height={15} /></IconButton>
              <div className="mx-1 h-4 w-px bg-line" />
              <button onClick={() => setGroupMgrOpen(true)} className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted hover:text-ink">Groups</button>
              <button onClick={() => setOwnerMgrOpen(true)} className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted hover:text-ink">Owners</button>
              <div className="ml-auto flex flex-wrap items-center gap-1">
                {owners.map((o) => {
                  const active = ownerFilter.has(o.id);
                  return (
                    <button key={o.id} onClick={() => toggleOwnerFilter(o.id)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${active ? "border-transparent text-ink" : "border-line text-muted"}`}
                      style={active ? { backgroundColor: o.color } : undefined}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: deepen(o.color) }} />
                      {o.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="relative flex flex-1 overflow-hidden">
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading…</div>
        ) : error ? (
          <div className="mx-auto max-w-lg px-4 py-10 text-center">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <p className="mt-2 text-sm text-muted">Check the pm_ schema ran in Supabase and env vars are set, then reload.</p>
          </div>
        ) : tab === "chart" ? (
          <>
            <div className="min-w-0 flex-1">
              {groups.length === 0 ? (
                <div className="mx-auto max-w-md px-4 py-14 text-center">
                  <p className="text-sm font-medium text-ink">Set up this project's workstreams first</p>
                  <p className="mt-1 text-sm text-muted">Groups are the rows of your chart (e.g. IT, Design, Vendor).</p>
                  <Button size="sm" className="mt-4" onClick={() => setGroupMgrOpen(true)}>Add groups</Button>
                </div>
              ) : (
                <GanttView
                  tasks={tasks} groups={groups} owners={owners} deps={deps}
                  pivot={pivot} dayW={dayW} showCritical={showCritical} showCallouts={showCallouts}
                  collapsed={collapsed} ownerFilter={ownerFilter} selectedId={selectedId} windowSel={windowSel}
                  onToggleCollapse={toggleCollapse} onSelect={setSelectedId}
                  onEdit={openEditTask} onAddTask={openNewTask}
                  onCommitDates={commitDates} onWindowSelect={setWindowSel}
                />
              )}
            </div>
            {panelOpen && (
              <InsightPanel tasks={tasks} owners={owners} deps={deps} windowSel={windowSel}
                onClose={() => setPanelOpen(false)} onPick={openEditTask} onClearWindow={() => setWindowSel(null)} />
            )}
          </>
        ) : tab === "notes" ? (
          <div className="h-full w-full overflow-y-auto">
            <NotesView
              notes={notes} noteTags={noteTags} completions={snippetCompletions}
              links={noteLinks} tasksById={tasksById}
              onOpenNote={(n) => { setEditorNote(n); setNoteEditorOpen(true); }}
              onManageTags={() => setNoteTagMgrOpen(true)}
              onSendToChart={sendSnippetToChart}
              onCompleteSnippet={markSnippetDone}
              onUncompleteSnippet={markSnippetNotDone}
            />
          </div>
        ) : (
          <div className="h-full w-full">
            <MasterView pinnedTasks={pinned} projects={projects} onOpenTask={jumpToProjectTask} />
          </div>
        )}

        {/* Mobile FAB */}
        {tab !== "master" && (
          <button
            onClick={() => (tab === "notes" ? (setEditorNote(null), setNoteEditorOpen(true)) : openNewTask())}
            aria-label="New"
            className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-pop sm:hidden">
            <Plus width={24} height={24} />
          </button>
        )}
      </main>

      {projectId && (
        <>
          <TaskEditor
            open={taskEditorOpen} projectId={projectId} task={editorTask}
            tasks={tasks} groups={groups} owners={owners} deps={deps}
            defaultGroupId={newTaskGroupId} defaultTitle={newTaskTitle}
            onClose={() => { setTaskEditorOpen(false); setPendingLink(null); }}
            onSaved={reload} onLinkCreated={handleLinkCreated}
          />
          <EntityManager open={projMgrOpen} title="Projects" table="pm_projects" items={projects}
            deleteHint="This deletes ALL of its tasks, notes, and chart data."
            onClose={() => setProjMgrOpen(false)} onChanged={loadProjects} />
          <EntityManager open={groupMgrOpen} title="Groups / workstreams" table="pm_groups" items={groups} projectId={projectId}
            blockDelete={(g) => tasks.some((t) => t.group_id === g.id) ? `"${g.name}" still has tasks — move or delete those first.` : null}
            onClose={() => setGroupMgrOpen(false)} onChanged={reload} />
          <EntityManager open={ownerMgrOpen} title="Owners" table="pm_owners" items={owners} projectId={projectId}
            deleteHint="Tasks keep existing; they just become Unassigned."
            onClose={() => setOwnerMgrOpen(false)} onChanged={reload} />
          <NoteEditor open={noteEditorOpen} projectId={projectId} note={editorNote}
            noteTags={noteTags} completions={snippetCompletions}
            onClose={() => setNoteEditorOpen(false)} onSaved={reload}
            onCompleteSnippet={markSnippetDone} onUncompleteSnippet={markSnippetNotDone} />
          <NoteTagManager open={noteTagMgrOpen} tags={noteTags}
            onClose={() => setNoteTagMgrOpen(false)} onChanged={reload} />
        </>
      )}
    </div>
  );
}

function ToolToggle({ active, onClick, icon, label, activeCls }: {
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

function SetupScreen() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <h1 className="text-lg font-semibold">Almost there</h1>
      <p className="mt-2 text-sm text-muted">
        Create <code className="rounded bg-black/[0.06] px-1">.env.local</code> with your Supabase values:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface p-3 text-xs text-ink">
{`NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY`}
      </pre>
      <p className="mt-3 text-sm text-muted">Same two values as your TaskMgt app — this can share the same Supabase project.</p>
    </div>
  );
}
