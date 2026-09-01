-- CopyDash — Row Level Security
-- Run after 0001_schema.sql.

-- ── Helper functions ──────────────────────────────────────────────
create or replace function public.current_role_is_pm()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'pm'
  );
$$;

create or replace function public.is_pm_of_project(p_project_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.projects where id = p_project_id and pm_id = auth.uid()
  );
$$;

create or replace function public.is_pm_of_client(p_client_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.clients where id = p_client_id and pm_id = auth.uid()
  );
$$;

create or replace function public.is_member_of_project(p_project_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_pm_of_page(p_page_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.pages pg
    join public.projects pr on pr.id = pg.project_id
    where pg.id = p_page_id and pr.pm_id = auth.uid()
  );
$$;

create or replace function public.is_member_of_page(p_page_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.pages pg
    join public.project_members pm on pm.project_id = pg.project_id
    where pg.id = p_page_id and pm.user_id = auth.uid()
  );
$$;

-- Auto-link a client's auth account to any project whose client has a
-- matching email address, whenever a 'client' profile is created or its
-- email changes. Mirrors the prototype's "match by any client email" rule.
create or replace function public.link_client_projects()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'client' then
    insert into public.project_members (project_id, user_id)
    select p.id, new.id
    from public.projects p
    join public.clients c on c.id = p.client_id
    join public.client_emails ce on ce.client_id = c.id
    where lower(ce.address) = lower(new.email)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists link_client_projects on public.profiles;
create trigger link_client_projects
  after insert or update of email, role on public.profiles
  for each row execute function public.link_client_projects();

-- Also link retroactively whenever a client email is added to an existing client.
create or replace function public.link_new_client_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id)
  select p.id, pr.id
  from public.projects p
  join public.profiles pr on lower(pr.email) = lower(new.address) and pr.role = 'client'
  where p.client_id = new.client_id
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists link_new_client_email on public.client_emails;
create trigger link_new_client_email
  after insert on public.client_emails
  for each row execute function public.link_new_client_email();

-- ── Enable RLS ────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.client_emails enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.pages enable row level security;
alter table public.fields enable row level security;
alter table public.design_edits enable row level security;
alter table public.comments enable row level security;
alter table public.activity_log enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.team_invitations enable row level security;
alter table public.branding_settings enable row level security;

-- ── profiles ──────────────────────────────────────────────────────
create policy "profiles: read own" on public.profiles for select
  using (id = auth.uid());
create policy "profiles: pm reads members of their projects" on public.profiles for select
  using (
    role = 'client' and exists (
      select 1 from public.project_members pmem
      join public.projects p on p.id = pmem.project_id
      where pmem.user_id = profiles.id and p.pm_id = auth.uid()
    )
  );
create policy "profiles: member reads their project's pm" on public.profiles for select
  using (
    exists (
      select 1 from public.projects p
      where p.pm_id = profiles.id and is_member_of_project(p.id)
    )
  );
create policy "profiles: insert own" on public.profiles for insert
  with check (id = auth.uid());
create policy "profiles: update own" on public.profiles for update
  using (id = auth.uid());

-- ── clients ───────────────────────────────────────────────────────
create policy "clients: pm full access" on public.clients for all
  using (pm_id = auth.uid()) with check (pm_id = auth.uid());

-- ── client_emails ─────────────────────────────────────────────────
create policy "client_emails: pm full access" on public.client_emails for all
  using (is_pm_of_client(client_id)) with check (is_pm_of_client(client_id));

-- ── projects ──────────────────────────────────────────────────────
create policy "projects: pm full access" on public.projects for all
  using (pm_id = auth.uid()) with check (pm_id = auth.uid());
create policy "projects: member read" on public.projects for select
  using (is_member_of_project(id));

-- ── project_members ───────────────────────────────────────────────
create policy "project_members: pm manages" on public.project_members for all
  using (is_pm_of_project(project_id)) with check (is_pm_of_project(project_id));
create policy "project_members: member reads own row" on public.project_members for select
  using (user_id = auth.uid());

-- ── pages ─────────────────────────────────────────────────────────
create policy "pages: pm full access" on public.pages for all
  using (is_pm_of_project(project_id)) with check (is_pm_of_project(project_id));
create policy "pages: member read" on public.pages for select
  using (is_member_of_project(project_id));
create policy "pages: member update" on public.pages for update
  using (is_member_of_project(project_id)) with check (is_member_of_project(project_id));

-- ── fields ────────────────────────────────────────────────────────
create policy "fields: pm full access" on public.fields for all
  using (is_pm_of_page(page_id)) with check (is_pm_of_page(page_id));
create policy "fields: member read" on public.fields for select
  using (is_member_of_page(page_id));
create policy "fields: member update" on public.fields for update
  using (is_member_of_page(page_id)) with check (is_member_of_page(page_id));

-- ── design_edits ──────────────────────────────────────────────────
create policy "design_edits: pm full access" on public.design_edits for all
  using (is_pm_of_page(page_id)) with check (is_pm_of_page(page_id));
create policy "design_edits: member read" on public.design_edits for select
  using (is_member_of_page(page_id));
create policy "design_edits: member write" on public.design_edits for insert
  with check (is_member_of_page(page_id));
create policy "design_edits: member update" on public.design_edits for update
  using (is_member_of_page(page_id)) with check (is_member_of_page(page_id));

-- ── comments ──────────────────────────────────────────────────────
create policy "comments: pm full access" on public.comments for all
  using (is_pm_of_project(project_id)) with check (is_pm_of_project(project_id));
create policy "comments: member read" on public.comments for select
  using (is_member_of_project(project_id));
create policy "comments: member write" on public.comments for insert
  with check (is_member_of_project(project_id) and author_id = auth.uid());
create policy "comments: member update own" on public.comments for update
  using (is_member_of_project(project_id));

-- ── activity_log ──────────────────────────────────────────────────
create policy "activity_log: pm only" on public.activity_log for all
  using (pm_id = auth.uid()) with check (pm_id = auth.uid());

-- ── notification_prefs ────────────────────────────────────────────
create policy "notification_prefs: own row" on public.notification_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── team_invitations ──────────────────────────────────────────────
create policy "team_invitations: pm only" on public.team_invitations for all
  using (pm_id = auth.uid()) with check (pm_id = auth.uid());

-- ── branding_settings ─────────────────────────────────────────────
create policy "branding_settings: pm owns row" on public.branding_settings for all
  using (pm_id = auth.uid()) with check (pm_id = auth.uid());
create policy "branding_settings: member reads their agency's branding" on public.branding_settings for select
  using (
    exists (
      select 1 from public.projects p
      where p.pm_id = branding_settings.pm_id and is_member_of_project(p.id)
    )
  );

-- ── Storage: 'pdfs' bucket ────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('pdfs', 'pdfs', false)
on conflict (id) do nothing;

-- Path convention: {project_id}/... or {project_id}/pages/{page_id}/...
-- so access can be checked against the leading folder = project id.
create policy "pdfs: pm read/write own project files" on storage.objects for all
  using (
    bucket_id = 'pdfs'
    and is_pm_of_project((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'pdfs'
    and is_pm_of_project((storage.foldername(name))[1]::uuid)
  );

create policy "pdfs: member read own project files" on storage.objects for select
  using (
    bucket_id = 'pdfs'
    and is_member_of_project((storage.foldername(name))[1]::uuid)
  );
