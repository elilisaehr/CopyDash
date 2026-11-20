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

## PDF → reconstructed page (decided 2026-11-20, inspired by Acrobat's "Export PDF → HTML Web Page")

Goal: a newly imported PDF is no longer one flat picture with text laid over it, but a page rebuilt from separate pieces — live text, real images, a background layer — that looks like the original and can later be exported as HTML. Right panel (text fields) stays as it is.

**User decisions (2026-11-20)**
- Method: true reconstruction (not "image + overlay"); a zone that can't be rebuilt stays a picture.
- Images: replace and crop/zoom inside their frame (no move/resize/delete for now).
- Complex layouts: a "conversion report" listing what couldn't be converted, and a manual "Keep as image" tool (select a zone → it stays a non-editable picture).
- Who: everyone on the page can do it (Admin, Editor, Contributor), within the existing "who may edit when" rules of the review flow.
- Existing PDF pages: untouched (old mode). Only new imports use the reconstructed page.
- Multi-page PDF: one CopyDash page, PDF pages stacked (as today).
- The uncommitted photo-zoom work on `feat/editor-flow-ai` is not committed (user: "everything will change"); it stays in the working tree for the old mode.

**How it works (technical)**
Extraction runs once, in the browser (pdf.js, already used), right after upload, and is saved — the editor no longer re-reads the PDF on every visit.
1. **Text** → paragraphs with position, font, size, weight, colour, alignment (today's `buildBlocks`), plus structure: heading level from font-size ranking (H1/H2/H3/paragraph), list items, links (PDF link annotations).
2. **Images** → every picture drawn on the page (pdf.js operator list: image draws + their position/size/clip), each saved as its own file in Storage.
3. **Background** → the page rendered with text and images left out: fills, borders, vector shapes, gradients. Saved as one image per page.
4. **Fonts** → fonts embedded in the PDF are loaded so live text uses the real typeface; a subset font missing a typed letter falls back to the page's design fonts (`design_fonts`).
5. **Conversion report** → per page: text drawn as outlines (not editable), scanned page (no text — OCR not supported), missing fonts, rotated text, transparency/blend effects, probable tables, text over images, very many small images (vector art rasterised).
Stored as a JSON "document model" (new table, one row per page) + files in the existing Storage bucket. Text edits keep using `design_edits` keyed by block id. New `pages.design_source` value `pdf_html`. Migration `0010` (dev first; prod at release).

**Feasibility test (2026-11-20) — OK.** `lib/pdf-reconstruct.ts` + dev-only bench `/dev/pdf-lab` (404 in production). On the Fondation Borel PDF (Figma export, 1440×5793, 23 images): 2.8 s in Chrome, 9 vector layers (66 KB) + 23 image placements (18 files), 57 text blocks; rebuilt page matches the original except image resampling noise and anti-aliased card edges (~10% of non-text pixels flagged, all visually invisible). Findings that shaped the design:
- Figma PDFs draw visible text as vector outlines (Type3 "FigmaGlyphs"); the real text is an invisible layer. Glyph paths are found as paths ≥60% covered by text boxes and left out of the layers. No usable embedded font → text uses the design fonts.
- Images are placed through clip paths (rounded rect radius read from the path's first point) and opacity (`ca`); carousels stack hidden slides.
- Vector fills are painted *above* some images (hero gradient overlay), hence layers interleaved with images in paint order, not one background.
- pdf.js `operationsFilter` can't be used to drop single ops (fills that also define clips lose the clip); instead every op runs and canvas paint calls are gated per op. Whole balanced blocks (save…restore, groups, forms) with nothing of the current layer are skipped. Node + @napi-rs/canvas gives wrong results for this — test in the browser only.
- Speed (user's "Home final.pdf", Synova, 1920×11445, 37 images, 57 masks): first version >5 min → 10 s. Vector drawing joins an earlier layer unless something painted in between overlaps it (26 layers instead of one per gap), each layer is rendered only over its own area, text-box lookups use a grid. Borel: 1 s. The tab is busy during extraction — show progress at import (and consider a worker later).
- Soft masks: Figma wraps frames/photos in masks that are just solid rectangles → treated as clips (photo stays replaceable). Real fading masks (gradients, non-rectangular shapes) → the photo stays in the background layers, reported as `masked_images`. Synova: 32 replaceable photos, 5 kept in the background, 0.85% of non-text pixels differ; Borel 0.3%.

**Built on `feat/pdf-to-html` (2026-11-20, not committed):** `0010_pdf_reconstruction.sql` (applied on dev), `lib/pdf-rebuild-store.ts` (split → upload → `pdf_reconstructions`; load), `createPage` splits the PDF before creating the page (password-protected PDFs refused with a message; other failures fall back to `design_source = 'pdf'`), progress banner on Add Page / onboarding, editor `pdf_html` mode (flattened background + live text, "Conversion report · n" modal, Replace re-splits first). When text grows, the page is redrawn piece by piece (`drawStack` in `design-page.tsx`): layers below a cut move down, a layer crossed by a cut repeats its own row (sections and buttons get taller), pictures crossed by a cut zoom inside their own frame, paint order kept — no more image guessing (that broke buttons next to a fading photo).

**Edge cases handled (tested on Borel, Synova and a 3-page Chrome PDF: hero photo + gradient + logo, columns, list, card, rotated text, tiny text, table, mixed styles, scanned page):**
- Text that isn't visible on the page (hidden carousel slides, text under a picture): compared against the original render, left out → `hidden_text`.
- Icon fonts writing icon names as text ("angle-right"): kept as pictures → `icons_as_text`.
- Rotated / slanted text: kept in the background, not editable → `rotated_text`.
- Pictures used on several pages (pdf.js `commonObjs`, ids `g_…`) are extracted too.
- `text_as_shapes` only reported from 5 paths (an underline isn't worth a warning).
- Paragraphs mixing fonts/sizes → `mixed_styles` (rich text still deferred).
- Scanned page → `scanned_page`, picture extracted.

**Round 2 (user test on Citadelle "Accueil 03" + Synova):**
- A failed rebuild at import no longer falls back silently: PDF pages created since 2026-11-20 that are in the classic editor show a banner with the reason (kept in sessionStorage for the session) and "Try again" (re-splits the stored PDF; edits stay attached — same block ids). "Home final v2" was fixed this way; the failures happened while the code was being edited (no files were uploaded), a dry-run of the save step in `/dev/pdf-lab` passes on all test PDFs.
- Growing text cuts through the middle of its last line on rebuilt pages, so a button or card grows from its middle (keeps its padding and rounded corners); each layer stretches its plainest row near the cut (an icon on the cut row no longer streaks).
- Text detection (`buildBlocks`, shared with the classic editor): items join a line only if their sizes are similar and the baseline tolerance uses the smaller font; column gaps are judged on the smaller font — a big title no longer swallows the small text beside it. Glyph paths: ≥60% covered by text boxes, or ≥35% and ≥60 drawing commands (a paragraph drawn as one shape leaves its blank lines uncovered).
- Rebuilt headings keep the designer's line breaks.
- `/dev/pdf-lab` now uses the app's render scale and dry-runs the save step.

**Round 3 — fidelity target ≤ 0.05% of non-text pixels (user, 2026-11-20):**
- The background shown in the editor is no longer stacked by us: pdf.js renders the whole page minus the editable text in one gated pass (`ReconstructedPage.background`), saved as JPEG at quality 1 (below 1, Chrome subsamples colour: 0.08–0.1% drift on Synova). Measured as saved (JPEG decoded again) in `/dev/pdf-lab`: Borel 0%, Citadelle 0%, Chrome 3-page test 0.0006/0/0%, Synova 0.0002%.
- Pieces (used only to redraw the page while a text is longer than the design): each picture is now also rendered by pdf.js in its frame (`shown`, clip/corners/opacity baked in, uploaded as PNG). Citadelle 0.041%, Chrome test 0%, Borel 0.052% (a colour layer with a blend mode over a photo can't be split exactly), Synova 0.87% (many blend-mode/mask effects). Tried running soft-mask definitions in every layer render: broke pdf.js compositing (13%), reverted.
- Cost: more files per import (shown pictures + bigger JPEG background; Synova ~35 MB, Borel ~19 MB, Citadelle ~11 MB) and a longer split on picture-heavy pages (Synova ~27 s vs 15 s). Timings in a long-running test tab are unreliable (memory) — re-measure in a fresh tab.

**Known limits left:** single-line text over a photo can't widen past its original width (free space is read from the image, a photo stops it); links and underlines aren't kept as such yet (HTML export step); the tab is busy for a few seconds during the split.

**Step 2 — photos (built 2026-11-20 on `feat/pdf-to-html`, not committed):** migration `0011_pdf_photos.sql` (applied on dev; prod at release, backward compatible), `lib/pdf-photos.ts` (load/save, upload resized to ≤2400 px, cover-fit and crop geometry), `components/features/photo-overlay.tsx` (outline, Replace / Crop / Reset toolbar, drag + zoom slider). Display: with no text grown, the page stays the exact background and only the frames of changed photos are redrawn from the pieces (paint order kept); when text grows, the edited photos are part of the piece-by-piece redraw. Old uploaded files are not deleted from Storage when a photo is replaced again (contributors can't delete files) — clean-up later.

**Text fidelity pass (2026-11-20, branch `feat/pdf-lab-tests`):**
- `/dev/pdf-lab` now also scores the **text** (the background score left text zones out): per block, the PDF's ink (original minus background) gives its lines; the editor's DOM gives the live lines; compared on line count, widest-line width, position and colour (`app/dev/pdf-lab/text-check.ts`). Also words of the PDF text layer missing from the blocks or doubled, an overlay of the original (fade / difference / blink), a font picker, and "Run every reference PDF" (serves `~/Desktop/Test`, or `PDF_LAB_DIR`, through the dev-only route `app/dev/pdf-lab/files`).
- Baseline on the 12 reference PDFs (all Figma exports): background ≤ 0.2% everywhere, but only 29–77% of text blocks right. Causes: (1) Figma PDFs carry no font (Type3 "FigmaGlyphs"), so live text was in the browser's generic sans-serif at 96% size — ~5% narrow, wrong line breaks; (2) words cut by a space ("conserv at") where the PDF splits a word into several runs.
- Fixes: (1) on rebuilt pages, `EditableBlock` (`layout.fitWidth`, set by `DesignPage liveText`) uses the PDF's size and sets letter spacing so each block's widest line, in whatever font is shown (default or the page's design fonts), is as wide as in the PDF (capped −0.08 em … +0.12 em); applies to existing rebuilt pages too (no data change). (2) `buildBlocks(…, joinRunsByGap)` joins runs with a space only where there's a gap (> 0.05 em) or the next run starts before the middle of the previous one (a separate text; pieces of one word touch or overlap by up to ~1 em) — rebuilt pages only, at import; legacy PDF pages keep the old join so their block ids (and saved edits) don't change.
- Second round, same branch: (3) the text box on fitted pages is exactly the PDF width (+1px) instead of +10px slack, and centred / right-aligned blocks no longer sit 5 / 10px off; (4) paragraphs also match the PDF's line count (spacing nudged on the hidden twin, same caps); (5) at import, a block's right edge is read from the ink (Figma states runs up to ~1 em wider than drawn); (6) the first baseline is placed on the PDF's from the shown font's measured ascent/descent (was a fixed −3px); (7) when even the tightest spacing is too wide (very large headings), the size shrinks (down to 80%); (8) icons written as private-use characters (Font Awesome U+F04B…) or as Material ligature words ("search", "check": a run ~1 em wide) stay pictures.
- Result: 91–100% of text blocks right on the 12 reference PDFs. The design-fonts picker (Fonts button, `pages.design_fonts`) already applies to rebuilt pages, and the fit runs again on the picked font.
- Known limits: very short big numbers ("1.", "25") can't be fitted by spacing; Figma text boxes whose overflow is clipped in the design (cards cut at "…conserv…") contain hidden lines that the editor shows (decision pending); text runs laid over each other on one line (GDS "Read more" under a heading) end up in one block.

**Design fonts at import (2026-11-20, same branch):** the user wants the page to look like the final result, so fonts must be the design's. Figma PDFs carry no font name, so fonts are recognised from the letters (`lib/font-detect.ts`): per PDF text style (pdf.js font → `styleKeyOf`, saved on each block as `styleKey`), up to 3 sample lines of the page's ink are compared with the same text rendered in ~117 popular Google families at every weight (letter spacing fitted to the ink width, text case and capitals, quick pass then blurred + shifted Dice on the best 20). Google fonts are fetched through `app/api/typefaces/route.ts` (server proxy, fonts.googleapis.com / fonts.gstatic.com only, CDN-cached a day).
- Import flow (`lib/create-page.ts`, `components/features/font-step.tsx`): after the PDF is split, "Design fonts" opens with one row per detected font: the PDF's own line next to the same text in that font, a confidence badge (≥ 0.85 "Match found", ≥ 0.78 "Probable", else "Closest free font — upload yours"), a picker (suggestions, uploaded files, Google families) and "Upload font file" (.otf/.ttf/.woff/.woff2, registered for every weight so no faked bold). Confirmed fonts are saved in `pages.design_fonts.styles` (+ `files`) with the page; Skip keeps the default font.
- Editor: `withFont` applies the style's font and weight to each block (fit-to-width then runs on it); the Fonts button on rebuilt pages opens the same step (`components/features/editor-fonts.tsx`) with "Recognise the fonts again" (re-splits the stored PDF) — for pages imported earlier or skipped.
- Content blockers: the user's Chrome blocked requests to Google Fonts and an upload to `…/fonts/x.ttf` ("Failed to fetch" at import). So page fonts are also loaded through our server (`registerGoogleFamily`, `/api/typefaces`, neutral URL), and uploaded font files are stored as `<project>/design-assets/<uuid>` (family name kept in `design_fonts.files`); an upload error now names the font file.
- Accuracy on the 12 reference PDFs (user's real fonts): Google fonts found — Urbanist 5/5 styles, Open Sans, Roboto, Source Serif 4 (for Source Serif Pro), Manrope, Inter; Libre Baskerville proposed for Baskerville. Paid fonts (IvyPresto, Avenir, DIN, Catalogue, General Sans) get a look-alike, mostly with a low score; Frutiger → Noto/Open Sans scores high (false confidence). Citadelle: two styles detected as IBM Plex Sans (near-perfect overlay) where the user expected Manrope — to check in Figma.

**Steps (in order)**
1. **Extraction + display + report** — import → extract → save → show the rebuilt page in the editor (background, images, live editable text; longer text pushes the content below down, as today) and the conversion report. Starts with a feasibility test on real PDFs (incl. the Fondation Borel one) before building the screens.
2. **Images** — replace an image (upload) and crop/zoom it in its frame.
3. **Keep as image** — select a zone; it is rendered as a picture from the original PDF, its text removed from the editable fields.
4. **HTML export** — later.

## Next up — product decisions of 2026-10-23 (in this order)

### Status (2026-11-05)

- **A + speed pass — released** (PR #2, merged 2026-10-28; `0007` applied on prod).
- **Single space — built on branch `feat/single-space`, tested on dev, not released yet** (see "Single space" below). Comes before C.
- **B Clearer review — released** (PR #3, merged 2026-10-28; `0008` applied on prod).
  - Page statuses keep their names — Draft → In Progress (with the client) → Pending Review (with the agency) → Completed — but each now means a turn (migration `0008_review_flow.sql`; the user preferred these names over With client / To review / Approved). The database decides who may move a page: the agency anywhere, a client only "submit" a page that is In Progress; clients can edit copy only while the page is In Progress.
  - No banner (the user asked to remove it): the agency changes status with the status menu in the editor header, the client with a "Submit for Review" button (shown while the page is In Progress). Both go through `lib/actions/review.ts`.
  - "What changed": each status change snapshots the copy; once a page has gone back and forth, each text changed in the last round shows "Changed by X — Before: …".
  - Email alert on every status change to everyone on the project (workspace admins, project editors, project clients) except the person who made it: "X changed the status of the Y page to Z". Switch "Page status changes" in Settings → Notifications (both sides). Same Resend limit as invitations.
  - Project status is now derived from its pages (Pending Review > In Progress > Completed > Draft); dashboards count "pages to review".
  - Permission tests: `supabase/dev/review-test.cjs` (run by `rebuild.sh`).
  - **Release checklist:** (1) paste `0008_review_flow.sql` into the **prod** SQL editor — backward compatible with the deployed code, apply before merging; (2) PR + Vercel preview; (3) merge.

### Earlier status — A (paused 2026-10-23)

- **A1 Database — done.** Migration `0007_workspaces_roles.sql` (workspaces, workspace_members, project_members.role, invitations, plan_limits, backfill, RLS, plan-limit triggers). Also fixes a live hole: the old `pm_id` policies let any signed-in user write projects/clients into someone else's workspace.
- **A2 App by role — done.** Workspace-scoped queries (`lib/workspace.ts`), admin-only routes/actions, plan-limit notices (`lib/plan.ts`).
- **A4 Onboarding — done.** `/onboarding` wizard, browser-tested end to end on dev.
- **Speed pass — done (2026-10-28).** Server functions pinned to Frankfurt (`vercel.json`, next to the prod DB — they were running in Washington), per-request dedupe of session/profile/workspace reads, parallel + joined queries, loading skeletons. The region change only applies once this branch is deployed.
- **A3 Invitations — done (2026-10-28), browser-tested on dev.** Settings → Team lists members (owner, admins, editors + their projects), pending invitations (copy link / resend / cancel) and an invite form (Editor / Admin / Client + projects). Clients → card menu "Send invite" / "Copy invite link" invites the client's primary email to all its projects. Actions in `lib/actions/invitations.ts`; email via Resend REST in `lib/email.ts` (best-effort: if it fails, the admin gets the link to share). `/invite/[token]` (service role, `app/invite/[token]/actions.ts`) creates the account for the invited email or signs an existing one in, grants workspace/project membership, marks the client company Active. Sign-up is now agency-only (no Client choice). `team_invitations` is no longer used.
  - **Before inviting real people:** verify a sending domain in Resend and set `RESEND_FROM` (e.g. `CopyDash <invites@yourdomain>`); until then Resend only delivers to the Resend account owner's address. Add `RESEND_API_KEY` (and `RESEND_FROM`) to Vercel's environment variables. Optional `NEXT_PUBLIC_SITE_URL` fixes the link host (otherwise taken from the request).
- **Next after B: single space, then C (export for developers).**
- **Dev environment:** `npm run dev` uses the `copydash-dev` Supabase project via `copydash-app/.env.development.local`; prod stays on `.env.local`. Dev test accounts: pm1 / pm2 / client1 / editor1 / newpm `@copydash.test` (password `Test-1234!`), created by the scratch seed script.
- **Release checklist for A (when done):** (1) paste `0007_workspaces_roles.sql` into the **prod** Supabase SQL editor — it's backward compatible with the deployed code, so apply it *before* merging; (2) open a PR, check the Vercel preview with a real account; (3) merge. Existing PMs become admins on the 'pro' plan.
- Later: decide paid plan limits/prices (D), then Stripe; mixed text styles (Milestone 4).

**A. Roles, workspaces and onboarding**
- Three roles: **Admin** (agency owner — creates projects, manages everything and everyone), **Editor** (agency teammate — can add/remove and edit pages, only in projects they're invited to), **Client** (edits the copy on their pages only, creates nothing).
- Introduce a workspace (the agency) that owns projects, so limits and billing attach to it. Existing PMs become Admins of an auto-created workspace; existing clients stay Clients.
- Real invitation emails (Resend) for editors and clients — replaces today's cosmetic Team invitations.
- Onboarding: a short first-login wizard — agency name → first project → first page (PDF or Figma) → lands in the editor; inviting someone is offered at the end, optional.

**B. Clearer review**
- Statuses that say who must act: Draft → In Progress (client) → Pending Review (agency) → Completed.
- Show what changed since the last hand-off (before/after, who edited what).
- Email notification when it's someone's turn (uses A's email provider).

**Single space (decided 2026-11-05, before C)**

Everyone uses the same app and the same URLs. Roles are Admin / Editor / Contributor; the words "client", "PM" and "agency" leave the UI. The Clients page is replaced by a "Company" field on each project and a "People" tab per project.

What a role can do does not change: Contributor = today's client (edits copy while a page is In Progress, submits for review, comments; creates nothing).

Technical choices:
- **No rename in the database.** `project_members.role` and `invitations.role` keep the value `client`, displayed as "Contributor" through one mapping (`lib/roles.ts`). Renaming would break the deployed code during a release, and users never see these values.
- **Permissions become per project, not per account.** `profiles.role` stops deciding what someone sees. A new helper returns the person's role on a given project: admin if workspace admin, otherwise their `project_members.role`. The editors take that role instead of the route they were opened from. Row Level Security stays the real gate; existing policies already work per project.
- **Nothing is deleted.** `clients` and `client_emails` stay in the database, unused, so a rollback stays possible and contact details are not lost. They can be dropped in a later migration.

Steps, each one tested on dev before the next:
1. **Database — migration `0009_single_space.sql`.** Add `projects.company` (text), backfilled from `clients.name`; safe to re-run. Add `project_role()`. Add `plan_limits.max_contributors` (null = unlimited on every plan until D sets the numbers), enforced by a trigger on invitations: it counts distinct people, contributors on active projects plus pending contributor invitations, and re-inviting someone already counted always passes. Drop the `link_client_projects` and `link_new_client_email` triggers: access now comes only from invitations, and they would undo a removal from the People tab whenever a profile is saved. Update the wording stored or raised by the database (activity feed, review guard). Backward compatible with the deployed code.
2. **One space and one URL set.** A single protected route group (`app/(app)/layout.tsx`, no middleware): `/dashboard`, `/projects`, `/projects/new`, `/projects/[id]`, `/projects/[id]/pages/[pageId]`, `/settings`, `/help`. Old links keep working, including those in emails already sent: `/pm/*` via `redirects()` in `next.config.ts`, `/client/pages/[id]` via a small page that looks up the project. Check `node_modules/next/dist/docs/` first.
3. **Roles in the screens.** Merge the dashboards, settings and sidebar; items depend on role. Contributors see their projects (no longer limited to one) with "your turn" pages first, and Account + Notifications in settings. The login page loses its PM/Client switch. `/invite` no longer refuses someone whose account has the other type, and everyone lands on `/dashboard`. Onboarding stays for accounts that signed up themselves, never for invited Contributors. Projects lists include projects from other workspaces the person was invited to, not just their own.
4. **Company field.** Replaces the client picker in New Project and onboarding; shown on project lists. `export-modal` reads it too. Remove `/pm/clients`, `clients-screen.tsx` and `inviteClient`.
5. **People tab per project.** Visible to Admins and Editors only, never to Contributors. Lists admins, editors, contributors and pending invitations. Admins can invite an Editor or Contributor to this project, resend/cancel and remove anyone from it. Editors can do the same for Contributors only, on their own projects. Server actions check `project_role()`, then use the service role, so invitation links stay unreadable to Editors. Settings → Team stays for the workspace-wide view and for inviting admins.
6. **Wording pass.** UI, emails (`lib/email.ts`), help page, comment labels, placeholders.
7. **Tests and docs.** New `supabase/dev/single-space-test.cjs` run by `rebuild.sh` (a Contributor on two projects, an admin invited to another workspace as Contributor, removal cuts access); keep `rls-test` and `review-test` green; browser test of each role; update docs 01–05.

**Release checklist:** (1) paste `0009_single_space.sql` into the **prod** SQL editor just before merging; (2) PR + Vercel preview, tested with a real account; (3) merge; (4) paste `0009` again to fill the company of any project created in between.

**Security audit (2026-11-05, `vibe-security` skill).** Fixed in `0009` and the code, with attack tests in `supabase/dev/security-test.cjs` (run by `rebuild.sh`):
- Taking a client company's email on your own profile gave access to its projects (old triggers from `0002`, **live on prod until `0009` is applied**).
- Comments could be rewritten or forged by any project member, and could target a page of another project.
- Contributors could change field labels, limits and the "what changed" history, not only the text.
- Profile email and account type could be changed freely; the email is now always the login's (read-only in Settings).
- A removed or demoted admin kept admin rights on the projects they created; these now go to the workspace owner.
- Resending an invitation returned its link to an editor who wasn't allowed to see it.
- Added security headers (framing, referrer, MIME type) and `server-only` on the Supabase server client.

**Must be done before inviting real people (with the verified Resend domain):**
1. **Prove email ownership when an account is created from an invitation.** `createAccountAndAccept` confirms the email automatically because "the link proves it", but anyone can sign up, invite someone else's address, copy the link and create a confirmed account with their own password on that address. Needs working email, so the invitation link alone must stop being enough (confirmation email or code).
2. **Limit the emails a person can trigger** (invitations and resends per user per day). Today anyone can sign up and have CopyDash send invitations with their own workspace name to any address, which would damage the domain's reputation.
3. **Add "forgot password".** It doesn't exist, so someone locked out, or whose address was taken as in point 1, has no way back.

**Later:** invitation links never expire (add an expiry); `signInAndAccept` allows password guesses through our server, so Supabase's per-address limits matter (check them, add a limit with point 2); Figma tokens are stored unencrypted (protected by access rules); a person can create extra workspaces to get around the free plan's limits (handle in step D); confirm that Vercel's Preview environment doesn't use production keys. CSP is limited to `frame-ancestors` for now.

**Left to delete:** `components/screens/clients-screen.tsx`, then `inviteClient` in `lib/actions/invitations.ts`, `app/client/loading.tsx`, and the `Client` / `ClientEmail` types. Unreachable, but they must go together or the build breaks. `app/client/*` and `app/pm/clients` stay as small redirect pages for old links.

Out of scope: real email domain (still needed before inviting real people), changing someone's role after they joined, a person switching between several workspaces, dropping the old tables.

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
