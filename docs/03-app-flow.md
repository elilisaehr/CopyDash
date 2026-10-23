# App Flow — CopyDash

## Entry points

- `/` — redirects based on auth state: signed out → `/login`; signed in → `/pm` or `/client` depending on role.
- `/login` — public.
- `/signup` — public; role picker (Project Manager / Client) at the top of the form.

## Screen inventory

**PM side** (sidebar: Dashboard, Projects, Clients, Settings, Help & Support)

| Screen | Route | Purpose | Required data |
|---|---|---|---|
| Dashboard | `/pm` | Overview: KPIs, recent projects, activity feed | `profiles`, `projects` (+ client name, page stats), `activity_log` |
| Projects list | `/pm/projects` | All active (non-archived) projects, filter by status, search | `projects` + stats |
| New Project | `/pm/projects/new` | One-step form: name, client (existing or new) | `clients` |
| Pages list | `/pm/projects/[projectId]` | A project's pages, add/rename/archive a page | `projects`, `pages` |
| Design Editor | `/pm/projects/[projectId]/pages/[pageId]` (when the page has a design) | Edit copy in place on the PDF/Figma design | `pages`, `design_edits` or `figma_designs` |
| Field Editor | same route, fallback when no design | Structured list of text fields | `pages`, `fields` |
| Clients | `/pm/clients` | Manage client companies + their emails | `clients`, `client_emails`, `projects` (for per-client project count) |
| Settings | `/pm/settings` | Tabs: Account, Notifications, Team, Branding, Integrations (Figma), **Archive** | `profiles`, `notification_prefs`, `team_invitations`, `branding_settings`, `figma_connections`, archived `projects`/`pages` |
| Help & Support | `/pm/help` | Static help content | — |

**Client side** (sidebar: My Work, Settings, Help & Support)

| Screen | Route | Purpose | Required data |
|---|---|---|---|
| Client dashboard | `/client` | The one project they're linked to, with its pages | `projects` (via `project_members`), `pages` |
| Client page editor | `/client/pages/[pageId]` | Same Design/Field editor, role-gated to editing permissions | `pages`, `design_edits`/`fields` |
| Settings | `/client/settings` | Account only | `profiles` |
| Help & Support | `/client/help` | Static help content | — |

## Primary journey (PM)

1. **Sign up** (`/signup`, role = Project Manager) → auto-signed in (or "check your email" if confirmation is required) → lands on `/pm`.
2. **Add a client** (`/pm/clients` → "Add Client") → name + one or more emails.
3. **Create a project** (`/pm/projects/new`) → name + pick the client → lands on the project's empty Pages list.
4. **Add a page** → choose PDF upload or Figma import (if connected) → page created with that design attached.
5. **Edit content** on the Design Editor (click text in place) or the Field Editor (structured list) → auto-saves per block/field.
6. **Mark the page "Pending Review"** → the linked client now sees it awaiting their input on their dashboard.
7. **Client reviews/edits**, PM is notified via the activity feed (no real email yet — see TRD).
8. **PM marks the page "Completed"** → **Export** (PDF/JSON/CSV) to hand off to developers.

## Alternate journeys

- **Rename** a project or page: "…" menu → Rename → modal with a single name field.
- **Archive** a project or page: "…" menu → Archive (confirms first) → disappears from the active list; restorable from Settings → Archive → "Restore".
- **Reset an edited field** to the design's original text: the "×" next to an edited field in the side panel.
- **Skip the design entirely**: "Add Page" → "Skip PDF — create an empty page" → page has no design, uses the Field Editor only.
- **Re-sync a Figma design** after the source file changed: "Re-sync from Figma" button in the Design Editor (PDF designs don't need this — they're re-read from the stored file on every page load automatically).

## Per-action detail (key actions)

### Sign up
- **Trigger**: submit the signup form.
- **Validation**: name + valid email + password ≥ 6 characters (client-side `disabled` gate on the submit button; no server-side re-validation beyond what Supabase Auth itself enforces).
- **Loading state**: button shows a spinner + "Creating account…".
- **Success state**: if Supabase returns a session immediately, the profile is created and the user is redirected straight to `/pm` or `/client`; if email confirmation is required, a "Check your email" screen replaces the form.
- **Error state**: Supabase's error message shown inline above the submit button.
- **Next screen**: `/pm` or `/client` (by role).

### Add Page (PDF)
- **Trigger**: "Add Page" on a project's Pages list → PDF tab → drag/select a file.
- **Validation**: a PDF file, ≤10MB (stated in the UI; not hard-enforced server-side), page name required and must not collide with an existing page name in that project.
- **Loading state**: "Reading design…" while pdf.js extracts text client-side; "Creating…" while the row is written and the file uploads to Storage.
- **Success state**: redirected straight into that page's Design Editor.
- **Error state**: inline error banner ("Couldn't create the page. Please try again.") if the insert or upload fails.
- **Next screen**: the new page's Design Editor.

### Add Page (Figma)
- **Trigger**: same modal, "Figma" tab — only usable if the PM has connected a Figma token in Settings → Integrations.
- **Validation**: a Figma frame link containing a `node-id`; page name as above.
- **Loading / success / error**: same pattern, via `POST /api/figma/import` server-side.

### Edit text in the Design Editor
- **Trigger**: click any text block on the rendered design.
- **Validation**: none beyond the field's character budget (a soft cap computed from the original text's length, shown as a progress bar; paragraph-type blocks additionally show a word-count warning once the edit runs noticeably longer than the original — see the paragraph-merge fix in the Implementation Plan).
- **Loading state**: none visible (writes are per-block, debounced to blur/commit).
- **Success state**: the block visually "lifts" to an opaque, color-matched pill so the new text reads clearly; a small save-status indicator in the header shows "Saved".
- **Error state**: not currently surfaced distinctly from a generic failure — **[gap to flag, not an open question: worth adding a visible error state if a block fails to persist]**.
- **Next screen**: none — stays on the same page.

### Archive a project/page
- **Trigger**: "…" menu → Archive → browser `confirm()` dialog.
- **Validation**: confirmation required.
- **Loading state**: row dims (opacity) while the update runs.
- **Success state**: row disappears from the active list.
- **Error state**: `alert()` with the error message if the update fails.
- **Next screen**: none — stays on the same list.

## Navigation rules

- Persistent left **Sidebar**, different item sets for PM vs Client (see Screen inventory above); collapsible.
- Every screen uses a shared **PageHeader** (title, optional subtitle, optional breadcrumb, action buttons on the right) for consistency.
- No deep-linking conventions beyond direct route URLs (no query-param-driven modals, no shareable "jump to this field" links).
- Back behavior is explicit breadcrumbs/buttons, not browser-history-dependent.

## Empty and blocked states

- No pages in a project yet → empty-state illustration + "Add Page" call to action.
- No design uploaded on a page yet → "No design uploaded yet" with an upload prompt (PM) or "Your project manager hasn't added the design for this page yet" (Client, read-only).
- No clients yet → "Add Client" prompt on the Clients page; the New Project form shows "No clients yet — switch to 'New client' above."
- Figma not connected → a banner in the Add Page modal's Figma tab linking to Settings → Integrations.
- Wrong role for a route → redirected by the layout's Server Component (PM hitting a `/client/*` route, or vice versa, bounces to their own home).
- Signed out hitting any protected route → redirected to `/login`.

## First-use journey

- **PM**: signs up, picks a role, lands on an essentially empty Dashboard (0 projects). No guided onboarding/checklist currently — the natural next step (add a client, then a project) is implied by the UI but not scripted. **[OPEN QUESTION]** — worth adding a first-run checklist/empty-state CTA sequence?
- **Client**: can only be usefully onboarded *after* a PM has added their email under a client. If they sign up before that, they land on a dashboard with nothing linked — see the open question flagged in the PRD about this edge case.
