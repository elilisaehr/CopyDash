-- CopyDash — Figma import
-- Run after 0003_activity_triggers.sql.

-- Which renderer the Design Editor should use for a page with a design layout.
alter table public.pages
  add column if not exists design_source text check (design_source in ('pdf', 'figma'));

-- Backfill: any page that already has a PDF design layout is a 'pdf' source.
update public.pages set design_source = 'pdf' where has_pdf_design = true and design_source is null;

-- ── figma_connections (one Figma Personal Access Token per PM) ──────────
create table if not exists public.figma_connections (
  pm_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  figma_user_name text,
  figma_user_email text,
  connected_at timestamptz not null default now()
);

alter table public.figma_connections enable row level security;

create policy "figma_connections: pm owns row" on public.figma_connections for all
  using (pm_id = auth.uid()) with check (pm_id = auth.uid());

-- ── figma_designs (the fetched design + editable text blocks for a page) ──
create table if not exists public.figma_designs (
  page_id uuid primary key references public.pages (id) on delete cascade,
  file_key text not null,
  node_id text not null,
  file_name text,
  frame_name text,
  image_url text not null,
  width integer not null,
  height integer not null,
  blocks jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.figma_designs enable row level security;

create policy "figma_designs: pm full access" on public.figma_designs for all
  using (is_pm_of_page(page_id)) with check (is_pm_of_page(page_id));
create policy "figma_designs: member read" on public.figma_designs for select
  using (is_member_of_page(page_id));
