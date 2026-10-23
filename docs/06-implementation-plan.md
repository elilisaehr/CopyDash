# Implementation Plan — CopyDash

> Unlike a from-scratch build, CopyDash already has a working v1 deployed on Vercel. This plan documents **Milestone 0 (already shipped)** as context for any AI coding tool/dev picking this up, then lays out the real remaining work — including two gaps found by comparing your live GitHub repo against what was actually built and tested.

## ⚠️ Two things to know before anything else

1. **The paragraph-merge fix for the PDF Design Editor is NOT yet live.** It was built and verified (against a real multi-paragraph PDF) in a previous session, but the resulting code was never uploaded to this GitHub repo — `lib/pdf-design.ts` in `main` today is still the line-by-line version. If this is the "primordial" fix you cared about, **it needs to be re-applied and actually pushed** before you consider the Design Editor done. Flagging this now so it's an explicit task below, not a surprise later.
2. **No `middleware.ts` currently exists** — this is intentional (it crashed on Vercel's Edge runtime), with route protection handled entirely by each route group's `layout.tsx`. Don't re-add middleware without re-testing it end-to-end on Vercel, not just locally.

## Milestone 0 — Already shipped (context, not a task list)

- Auth (email/password), PM/Client roles, route protection via layout-level redirects.
- Projects, Clients (multi-email), Pages — full CRUD, including rename/archive/restore.
- PDF upload → client-side text extraction & rendering (pdf.js) → in-place Design Editor.
- Figma import (Personal Access Token per PM) → same in-place Design Editor, no geometry guessing needed.
- Field Editor (structured fields) as an alternative/fallback to the Design Editor.
- Comments per field, rule-based SEO scoring, mocked AI writing suggestions.
- Export to PDF/JSON/CSV.
- Client portal (own dashboard, own page editor).
- Settings: Account, Notifications, Team (invites — cosmetic), Branding, Figma Integration, Archive.
- Deployed on Vercel from this GitHub repo.

## Milestone 1 — Close the known gaps (recommended first, before new features)

| Task | Output | Definition of done | Dependency |
|---|---|---|---|
| Re-apply the PDF paragraph-merge fix | Updated `lib/pdf-design.ts` + the word-count warning UI in the Design Editor | Pushed to `main`, deployed, verified against a real multi-paragraph PDF (not just unit logic) | None |
| Set up real `git push` access from VS Code/Cursor | Working local clone with push rights | You can commit + push without the manual zip-upload workaround | GitHub access already exists — this is just local setup |
| Decide on password reset | Either a real "forgot password" flow (Supabase Auth supports this natively) or explicitly deprioritize it | The Settings → Account password form either works or is removed/labeled "coming soon" instead of silently doing nothing | None |
| Review Figma token storage | Decision: accept plaintext storage for now, or add encryption | Documented decision in the TRD; implemented if "encrypt" is chosen | None |

## Next up — product decisions of 2026-10-23 (in this order)

### Status (paused 2026-10-23) — branch `feat/workspaces-roles`, not pushed, not deployed

- **A1 Database — done.** Migration `0007_workspaces_roles.sql` (workspaces, workspace_members, project_members.role, invitations, plan_limits, backfill, RLS, plan-limit triggers). Also fixes a live hole: the old `pm_id` policies let any signed-in user write projects/clients into someone else's workspace.
- **A2 App by role — done.** Workspace-scoped queries (`lib/workspace.ts`), admin-only routes/actions, plan-limit notices (`lib/plan.ts`).
- **A4 Onboarding — done.** `/onboarding` wizard, browser-tested end to end on dev.
- **A3 Invitations — next.** Replace Settings → Team (still the cosmetic `team_invitations`) with: invite editor/client to chosen projects → row in `invitations` → email via Resend (`RESEND_API_KEY` in `.env.local`; without a verified domain Resend only delivers to the account owner's address) → `/invite/[token]` accept route (service role) that creates/links the account and memberships. Revisit the signup role picker at the same time (clients/editors should arrive via invite links).
- **Dev environment:** `npm run dev` uses the `copydash-dev` Supabase project via `copydash-app/.env.development.local`; prod stays on `.env.local`. Dev test accounts: pm1 / pm2 / client1 / editor1 / newpm `@copydash.test` (password `Test-1234!`), created by the scratch seed script.
- **Release checklist for A (when done):** (1) paste `0007_workspaces_roles.sql` into the **prod** Supabase SQL editor — it's backward compatible with the deployed code, so apply it *before* merging; (2) open a PR, check the Vercel preview with a real account; (3) merge. Existing PMs become admins on the 'pro' plan.
- Later: decide paid plan limits/prices (D), then Stripe; mixed text styles (Milestone 4).

**A. Roles, workspaces and onboarding**
- Three roles: **Admin** (agency owner — creates projects, manages everything and everyone), **Editor** (agency teammate — can add/remove and edit pages, only in projects they're invited to), **Client** (edits the copy on their pages only, creates nothing).
- Introduce a workspace (the agency) that owns projects, so limits and billing attach to it. Existing PMs become Admins of an auto-created workspace; existing clients stay Clients.
- Real invitation emails (Resend) for editors and clients — replaces today's cosmetic Team invitations.
- Onboarding: a short first-login wizard — agency name → first project → first page (PDF or Figma) → lands in the editor; inviting someone is offered at the end, optional.

**B. Clearer review**
- Statuses that say who must act: Draft → With client → To review (agency) → Approved, replacing the two-way "Pending Review"; a clear "your turn" banner.
- Show what changed since the last hand-off (before/after, who edited what).
- Email notification when it's someone's turn (uses A's email provider).

**C. Export for developers**
- Copy button on every text; a read-only page view to copy from.
- A PDF of the page design with the final copy as real, selectable text, so a developer can copy-paste from it.
- CSV, Excel and Word exports.

**D. Paid plans**
- Free: 1 project, 2 pages. Two paid plans — limits and prices not decided yet, so build plan limits as data that's easy to change. Stripe once pricing is set.

## Milestone 2 — Data and auth hardening

- Decide and implement a data retention/deletion policy (see Backend Schema doc, "Retention and deletion").
- If targeting EU clients: GDPR review (right to erasure, data processing agreement with Supabase, etc.).
- Add a real "delete my account" flow if required by the above.
- Tighten `client_emails` uniqueness if decided (see Backend Schema doc).

## Milestone 3 — Core journey polish

- Add a visible error state when a Design Editor block fails to save (currently silent/generic).
- Replace remaining browser `alert()`/`confirm()` dialogs (archive confirmation, some error paths) with the app's own modal styling.
- First-run guidance for a brand-new PM (empty Dashboard today has no explicit "add your first client" nudge).
- Decide what an unlinked Client (signed up before their email was added anywhere) should see instead of an empty dashboard.

## Milestone 4 — Secondary features (only if the PRD's open questions resolve toward "needed for v1")

- **Mixed styles inside one text block (decided: rich text, deferred — not a priority).** A Figma text node can mix colours/weights (e.g. a title whose second line is orange); today an edited block takes the first style only. Plan: import Figma's per-character style runs (`characterStyleOverrides` + `styleOverrideTable`), render the editable overlay as styled spans so typing inherits the run under the caret, store runs alongside the plain-text edit (new `design_edits` column; plain `content` stays for export/SEO/AI), and re-map runs when the side-panel textarea edits plain text (unchanged prefix/suffix keep their style, inserted text takes its neighbour's). Figma first; PDF later via per-item ink sampling.

- Wire a real LLM provider behind `lib/ai-mock.ts`'s existing interface (writing suggestions + "extract content from PDF").
- Wire a real transactional email provider for Team Invitations and Client invitations.
- Real Team/seat management if multi-person agencies are the target customer.
- Billing/subscription if this becomes a paid product.

## Milestone 5 — Quality

- Accessibility pass (see UI/UX Design Brief — hover-only action buttons, contrast/focus audit).
- Responsive/small-screen audit (currently desktop-only assumption).
- Basic automated tests: at minimum, the auth/role redirect logic and the PDF paragraph-merge heuristic (both are easy to silently regress and hard to notice visually).
- Performance pass once real usage patterns are known (no targets are set yet — see TRD).

## Milestone 6 — Release process

- Add a staging environment (a second Vercel project + a second Supabase project, or Vercel preview deployments pointed at a staging Supabase instance) so changes aren't tested directly in production.
- Basic CI: run `npx tsc --noEmit` + `npx eslint .` + `npm run build` on every push, at minimum (all three are already clean on the current codebase — this just keeps them that way automatically instead of by habit).
- A rollback plan beyond "Vercel's Instant Rollback button" (which only reverts the deployed build, not any database migration that shipped alongside it — worth keeping migrations backward-compatible for exactly this reason).
- Monitoring: Vercel's built-in logs/analytics are available; nothing beyond that is currently configured (no error tracking like Sentry, no uptime monitoring).

## Before moving to each next task

Run the app (`npm run dev`), verify the relevant acceptance criteria from the PRD, and note anything that doesn't match this plan — these six documents should get updated as the app changes, not treated as frozen once written.
