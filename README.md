# ProjectMgt — multi-project Gantt planning with linked meeting notes

Next.js 14 · Supabase · Tailwind · TypeScript. No login — shared by link.
Can share the SAME Supabase project as TaskMgt (all tables are pm_-prefixed).

## Setup
1. Supabase → SQL Editor → run `supabase/schema.sql` once.
2. `cp .env.local.example .env.local` and fill in the same two values as TaskMgt.
3. `npm install` → `npm run dev` → localhost:3000.
4. Push to a GitHub repo (folders at the root), import in Vercel, add the same
   two env vars, deploy.

## Using it
- **Chart tab** — groups are rows. Drag a bar to move it; drag its edges to
  resize. Tap a bar to trace its dependency chains (amber = inputs,
  blue = downstream). Double-tap to edit. Toolbar: pivot rows by owner,
  critical-path toggle, callouts, zoom, the Insight panel (weekly digest),
  and owner filter chips. Drag across the day axis to focus a date range.
- **Milestones** — diamond markers (toggle in the task editor).
- **Subtasks** — pick a parent in the editor; they render slim on the
  parent's row.
- **Notes tab** — the full TaskMgt notes system, scoped per project. Tag lines
  with #tags or highlight phrases. In Tagged Items, "Chart" sends an action to
  the chart pre-filled and links them: completing the chart task marks the
  note action done automatically.
- **Master tab** — every task you Pin (task editor toggle), across all
  projects, one lane per project. Pinned milestones stay diamonds. Live —
  never goes stale.
