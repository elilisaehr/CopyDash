-- CopyDash — core schema
-- Run this in the Supabase SQL Editor (or `supabase db push`) before using the app.

create extension if not exists "pgcrypto";

-- ── profiles ──────────────────────────────────────────────────────
-- One row per auth.users id. role decides PM vs Client UX.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('pm', 'client')),
  name text not null default '',
  email text not null,
  phone text default '',
  company text default '',
  language text default 'English',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_email_idx on public.profiles (lower(email));

-- ── clients (a PM's client companies) ────────────────────────────
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  pm_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  contact_name text default '',
  phone text default '',
  notes text default '',
  status text not null default 'Waiting' check (status in ('Active', 'Waiting', 'Archived')),
  joined_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clients_pm_id_idx on public.clients (pm_id);

create table if not exists public.client_emails (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  address text not null,
  label text not null default 'Primary',
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists client_emails_client_id_idx on public.client_emails (client_id);
create index if not exists client_emails_address_idx on public.client_emails (lower(address));

-- ── projects ──────────────────────────────────────────────────────
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  pm_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  name text not null,
  status text not null default 'Draft' check (status in ('Draft', 'In Progress', 'Pending Review', 'Completed')),
  pdf_filename text,
  pdf_storage_path text,
  extracted_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_pm_id_idx on public.projects (pm_id);
create index if not exists projects_client_id_idx on public.projects (client_id);

-- Grants a specific auth user (a client who has signed up) access to a project.
-- Populated automatically when a client's profile email matches one of the
-- project's client's emails (see trigger in 0002_rls.sql), or manually by a PM.
create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- ── pages ─────────────────────────────────────────────────────────
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  status text not null default 'Draft' check (status in ('Draft', 'In Progress', 'Pending Review', 'Completed')),
  template text default 'custom',
  pdf_text text,
  pdf_filename text,
  pdf_storage_path text,
  has_pdf_design boolean not null default false,
  design_seed text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pages_project_id_idx on public.pages (project_id);

-- ── fields (the "Form" editor's structured content fields) ──────────
create table if not exists public.fields (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  field_key text not null,
  label text not null,
  content text not null default '',
  max_chars integer not null default 200,
  placeholder text default '',
  position integer not null default 0,
  unique (page_id, field_key)
);
create index if not exists fields_page_id_idx on public.fields (page_id);

-- ── design_edits (in-place edits made on the PDF/design layout editor) ──
create table if not exists public.design_edits (
  page_id uuid not null references public.pages (id) on delete cascade,
  block_id text not null,
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (page_id, block_id)
);

-- ── comments (per-field discussion, PM <-> Client) ───────────────────
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  page_id uuid not null references public.pages (id) on delete cascade,
  field_key text not null,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null,
  role text not null check (role in ('pm', 'client')),
  body text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists comments_page_field_idx on public.comments (page_id, field_key);

-- ── activity_log (dashboard activity feed) ───────────────────────────
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  pm_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  actor_name text not null,
  type text not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_pm_id_idx on public.activity_log (pm_id, created_at desc);

-- ── notification_prefs (one row per user, shape depends on role) ─────
create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── team_invitations (PM inviting agency teammates) ───────────────────
create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  pm_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'Editor' check (role in ('Admin', 'Editor', 'Viewer')),
  status text not null default 'Pending' check (status in ('Pending', 'Active')),
  invited_at timestamptz not null default now()
);
create index if not exists team_invitations_pm_id_idx on public.team_invitations (pm_id);

-- ── branding_settings (client-portal branding per agency) ─────────────
create table if not exists public.branding_settings (
  pm_id uuid primary key references auth.users (id) on delete cascade,
  agency_name text default 'Agency Studio',
  brand_color text default '#7f22fe',
  welcome_message text default 'Welcome! Please fill in the content for your website pages below.',
  updated_at timestamptz not null default now()
);

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.clients;
create trigger set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.projects;
create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.pages;
create trigger set_updated_at before update on public.pages
  for each row execute function public.set_updated_at();
