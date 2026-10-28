# UI and UX Design Brief — CopyDash

> This documents the design system **as already built** (`app/globals.css`, `components/ui/primitives.tsx`). Where I'm inferring intent rather than reading a stated decision, I've marked it **[MY INFERENCE — confirm]**.

## Audience and tone

PM (professional tool user) and Client (occasional, often non-technical visitor). Tone across the UI: **clean, confident, minimal** — closer to a focused SaaS productivity tool than a playful consumer app.

**[MY INFERENCE — confirm]** Three adjectives for the visual language as built: **crisp, trustworthy, unfussy.** Flat surfaces, generous whitespace, a single accent color used sparingly, status communicated with small colored dots rather than heavy banners.

## Reference products

**[MY INFERENCE — confirm]** — not stated anywhere in the codebase, but the built visual language (zinc neutrals + one purple accent, 8–14px radii, Geist/Inter type pairing, card-based dashboards with KPI tiles) reads closest to **Linear** and **Vercel's own dashboard** — worth confirming or naming different references if you had something specific in mind originally.

## Color palette

Defined in `app/globals.css` as CSS variables (Zinc neutral scale + a Purple accent scale):

| Role | Token | Hex |
|---|---|---|
| Primary text | `--fg` / `--color-zinc-950` | `#09090b` |
| Muted text | `--fg-muted` / `--color-zinc-500` | `#71717b` |
| Subtle text | `--fg-subtle` / `--color-zinc-400` | `#a1a1aa` |
| Background | `--bg` | `#ffffff` |
| Subtle background | `--bg-subtle` / `--color-zinc-50` | `#fafafa` |
| Muted background | `--bg-muted` / `--color-zinc-100` | `#f4f4f5` |
| Border | `--border` / `--color-zinc-200` | `#e4e4e7` |
| Accent (buttons, links, active states) | `--accent-strong` / `--color-purple-600` | `#7f22fe` |
| Accent hover/darker | `--accent-dark` / `--color-purple-700` | `#7008e7` |
| Accent background wash | `--accent-bg` / `--color-purple-50` | `#f5f3ff` |
| Destructive | `--destructive` / `--color-red-600` | `#e7000b` |

**Semantic status colors** (used in `StatusBadge`, a colored dot + pill):
- Draft — grey (`#f4f4f5` bg / `#71717b` text)
- With client — amber (`#fff7ed` bg / `#c2410c` text)
- To review — blue (`#eff6ff` bg / `#1d4ed8` text)
- Approved — green (`#dcfce7` bg / `#15803d` text)

**Review banner** (top of both editors, `components/features/review.tsx`): violet wash (`#f5f3ff`) when it's the viewer's turn, grey (`#fafafa`) while waiting on the other side, green (`#f0fdf4`) when approved. One sentence saying whose turn it is, one line of detail, the hand-off buttons on the right.

## Typography

Three font variables, all loaded via `next/font/google` in `app/layout.tsx`:

- `--font-sans` → **Geist** — used for headings, labels, UI chrome (buttons, nav, KPI numbers).
- `--font-body` → **Inter** — used for body copy, paragraphs, longer text.
- `--font-mono` → **Geist Mono** — used for counters, IDs, code-like values (character counts, field IDs).

No formal type scale is documented as tokens (sizes are set ad hoc per component, typically 11–15px for UI text, 24–28px for page titles). **[OPEN QUESTION]** — worth formalizing a scale (e.g. 11/12/13/14/16/20/28) if the design system grows.

## Components

Shared primitives in `components/ui/primitives.tsx` and `components/ui/`:

- `Btn` (primary / outline / ghost / destructive, with size + icon support)
- `Card`, `Modal`, `PageHeader` (title/subtitle/breadcrumb/actions — used on every screen)
- `FieldInput`, `FieldTextarea` (with an optional char-count progress bar), `SelectInput`, `Toggle`
- `Avatar` (initials-based, no photo upload), `Badge`, `StatusBadge`, `StatusPicker`
- `KPICard`, `ProgressBar`, `Spinner`
- `DropdownMenu` (portals to `<body>`, auto-flips above/below its trigger so it's never clipped by a scroll container)
- `RenameModal`, `ResizeHandle` (drag-to-resize the editor's side panel)
- `Sidebar` (role-aware nav, see App Flow doc)

## Layout rules

- Fixed left **Sidebar** + a main content column.
- Page gutters: `24px`/`48px` horizontal padding is the common pattern (`padding: "24px 48px"` repeated across screens).
- Border radius scale: `6 / 8 / 10 / 12 / 14 / 24px` (xs → 2xl), used consistently for buttons/cards/modals.
- Card-based lists (Projects, Pages, Clients) rather than dense tables with heavy gridlines.
- No responsive breakpoint system is defined — layout assumes a desktop-width viewport. **[OPEN QUESTION / gap]** — mobile/small-screen behavior should be checked before relying on it.

## Screen notes

- **Dashboard**: KPI row, recent projects, activity feed — information-dense but skimmable.
- **Projects/Pages/Clients lists**: search + status filter tabs above a card-style table; row-level "…" menu for Rename/Archive/etc.
- **Design Editor**: split view — rendered design on the left (scroll/zoom), a resizable text-fields panel on the right; each field card shows its label, content, and (for paragraph blocks) a word-count indicator.
- **Auth screens** (`/login`, `/signup`): split layout, dark left panel with a small custom illustration (`components/ui/auth-visual.tsx` — a CSS/SVG mockup of the product, not a photo) + logo + tagline, form on the right.

## Accessibility

**Honest current state — not yet audited, several likely gaps:**
- Several interactive elements (row "…" menus, hover-revealed action buttons) rely on `opacity: 0` until `:hover`, which is unreliable for keyboard and touch users — they may be present but invisible/hard to discover without a mouse hover.
- Status is communicated partly through color (badge color + a colored dot) — the dot + text label together should be enough, but hasn't been checked against WCAG contrast ratios.
- No explicit focus-ring audit has been done; inputs do get a purple border on focus, but custom buttons/menus haven't been checked.
- No alt text strategy beyond empty `alt=""` on the rendered-PDF background image (intentionally decorative, since the real content is the overlaid editable text) — fine for that specific case, but worth a broader pass.

**[OPEN QUESTION]** — Is a formal accessibility target (e.g., WCAG 2.1 AA) a requirement for this product, or best-effort? This changes how much of the above needs fixing before launch.

## Interaction states

- **Hover**: subtle background tint (`#fafafa`) on rows, purple wash on editable design blocks.
- **Focus**: 2px purple ring on text inputs and the active design block.
- **Disabled**: reduced opacity + `cursor: not-allowed`/`default`.
- **Loading**: a shared `Spinner` component, used consistently across async buttons ("Saving…", "Creating…", etc.).
- **Error**: inline red-bordered banners for form-level errors; plain `alert()`/`confirm()` browser dialogs for a few destructive actions (archive, some error paths) — **[gap, not open question]** worth replacing with the app's own modal styling for consistency.
- **Success**: a brief green checkmark/banner pattern ("Saved!", "Branding saved.") that self-dismisses after ~2.5s.

## Assets needed

- **Logo**: currently a generic icon (`gallery-vertical-end`, from the built-in icon set) in a purple rounded square — **not a real brand mark**. **[OPEN QUESTION]** — do you have/want an actual logo?
- **Auth illustration**: already custom-built in code (no image asset needed) — a small mockup of the product itself (a page with an editable paragraph + a "Content synced" badge).
- **No other custom illustrations or stock photography** are used anywhere in the product today (all avatars are initials-based).
