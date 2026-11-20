# App Flow — CopyDash

## Entry points

- `/` — signed out → `/login`; signed in → `/dashboard`.
- `/login` — public.
- `/signup` — public; creates an account that starts a new workspace. Editors and contributors join through an invitation link.
- `/invite/[token]` — public; landing page of an invitation link. Shows "create your account" (no account for that email yet), "sign in to accept" (account exists), "accept" (signed in with that email) or "sign out first" (signed in as someone else); a used or cancelled link shows "this invitation can't be used". Accepting lands on `/dashboard`. An existing account can join in any role.
- Old addresses (`/pm/*`, `/client/*`, including links in emails already sent) redirect to the new ones.

## Roles

Everyone uses the same app. A role is held **per project**: someone can be an admin in their own workspace and a contributor on another workspace's project.

- **Admin** — manages the workspace: projects, people, settings.
- **Editor** — on the projects they're on: adds, removes and edits pages, moves statuses, invites and removes contributors.
- **Contributor** — on the projects they're on: edits copy while a page is In Progress, submits for review, comments. Creates nothing. Stored as `client` in the database, displayed as "Contributor".

## Screen inventory

Sidebar for everyone: Dashboard, Projects, Settings, Help & Support. All routes are protected by `app/(app)/layout.tsx`.

| Screen | Route | Purpose | Who |
|---|---|---|---|
| Dashboard | `/dashboard` | People in a workspace: KPIs, recent projects, what needs attention, activity feed (admins). Contributors: each of their projects with its pages, "Your turn" first | Everyone |
| Projects list | `/projects` | Active projects they can see, filter by status, search. Row menu: rename, edit company, archive (admins) | Everyone |
| New Project | `/projects/new` | Name + optional company | Admins |
| Project | `/projects/[projectId]` | **Pages** tab: list, add/rename/archive (admins, editors); contributors see the pages, theirs to act on first. **People** tab: admins and editors only | Everyone |
| Design / Field Editor | `/projects/[projectId]/pages/[pageId]` | Edit copy on the PDF/Figma design, or in a list of fields when there's no design. Rights follow the person's role on this project | Everyone |
| Settings | `/settings` | Account, Notifications. People in a workspace also get Integrations; admins also Team, Branding, Archive | Everyone |
| Help & Support | `/help` | Static help. Contributors see their project's admin as contact, others CopyDash Support | Everyone |

**People tab:** who is on the project and pending invitations. Admins invite an Editor or Contributor, resend, cancel, and remove anyone except admins (they come with the workspace). Editors do the same for contributors only, and don't see the link of an invitation that also opens a project they aren't on. Inviting can hit the plan's contributor limit.

## Primary journey

1. **Sign up** (`/signup`) → onboarding wizard → workspace, first project, first page.
2. **Create a project** (`/projects/new`) → name + optional company → lands on the project's empty Pages list.
3. **Add a page** → choose PDF upload or Figma import (if connected) → page created with that design attached.
4. **Invite people** (project → People tab) → they get an email link.
5. **Edit content** on the Design Editor (click text in place) or the Field Editor (structured list) → auto-saves per block/field.
6. **Set the status to In Progress** (status menu in the editor header) → contributors see "Your turn" on their dashboard. Every status change emails everyone else on the project ("X changed the status of the Y page to Z").
7. **The contributor edits, then "Submit for Review"** (header button) → page becomes **Pending Review** and locks for contributors; the dashboard's "Pages to review" counts it.
8. **An admin or editor reviews**: each text changed shows who changed it and "Before: …" → status **Completed**, or back to **In Progress** (the contributor then sees what changed).
9. **Export** (PDF/JSON/CSV) to hand off to developers.

Page statuses: **Draft** (being prepared; contributors can read only) → **In Progress** (contributors' turn) → **Pending Review** (admins' and editors' turn) → **Completed** (final; can be reopened). A project's status is the most urgent of its pages' statuses.

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
- **Success state**: if Supabase returns a session immediately, the profile is created and the user is redirected straight to `/dashboard`; if email confirmation is required, a "Check your email" screen replaces the form.
- **Error state**: Supabase's error message shown inline above the submit button.
- **Next screen**: `/dashboard` (the wizard first if they have no workspace).

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

- Persistent left **Sidebar**, the same for everyone; collapsible.
- Every screen uses a shared **PageHeader** (title, optional subtitle, optional breadcrumb, action buttons on the right) for consistency.
- No deep-linking conventions beyond direct route URLs (no query-param-driven modals, no shareable "jump to this field" links).
- Back behavior is explicit breadcrumbs/buttons, not browser-history-dependent.

## Empty and blocked states

- No pages in a project yet → empty-state illustration + "Add Page" call to action.
- No design uploaded on a page yet → "No design uploaded yet" with an upload prompt (admins, editors) or "The design for this page hasn't been added yet" (contributors, read-only).
- A contributor with no project → "You haven't been added to a project yet" on the dashboard.
- Figma not connected → a banner in the Add Page modal's Figma tab linking to Settings → Integrations.
- No access to a project → 404. Admin-only route (`/projects/new`) → back to `/dashboard`.
- Signed out hitting any protected route → redirected to `/login`.

## First-use journey

- **Signing up**: the onboarding wizard (workspace → first project → first page). Inviting people is done afterwards from the project's People tab.
- **Invited**: the link creates the account or signs in, and lands on the dashboard. Invited contributors never see the wizard.
