# Product Requirements Document (PRD) — CopyDash

> Status: drafted from the existing, already-built app (repo `elilisaehr/CopyDash`, as of the current `main` branch). Sections marked **[OPEN QUESTION]** are genuine product/business decisions that need your input — everything else reflects what's actually built today.

## Product name and one-sentence idea

**CopyDash** — a web app where an agency's project manager and their client edit a website's copy together, directly on the real page design, instead of chasing content over email and spreadsheets.

## Target users

Two roles, both first-class in the product:

- **Project Manager (PM)** — a freelancer or agency staff member who runs client website projects and needs the client's final copy (headlines, body text, etc.) before development/launch. Manages multiple clients and projects.
- **Client** — the PM's customer: a business owner or marketing contact who needs to supply or approve the text for their own website, usually without technical skill and without time for lengthy back-and-forth.

**[OPEN QUESTION]** — Who exactly is the target PM? A solo freelancer, a small agency (2–10 people), or larger marketing/dev shops? This affects pricing, the Team Invitations feature's priority, and how much "multi-seat" workflow matters.

## Problem and current workaround

Agencies currently collect website content via email threads, generic Google Docs, or web forms that are disconnected from the actual page design. This causes:
- Copy that doesn't fit the space it was written for (too long/short for the designed layout).
- Lost context — the client can't see where their text will actually appear.
- Slow, scattered back-and-forth across email/Slack/Docs instead of one place.

**Today's workaround (no CopyDash):** PMs typically export a PDF or send a link to the Figma file, ask the client to mark up a copy of it or fill in a spreadsheet, then manually transcribe the client's answers back into the design — repeating this for every revision round.

## Goal and success measure

**Goal:** Cut the time between "design approved" and "content finalized and ready to hand to developers."

**[OPEN QUESTION]** — What's the target number? Candidate measurable signals already supported by the data model (`pages.status`, `pages.updated_at`, `pages.created_at`):
- Average days from a page's creation to it reaching `Completed` status.
- % of pages that reach `Completed` without the PM having to follow up outside the app (not currently tracked — would need an event log if this is the chosen metric).

## Core features

| Feature | User benefit | Priority |
|---|---|---|
| Auth + PM/Client roles | Each person only sees their own projects/clients (or the project they're a member of) | P0 — built |
| Projects, Clients (with multiple emails per client) | PM's main workspace: organize work per client, per project | P0 — built |
| Pages, with PDF or Figma import | Each project is broken into pages, each with its own design to collect copy against | P0 — built |
| **Design Editor** — edit copy in place on the rendered design (PDF or Figma) | Client sees exactly what their text will look like; no "where does this go" confusion | P0 — built (paragraph-level editing, not yet deployed — see Implementation Plan) |
| **Field Editor** — structured list of text fields, no visual design | Faster path when there's no design to edit against, or the PM prefers a plain form | P0 — built |
| Client portal | Clients review/submit content without needing a PM login | P0 — built |
| Review flow — statuses that say whose turn it is, "what changed" since the last hand-off, email when it's your turn | Nobody wonders who's waiting on whom; reviews focus on what changed | Built (B) |
| Comments per field | Discuss a specific piece of copy without leaving the page | P1 — built |
| SEO score | Rule-based score PMs can show clients as a selling point | P1 — built |
| AI writing suggestions | Speeds up drafting; currently a realistic mock, not a real model | P1 — built (mocked, see TRD) |
| Export (PDF/JSON/CSV) | Hand finished copy to developers in a usable format | P1 — built |
| Rename / Archive (projects & pages) | Keep the workspace tidy without losing history; restorable | P1 — built |
| Invitations | Invite editors, admins and clients to chosen projects by email link | Built — email via Resend (needs a verified sending domain before real use); link can also be copied and shared |
| Client-portal branding | White-label the client's experience with the agency's name/color | P2 — built |

## Out of scope for version one

- A real LLM integration (currently mocked — see TRD "Key technical decisions").
- Billing / payments / subscription tiers.
- Notification emails beyond the review flow (comments, deadlines, weekly digests are not sent). Invitation and "your turn" review emails are real.
- Native mobile apps (web only, responsive is not yet audited for small screens).
- Real-time multi-user presence/collaboration (no "who's viewing this page right now" indicator).
- Automated tests, staging environment, CI/CD pipeline.

**[OPEN QUESTION]** — Confirm this list matches your intent for "v1" — in particular, is real AI copy-generation a must-have before your first paying customer, or genuinely fine to ship mocked initially?

## User stories

- As a **PM**, I want to upload a page's design as a PDF or import it from Figma, so I can collect copy directly on the real layout instead of a disconnected form.
- As a **PM**, I want to invite a client by email, so they can fill in their own content without me relaying messages.
- As a **Client**, I want to click directly on text in the design and edit it in place, so I know exactly how my words will look on the real page.
- As a **PM**, I want to see each page's status (Draft / With client / To review / Approved), so I know whose turn it is and what needs my attention.
- As a **PM**, when a client submits a page, I want to see which texts they changed and what they were before, so I can review quickly.
- As a **PM**, I want to archive a project I'm no longer actively running, so my active list stays relevant, without permanently losing the data.
- As a **Client**, I want to leave a comment on a specific piece of text, so the PM knows exactly what I'm asking about.

## Acceptance criteria

- **Given** a PM is signed in and on the Projects page, **when** they create a new project and add a page with a PDF upload, **then** the page appears in that project with status "Draft" and the design is viewable/editable in the Design Editor.
- **Given** a Client's email matches one already added to a PM's client record, **when** that person signs up with the "Client" role using that email, **then** they are automatically linked to that client's project(s) and see them on their dashboard.
- **Given** a text block on a PDF-based design spans multiple lines of the original PDF, **when** the Client clicks it, **then** it behaves as a single editable paragraph (not several disconnected line boxes).
- **Given** a PM archives a project, **when** they open Settings → Archive, **then** the project is listed there with a "Restore" action that brings it back to the active Projects list.

## Open questions

- **[OPEN QUESTION]** Pricing model and who pays (the agency only, or also their end clients)?
- **[OPEN QUESTION]** Target customer size (solo freelancer vs. multi-person agency) — affects whether Team Invitations needs to become real.
- **[OPEN QUESTION]** Is real AI (actual LLM calls) and real outbound email (invitations) required before launch, or acceptable to ship later?
- **[OPEN QUESTION]** Any compliance requirements given the app stores client PII (names, emails, uploaded files) — GDPR if you have EU clients, data residency, etc.?
- **[OPEN QUESTION]** What happens to a Client who signs up before their email has been added to any PM's client list? Today they get a profile with nothing linked and see an essentially empty dashboard — is that acceptable, or should there be a clearer "no project yet" message / support contact?
