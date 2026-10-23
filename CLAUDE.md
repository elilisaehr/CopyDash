# CopyDash

SaaS where an agency PM and their client edit website copy directly on the real page design (PDF or Figma).

## Layout
- `copydash-app/` — the Next.js 16 app (see `copydash-app/AGENTS.md`: Next 16 has breaking changes, read `node_modules/next/dist/docs/` before writing Next-specific code).
- `docs/` — product & technical reference. Read the relevant one before starting a task:
  - `01-prd.md` — product, roles, features, acceptance criteria, open questions
  - `02-trd.md` — stack, architecture, security, key technical decisions
  - `03-app-flow.md` — screens and user journeys
  - `04-ui-ux-brief.md` — visual design rules
  - `05-backend-schema.md` — Supabase tables, RLS, triggers
  - `06-implementation-plan.md` — milestones; work through them in order

## Working rules
- `main` auto-deploys to production on Vercel. Work on a branch; never push to `main` without the user's explicit OK.
- No `middleware.ts` / `proxy.ts` on purpose (crashed on Vercel Edge runtime). Route protection lives in each route group's `layout.tsx`.
- UI uses inline styles ported 1:1 from the design prototype — match that, don't convert to Tailwind utilities.
- AI is mocked behind `lib/ai-mock.ts`; email is not sent anywhere yet.
- Before handing work back, run from `copydash-app/`: `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- Keep the docs in `docs/` up to date when behaviour changes.
- The user communicates in French.
