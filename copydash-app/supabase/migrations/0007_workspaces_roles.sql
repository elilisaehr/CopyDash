-- CopyDash — workspaces, Admin / Editor / Client roles, plan limits.
-- Run after 0006_design_fonts.sql.
--
-- Model:
--   workspace          = an agency; owns projects and clients; carries the plan
--   workspace_members  = agency people: 'admin' (everything) or 'editor'
--   project_members    = per-project access: 'editor' (agency teammate — can
--                        add/remove/edit pages) or 'client' (edits copy only)
--
-- Backward compatible with the code deployed before it: the old pm_id-based
-- policies stay, projects inserted without a workspace_id get the creator's
-- workspace, and existing project_members rows become 'client'.

-- ── plan limits (data, so they can change without a deploy) ───────────
create table if not exists public.plan_limits (
  plan text primary key,
  max_projects integer,          -- active (non-archived) projects; null = unlimited
  max_pages_per_project integer, -- active pages per project; null = unlimited
  max_members integer            -- admins + editors; null = unlimited
);
insert into public.plan_limits (plan, max_projects, max_pages_per_project, max_members) values
  ('free', 1, 2, null),
  ('pro', null, null, null),
  ('agency', null, null, null)
on conflict (plan) do nothing;

alter table public.plan_limits enable row level security;
create policy "plan_limits: readable by signed-in users" on public.plan_limits for select
  to authenticated using (true);

-- ── workspaces ────────────────────────────────────────────────────────
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  plan text not null default 'free' references public.plan_limits (plan),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspaces_owner_id_idx on public.workspaces (owner_id);

drop trigger if exists set_updated_at on public.workspaces;
create trigger set_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_id_idx on public.workspace_members (user_id);

-- The owner is always an admin of their workspace.
create or replace function public.add_workspace_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'admin')
  on conflict (workspace_id, user_id) do update set role = 'admin';
  return new;
end;
$$;

drop trigger if exists add_workspace_owner on public.workspaces;
create trigger add_workspace_owner
  after insert on public.workspaces
  for each row execute function public.add_workspace_owner();

-- ── workspace scoping on existing tables ──────────────────────────────
alter table public.projects add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.clients add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
create index if not exists projects_workspace_id_idx on public.projects (workspace_id);
create index if not exists clients_workspace_id_idx on public.clients (workspace_id);

alter table public.project_members add column if not exists role text not null default 'client'
  check (role in ('editor', 'client'));

-- ── invitations (replaces the cosmetic team_invitations) ──────────────
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'editor', 'client')),
  -- Projects an editor or client gets access to (ignored for admins).
  project_ids uuid[] not null default '{}',
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);
create index if not exists invitations_workspace_id_idx on public.invitations (workspace_id);
create index if not exists invitations_email_idx on public.invitations (lower(email));

-- ── helper functions ──────────────────────────────────────────────────
-- security definer so policies can call them without recursing through
-- the RLS of the tables they read.
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_admin(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid() and role = 'admin'
  );
$$;

-- Same check, but volatile: it takes a fresh snapshot, so it sees a
-- workspace the BEFORE INSERT trigger created earlier in the same statement
-- (a stable function would still be looking at the pre-statement snapshot).
-- Only used in the restrictive insert policies below.
create or replace function public.is_workspace_admin_now(p_workspace_id uuid)
returns boolean language sql volatile security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid() and role = 'admin'
  );
$$;

-- Redefined: "PM" now means the project's creator (old rows) or any admin of
-- its workspace. Every existing "pm full access" policy built on these
-- helpers therefore extends to workspace admins automatically.
create or replace function public.is_pm_of_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and (p.pm_id = auth.uid() or public.is_workspace_admin(p.workspace_id))
  );
$$;

create or replace function public.is_pm_of_page(p_page_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pages pg
    join public.projects p on p.id = pg.project_id
    where pg.id = p_page_id
      and (p.pm_id = auth.uid() or public.is_workspace_admin(p.workspace_id))
  );
$$;

create or replace function public.is_pm_of_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client_id
      and (c.pm_id = auth.uid() or public.is_workspace_admin(c.workspace_id))
  );
$$;

create or replace function public.is_editor_of_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid() and role = 'editor'
  );
$$;

create or replace function public.is_editor_of_page(p_page_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pages pg
    join public.project_members m on m.project_id = pg.project_id
    where pg.id = p_page_id and m.user_id = auth.uid() and m.role = 'editor'
  );
$$;

-- The workspace a user acts in: the first one they belong to (admins first).
create or replace function public.current_workspace_id()
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from public.workspace_members
  where user_id = auth.uid()
  order by (role = 'admin') desc, created_at
  limit 1;
$$;

-- ── defaults + plan limits on projects / pages ────────────────────────
-- Old code inserts projects with only pm_id: file them under the creator's
-- workspace (creating one if they have none yet).
create or replace function public.projects_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_max integer;
  v_count integer;
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from public.workspace_members
    where user_id = new.pm_id and role = 'admin'
    order by created_at limit 1;
    if new.workspace_id is null then
      insert into public.workspaces (name, owner_id)
      values (coalesce((select nullif(name, '') from public.profiles where id = new.pm_id), 'My') || '''s workspace', new.pm_id)
      returning id into new.workspace_id;
    end if;
  end if;

  select w.plan, l.max_projects into v_plan, v_max
  from public.workspaces w join public.plan_limits l on l.plan = w.plan
  where w.id = new.workspace_id;
  if v_max is not null and new.archived_at is null then
    select count(*) into v_count from public.projects
    where workspace_id = new.workspace_id and archived_at is null;
    if v_count >= v_max then
      raise exception 'PLAN_LIMIT_PROJECTS: the % plan allows % active project(s)', v_plan, v_max
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_before_insert on public.projects;
create trigger projects_before_insert
  before insert on public.projects
  for each row execute function public.projects_before_insert();

-- Same default for clients created by the old code.
create or replace function public.clients_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from public.workspace_members
    where user_id = new.pm_id and role = 'admin'
    order by created_at limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_before_insert on public.clients;
create trigger clients_before_insert
  before insert on public.clients
  for each row execute function public.clients_before_insert();

-- Restoring an archived project counts against the limit too.
create or replace function public.projects_before_restore()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_max integer;
  v_count integer;
begin
  if old.archived_at is not null and new.archived_at is null then
    select w.plan, l.max_projects into v_plan, v_max
    from public.workspaces w join public.plan_limits l on l.plan = w.plan
    where w.id = new.workspace_id;
    if v_max is not null then
      select count(*) into v_count from public.projects
      where workspace_id = new.workspace_id and archived_at is null and id <> new.id;
      if v_count >= v_max then
        raise exception 'PLAN_LIMIT_PROJECTS: the % plan allows % active project(s)', v_plan, v_max
          using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_before_restore on public.projects;
create trigger projects_before_restore
  before update of archived_at on public.projects
  for each row execute function public.projects_before_restore();

create or replace function public.check_page_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_max integer;
  v_count integer;
begin
  if new.archived_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.archived_at is null then return new; end if;
  select w.plan, l.max_pages_per_project into v_plan, v_max
  from public.projects p
  join public.workspaces w on w.id = p.workspace_id
  join public.plan_limits l on l.plan = w.plan
  where p.id = new.project_id;
  if v_max is not null then
    select count(*) into v_count from public.pages
    where project_id = new.project_id and archived_at is null and id <> new.id;
    if v_count >= v_max then
      raise exception 'PLAN_LIMIT_PAGES: the % plan allows % page(s) per project', v_plan, v_max
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_page_limit on public.pages;
create trigger check_page_limit
  before insert or update of archived_at on public.pages
  for each row execute function public.check_page_limit();

-- ── backfill ──────────────────────────────────────────────────────────
-- Every existing PM gets their own workspace (as admin). Existing accounts
-- are grandfathered on 'pro' so the new free limits don't lock their work.
insert into public.workspaces (name, owner_id, plan)
select
  coalesce(nullif(b.agency_name, 'Agency Studio'), nullif(p.company, ''), nullif(p.name, ''), 'My') ||
    case when coalesce(nullif(b.agency_name, 'Agency Studio'), nullif(p.company, '')) is null then '''s workspace' else '' end,
  p.id,
  'pro'
from public.profiles p
left join public.branding_settings b on b.pm_id = p.id
where p.role = 'pm'
  and not exists (select 1 from public.workspace_members m where m.user_id = p.id);

update public.projects pr set workspace_id = w.id
from public.workspaces w
where pr.workspace_id is null and w.owner_id = pr.pm_id;

update public.clients c set workspace_id = w.id
from public.workspaces w
where c.workspace_id is null and w.owner_id = c.pm_id;

-- ── RLS ───────────────────────────────────────────────────────────────
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invitations enable row level security;

-- workspaces: members read; admins rename; anyone signed in can create
-- their own (onboarding). The plan is only changed server-side (billing),
-- so users get column-level rights that exclude it.
create policy "workspaces: members read" on public.workspaces for select
  using (public.is_workspace_member(id));
create policy "workspaces: create own" on public.workspaces for insert
  with check (owner_id = auth.uid());
create policy "workspaces: admins update" on public.workspaces for update
  using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));
revoke insert, update on public.workspaces from anon, authenticated;
grant insert (name, owner_id) on public.workspaces to authenticated;
grant update (name) on public.workspaces to authenticated;

-- workspace_members: members see their colleagues; admins manage, but the
-- owner's admin row can't be removed or demoted.
create policy "workspace_members: members read" on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));
create policy "workspace_members: admins insert" on public.workspace_members for insert
  with check (public.is_workspace_admin(workspace_id));
create policy "workspace_members: admins update" on public.workspace_members for update
  using (public.is_workspace_admin(workspace_id) and user_id <> (select owner_id from public.workspaces where id = workspace_id))
  with check (public.is_workspace_admin(workspace_id));
create policy "workspace_members: admins delete" on public.workspace_members for delete
  using (public.is_workspace_admin(workspace_id) and user_id <> (select owner_id from public.workspaces where id = workspace_id));

-- invitations: admins only (accepting goes through a server route).
create policy "invitations: admins manage" on public.invitations for all
  using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

-- projects / clients: workspace admins get full access (the old pm_id
-- policies stay for the previously deployed code).
create policy "projects: workspace admin full access" on public.projects for all
  using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy "clients: workspace admin full access" on public.clients for all
  using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
-- The old pm_id policies only check pm_id = auth.uid(), which let anyone
-- create a project or client inside someone else's workspace (or an editor
-- create projects). Restrictive policies are ANDed with every permissive
-- one: rows can only be written into a workspace you administer. They're
-- checked after the BEFORE triggers above fill in workspace_id.
create policy "projects: only into a workspace you administer" on public.projects
  as restrictive for insert
  with check (public.is_workspace_admin_now(workspace_id));
create policy "projects: stay in a workspace you administer" on public.projects
  as restrictive for update
  with check (public.is_workspace_admin(workspace_id));
create policy "clients: only into a workspace you administer" on public.clients
  as restrictive for insert
  with check (public.is_workspace_admin_now(workspace_id));
create policy "clients: stay in a workspace you administer" on public.clients
  as restrictive for update
  with check (public.is_workspace_admin(workspace_id));

-- Editors and clients can read the client company of projects they're on.
create policy "clients: project members read" on public.clients for select
  using (exists (
    select 1 from public.projects p
    where p.client_id = clients.id and public.is_member_of_project(p.id)
  ));

-- Editors: full control over pages and their content in their projects.
create policy "pages: editor full access" on public.pages for all
  using (public.is_editor_of_project(project_id)) with check (public.is_editor_of_project(project_id));
create policy "fields: editor full access" on public.fields for all
  using (public.is_editor_of_page(page_id)) with check (public.is_editor_of_page(page_id));
create policy "design_edits: editor full access" on public.design_edits for all
  using (public.is_editor_of_page(page_id)) with check (public.is_editor_of_page(page_id));
create policy "figma_designs: editor full access" on public.figma_designs for all
  using (public.is_editor_of_page(page_id)) with check (public.is_editor_of_page(page_id));

create policy "pdfs: editor read/write project files" on storage.objects for all
  using (bucket_id = 'pdfs' and public.is_editor_of_project((storage.foldername(name))[1]::uuid))
  with check (bucket_id = 'pdfs' and public.is_editor_of_project((storage.foldername(name))[1]::uuid));

-- Profiles: colleagues in a workspace, and admins/editors → everyone on
-- their projects, can see each other's name and email.
create policy "profiles: workspace colleagues read" on public.profiles for select
  using (exists (
    select 1 from public.workspace_members a
    join public.workspace_members b on b.workspace_id = a.workspace_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  ));
create policy "profiles: project admins read members" on public.profiles for select
  using (exists (
    select 1 from public.project_members m
    where m.user_id = profiles.id and public.is_pm_of_project(m.project_id)
  ));

-- Activity feed: admins see activity for every project in their workspace.
create policy "activity_log: workspace admins read" on public.activity_log for select
  using (exists (
    select 1 from public.projects p
    where p.id = activity_log.project_id and public.is_workspace_admin(p.workspace_id)
  ));
