# Backend Schema — CopyDash

> Transcribed directly from the actual migrations in `supabase/migrations/` (`0001_schema.sql` → `0005_rename_archive.sql`). This is the real, current schema — not a proposal.

## Entities (one line each)

- **profiles** — one row per Supabase Auth user; carries the PM/Client role.
- **clients** — a PM's client companies.
- **client_emails** — one or more email addresses per client (used to auto-link a signing-up Client account).
- **projects** — a PM's website projects, each belonging to one client (optional).
- **project_members** — which auth users (clients) can access which project.
- **pages** — a project's individual pages, each optionally carrying a PDF or Figma design.
- **fields** — the Field Editor's structured content fields for a page (not currently populated from a fixed schema — see note below).
- **design_edits** — in-place edits made on the Design Editor, keyed by a computed block id.
- **figma_connections** — one Figma Personal Access Token per PM.
- **figma_designs** — the fetched Figma frame (image + text blocks) for a page.
- **comments** — per-field discussion thread entries.
- **activity_log** — the PM dashboard's activity feed, auto-populated by triggers.
- **notification_prefs** — one row per user, a JSON blob of notification toggles.
- **team_invitations** — a PM's invited teammates (cosmetic — no email sent).
- **branding_settings** — one row per PM, used to white-label the client portal.

## Tables

### `profiles`
| Field | Type | Required | Default |
|---|---|---|---|
| id | uuid, PK, FK → `auth.users` | yes | — |
| role | text, check in (`pm`,`client`) | yes | — |
| name | text | yes | `''` |
| email | text | yes | — |
| phone | text | no | `''` |
| company | text | no | `''` |
| language | text | no | `'English'` |
| avatar_url | text | no | null |
| created_at / updated_at | timestamptz | yes | `now()` |

Index: unique on `lower(email)`.

### `clients`
| Field | Type | Required | Default |
|---|---|---|---|
| id | uuid, PK | yes | `gen_random_uuid()` |
| pm_id | uuid, FK → `auth.users` | yes | — |
| name | text | yes | — |
| contact_name, phone, notes | text | no | `''` |
| status | text, check in (`Active`,`Waiting`,`Archived`) | yes | `'Waiting'` |
| joined_at | date | yes | `current_date` |
| created_at / updated_at | timestamptz | yes | `now()` |

Index: `pm_id`.

### `client_emails`
| Field | Type | Required | Default |
|---|---|---|---|
| id | uuid, PK | yes | `gen_random_uuid()` |
| client_id | uuid, FK → `clients`, on delete cascade | yes | — |
| address | text | yes | — |
| label | text | yes | `'Primary'` |
| is_primary | boolean | yes | `false` |
| created_at | timestamptz | yes | `now()` |

Indexes: `client_id`; `lower(address)` (used for the auto-link match).

### `projects`
| Field | Type | Required | Default |
|---|---|---|---|
| id | uuid, PK | yes | `gen_random_uuid()` |
| pm_id | uuid, FK → `auth.users` | yes | — |
| client_id | uuid, FK → `clients`, on delete set null | no | — |
| name | text | yes | — |
| status | text, check in (`Draft`,`In Progress`,`Pending Review`,`Completed`) | yes | `'Draft'` |
| pdf_filename, pdf_storage_path, extracted_text | text | no | — |
| archived_at | timestamptz | no | null |
| created_at / updated_at | timestamptz | yes | `now()` |

Indexes: `pm_id`; `client_id`; `(pm_id, archived_at)`.

### `project_members`
| Field | Type | Required |
|---|---|---|
| project_id | uuid, FK → `projects`, cascade | yes |
| user_id | uuid, FK → `auth.users`, cascade | yes |
| added_at | timestamptz, default `now()` | yes |

PK: `(project_id, user_id)`.

### `pages`
| Field | Type | Required | Default |
|---|---|---|---|
| id | uuid, PK | yes | `gen_random_uuid()` |
| project_id | uuid, FK → `projects`, cascade | yes | — |
| name | text | yes | — |
| status | text, same check as `projects.status` | yes | `'Draft'` |
| template | text | no | `'custom'` |
| pdf_text, pdf_filename, pdf_storage_path | text | no | — |
| has_pdf_design | boolean | yes | `false` |
| design_source | text, check in (`pdf`,`figma`) | no | null |
| design_seed | text | no | — |
| updated_by_name | text | no | — |
| archived_at | timestamptz | no | null |
| created_at / updated_at | timestamptz | yes | `now()` |

Index: `project_id`.

### `fields`
| Field | Type | Required | Default |
|---|---|---|---|
| id | uuid, PK | yes | `gen_random_uuid()` |
| page_id | uuid, FK → `pages`, cascade | yes | — |
| field_key | text | yes | — |
| label | text | yes | — |
| content | text | yes | `''` |
| max_chars | integer | yes | `200` |
| placeholder | text | no | `''` |
| position | integer | yes | `0` |

Unique: `(page_id, field_key)`. Index: `page_id`.

> Note: the Field Editor as built generates its field list dynamically rather than always reading from this table first — confirm with the actual current `editor-screen.tsx` logic before assuming this table is the sole source of truth for every page.

### `design_edits`
| Field | Type | Required | Default |
|---|---|---|---|
| page_id | uuid, FK → `pages`, cascade | yes | — |
| block_id | text | yes | — |
| content | text | yes | `''` |
| updated_at | timestamptz | yes | `now()` |

PK: `(page_id, block_id)`. For PDF designs, `block_id` is computed client-side from the block's text + its position at 100% zoom (see `lib/pdf-design.ts: buildBlocks`) — stable across zoom levels and screen widths, but **not stable across a design's content changing**. Rows saved before the paragraph-merge fix are keyed per line (and, back then, per zoom level); the Design Editor carries them over onto the paragraph that now contains that line (matched on page + line-text hash) and deletes them when that block is reset.

### `figma_connections`
| Field | Type | Required |
|---|---|---|
| pm_id | uuid, PK, FK → `auth.users`, cascade | yes |
| access_token | text | yes |
| figma_user_name, figma_user_email | text | no |
| connected_at | timestamptz, default `now()` | yes |

### `figma_designs`
| Field | Type | Required |
|---|---|---|
| page_id | uuid, PK, FK → `pages`, cascade | yes |
| file_key, node_id | text | yes |
| file_name, frame_name | text | no |
| image_url | text | yes |
| width, height | integer | yes |
| blocks | jsonb (array of text blocks: position, size, color, font info) | yes, default `[]` |
| fetched_at | timestamptz, default `now()` | yes |

### `comments`
| Field | Type | Required | Default |
|---|---|---|---|
| id | uuid, PK | yes | `gen_random_uuid()` |
| project_id | uuid, FK → `projects`, cascade | yes | — |
| page_id | uuid, FK → `pages`, cascade | yes | — |
| field_key | text | yes | — |
| author_id | uuid, FK → `auth.users`, cascade | yes | — |
| author_name | text | yes | — |
| role | text, check in (`pm`,`client`) | yes | — |
| body | text | yes | — |
| resolved | boolean | yes | `false` |
| created_at | timestamptz | yes | `now()` |

Index: `(page_id, field_key)`.

### `activity_log`
| Field | Type | Required |
|---|---|---|
| id | uuid, PK | yes |
| pm_id | uuid, FK → `auth.users`, cascade | yes |
| project_id | uuid, FK → `projects`, cascade | no |
| actor_name, type, text | text | yes |
| created_at | timestamptz, default `now()` | yes |

Index: `(pm_id, created_at desc)`. **Fully auto-populated by triggers** — the app never inserts into this table directly (see "Migration and seed data").

### `notification_prefs`
| Field | Type | Required |
|---|---|---|
| user_id | uuid, PK, FK → `auth.users`, cascade | yes |
| prefs | jsonb | yes, default `{}` |
| updated_at | timestamptz, default `now()` | yes |

### `team_invitations`
| Field | Type | Required | Default |
|---|---|---|---|
| id | uuid, PK | yes | `gen_random_uuid()` |
| pm_id | uuid, FK → `auth.users`, cascade | yes | — |
| email | text | yes | — |
| role | text, check in (`Admin`,`Editor`,`Viewer`) | yes | `'Editor'` |
| status | text, check in (`Pending`,`Active`) | yes | `'Pending'` |
| invited_at | timestamptz | yes | `now()` |

### `branding_settings`
| Field | Type | Required |
|---|---|---|
| pm_id | uuid, PK, FK → `auth.users`, cascade | yes |
| agency_name | text, default `'Agency Studio'` | yes |
| brand_color | text, default `'#7f22fe'` | yes |
| welcome_message | text | yes |
| updated_at | timestamptz, default `now()` | yes |

## Relationships

- `profiles` 1–1 `auth.users` (same id).
- `clients` 1–many `client_emails`; `clients` 1–many `projects`.
- `projects` many–many `auth.users` (clients) via `project_members`.
- `projects` 1–many `pages`.
- `pages` 1–many `fields`, 1–many `design_edits`, 0–1 `figma_designs`, 1–many `comments`.

## User ownership

- **PM-owned**: `clients`, `projects` (directly, via `pm_id`), and transitively `pages`, `fields`, `design_edits`, `comments` (via the project they belong to), `team_invitations`, `branding_settings`, `figma_connections`.
- **Client-accessed**: a Client sees exactly the `projects` (and everything under them) they've been added to via `project_members` — never another client's data, enforced at the database level by RLS (not just hidden in the UI).

## Authentication flow

- Sign up / sign in: Supabase Auth, email + password.
- Session lifecycle: handled by `@supabase/ssr`'s cookie-based session; refreshed on each server request via the server Supabase client.
- Password reset: **not implemented** in the UI (the Settings → Account screen has a "Change password" form that is cosmetic-only — no real flow wired up). **[OPEN QUESTION / gap]** — needed before real users rely on this.
- First login: `ensureProfile()` creates the `profiles` row from `user_metadata` (role + name chosen at signup) if one doesn't already exist.

## Authorization rules (Row Level Security, summarized)

All tables have RLS enabled. The general pattern:

- **PMs** get full read/write access to rows where `pm_id = auth.uid()` (directly, or via a helper function like `is_pm_of_project()`/`is_pm_of_page()`/`is_pm_of_client()` for child tables).
- **Clients** (project members) get:
  - **Read** access to their project, its pages, fields, design edits, comments, and their PM's branding.
  - **Write** access limited to: updating `pages` (status), `fields` (content), `design_edits` (insert + update — i.e. they can edit copy but the row structure is PM-controlled), and inserting their own `comments`.
- `activity_log`, `team_invitations`, `figma_connections` are **PM-only**, no client access at all.
- Storage (`pdfs` bucket): same pattern via a `is_pm_of_project()`/`is_member_of_project()` check on the path's leading folder (`{project_id}/...`).

## Data validation

- Enforced via Postgres `check` constraints on enum-like fields (`role`, `status` fields, `label` is free text but `is_primary` is boolean-gated).
- Email uniqueness: `profiles` email is unique (case-insensitive); `client_emails` is **not** unique (a PM's two different clients, or two clients across two PMs, could in principle share an email — not currently prevented).
- No field-level length limits are enforced at the database level (the app enforces soft character budgets client-side only, e.g. `fields.max_chars` is a default/suggestion, not a `check` constraint).
- **[OPEN QUESTION]** — any of this worth tightening (e.g. a real uniqueness constraint on `client_emails.address` scoped per PM) before more real data goes in?

## Retention and deletion

**Not formally defined.** Deletes cascade at the database level (e.g. deleting a project deletes its pages, fields, comments, etc. via `on delete cascade`), but there is no scheduled purge, no "delete my account" self-service flow, and no export-before-delete guarantee beyond the existing manual Export feature. **[OPEN QUESTION]** — needed if you'll have EU clients (GDPR right to erasure) or any contractual data-retention commitment.

## Migration and seed data

- Migrations are 5 plain `.sql` files run manually in order through the Supabase SQL Editor (`0001` → `0005`) — there is no Supabase CLI migration history linked to this project, and no automated migration runner in CI (because there is no CI — see TRD).
- No seed data exists; a fresh database starts completely empty, and the natural signup flow (PM signs up → adds a client → creates a project) is the only way to populate it today.
- **[gap, not open question]**: before moving to a normal `git`-based workflow in VS Code, it would be worth adopting the Supabase CLI's migration tracking (`supabase migration new`, `supabase db push`) instead of manually pasting SQL, so future schema changes are versioned and repeatable.
