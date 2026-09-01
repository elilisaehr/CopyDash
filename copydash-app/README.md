# CopyDash

A real Next.js + Supabase implementation of the CopyDash design prototype (see `../README.md`, `../chats/`, and `../project/` at the repo root for the original handoff bundle this was built from).

CopyDash helps agencies collect website content from clients: a PM creates a project, uploads a page design as a PDF, and either fills in structured content fields or edits copy directly in place on the rendered design — with comments, an SEO score, and AI-assisted writing suggestions along the way. Clients get their own portal to fill in and submit content for review.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) — note async `params`/`searchParams`, a breaking change from earlier Next.js versions. Next.js 16 also introduced a renamed `proxy.ts` convention for what was `middleware.ts`; this app deliberately still uses `middleware.ts` (fully supported, not removed) to avoid platform-support lag for the brand-new name on some hosts.
- **Supabase** — Postgres (schema + Row Level Security), Auth (email/password), Storage (uploaded PDFs).
- **Tailwind CSS v4** for base resets; most UI is deliberately ported as inline-styled components (matching the original design prototype's exact pixel/hex values) rather than utility classes.
- **pdf.js** for real, client-side PDF text extraction and page rendering (no server-side PDF processing).

AI features (per-field writing suggestions, "extract content from PDF") are **mocked** — see [`lib/ai-mock.ts`](./lib/ai-mock.ts), the single integration point for wiring up a real LLM later (e.g. a Server Action calling the Anthropic API with the same prompts/shapes already used there).

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

If you don't have one already: [supabase.com](https://supabase.com) → New Project.

### 3. Run the database migrations

This app was built in a sandboxed environment with no network access to Supabase, so the migrations were never applied automatically — **you need to run them yourself, once**, in order:

1. Open your Supabase project → **SQL Editor**.
2. Run `supabase/migrations/0001_schema.sql` (tables).
3. Run `supabase/migrations/0002_rls.sql` (Row Level Security policies + the `pdfs` Storage bucket).
4. Run `supabase/migrations/0003_activity_triggers.sql` (auto-populates the PM dashboard's activity feed).
5. Run `supabase/migrations/0004_figma_import.sql` (Figma import feature — safe to run even if you don't plan to use it).

(If you have the Supabase CLI linked to this project instead, `supabase db push` will apply all four in order.)

### 4. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your project's values (Supabase Dashboard → Settings → API):

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` — your project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the `anon`/publishable key (safe for the browser).
- `SUPABASE_SERVICE_ROLE_KEY` — the `service_role`/secret key. **Server-only** — never exposed to the client. Currently only reserved for future admin-only Server Actions (`createAdminClient()` in `lib/supabase/server.ts`); nothing calls it yet.

### 5. Run it

```bash
npm run dev
```

Visit `http://localhost:3000`, click **Sign up**, and create a Project Manager account. From there, create a client, a project, and a page to try the full flow. To try the client-side experience, sign up a second account choosing the "Client" role with an email matching a client you added as a PM (a database trigger links the two automatically).

## What's real vs. mocked

| Feature | Status |
|---|---|
| Auth, roles, route protection | Real (Supabase Auth + RLS + `middleware.ts`) |
| Projects, clients, pages, fields, comments | Real (Postgres, RLS-scoped per PM/client) |
| PDF text extraction | Real (client-side pdf.js) |
| PDF design rendering + in-place text editing | Real (pdf.js render-to-canvas + geometry-based text-block detection, `lib/pdf-design.ts`) |
| Figma design import + in-place text editing | Real (Figma REST API via a per-PM Personal Access Token, `lib/figma.ts` — gives exact text position/content/style directly, no geometry detection needed) |
| File storage | Real (Supabase Storage, `pdfs` bucket) |
| SEO scoring | Real — a deterministic, rule-based score (`components/features/seo.tsx`), not an AI call |
| AI writing suggestions / "fill from PDF" | **Mocked** (`lib/ai-mock.ts`) — same UI/UX and JSON contract a real LLM call would use |
| Team invitations, branding settings | Real rows persisted, but no email is actually sent (no email provider configured) |
| "Contact support" message box | Cosmetic only — no messages table exists |

## Project structure

```
app/
  login/, signup/                    Public auth pages
  pm/                                 PM route group (layout.tsx renders Sidebar/AppLayout)
    page.tsx                         Dashboard overview
    projects/                        Projects list, new project, pages list, editor
    clients/                         Clients
    settings/, help/
  client/                             Client route group
    page.tsx                         Client dashboard
    pages/[pageId]/                  Client's page editor
    settings/, help/
components/
  ui/                                 Shared design-system primitives (Button, Card, Sidebar, ...)
  features/                           Comments, SEO panel, AI-suggest popover, export modal, live preview
  screens/                            The actual screen implementations, composed from ui/ + features/
lib/
  supabase/                           Browser/server Supabase clients + hand-written DB types
  ai-mock.ts, pdf.ts, pdf-design.ts   AI mock layer, pdf.js helpers, design-editor geometry algorithm
supabase/migrations/                  SQL schema + RLS (run manually, see Setup above)
```

See `middleware.ts` at the repo root for session refresh + role-based route protection.
