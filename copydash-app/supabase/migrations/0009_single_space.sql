-- CopyDash — single space: everyone uses the same app, with the roles
-- Admin / Editor / Contributor decided per project.
-- Run after 0008_review_flow.sql. Safe to run twice (see the release checklist
-- in docs/06-implementation-plan.md).
--
-- Stored role values don't change: 'client' in project_members.role and
-- invitations.role is what the app displays as "Contributor" (lib/roles.ts).
--
-- Backward compatible with the code deployed before it. Nothing is deleted:
-- clients and client_emails stay, unused by the app.

-- ── company on the project (replaces the Clients page) ────────────────
alter table public.projects add column if not exists company text not null default '';

update public.projects p
set company = c.name
from public.clients c
where p.client_id = c.id and p.company = '';

-- ── a person's role on a project ──────────────────────────────────────
-- 'admin' | 'editor' | 'client', or null when they have no access to it.
create or replace function public.project_role(p_project_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.is_pm_of_project(p_project_id) then 'admin'
    else (select role from public.project_members
          where project_id = p_project_id and user_id = auth.uid())
  end;
$$;

-- ── no more linking by email ──────────────────────────────────────────
-- These gave project access to anyone whose email was on a client company.
-- Access now comes only from invitations, and these would undo a removal
-- from the People tab: they re-link on any profile save that writes the email.
drop trigger if exists link_client_projects on public.profiles;
drop trigger if exists link_new_client_email on public.client_emails;

-- ── contributor limit per plan ────────────────────────────────────────
-- null = unlimited. Values are data, so they can change without a deploy.
alter table public.plan_limits add column if not exists max_contributors integer;

-- Counts people, not seats on projects: distinct contributors on the
-- workspace's active projects plus pending contributor invitations.
-- Re-inviting someone already counted never hits the limit.
create or replace function public.check_contributor_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_max integer;
  v_count integer;
  v_already boolean;
begin
  if new.role <> 'client' or new.accepted_at is not null then return new; end if;

  select w.plan, l.max_contributors into v_plan, v_max
  from public.workspaces w join public.plan_limits l on l.plan = w.plan
  where w.id = new.workspace_id;
  if v_max is null then return new; end if;

  with people as (
    select lower(pr.email) as email
    from public.project_members m
    join public.projects p on p.id = m.project_id
    join public.profiles pr on pr.id = m.user_id
    where p.workspace_id = new.workspace_id and p.archived_at is null and m.role = 'client'
    union
    select lower(i.email)
    from public.invitations i
    where i.workspace_id = new.workspace_id and i.role = 'client'
      and i.accepted_at is null and i.id <> new.id
  )
  select count(*), coalesce(bool_or(email = lower(new.email)), false)
  into v_count, v_already
  from people;

  if not v_already and v_count >= v_max then
    raise exception 'PLAN_LIMIT_CONTRIBUTORS: the % plan allows % contributor(s)', v_plan, v_max
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists check_contributor_limit on public.invitations;
create trigger check_contributor_limit
  before insert or update of email, role, workspace_id on public.invitations
  for each row execute function public.check_contributor_limit();

-- ── wording stored or raised by the database ──────────────────────────
create or replace function public.pages_b_review_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_agency_of_project(new.project_id) then
    return new;
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'In Progress' and new.status = 'Pending Review') then
    raise exception 'Only an admin or editor can move this page to "%".', new.status using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'status' - 'updated_by_name' - 'updated_at')
     is distinct from (to_jsonb(old) - 'status' - 'updated_by_name' - 'updated_at') then
    raise exception 'Contributors can only edit the copy of a page.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.log_page_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pm_id uuid;
  v_project_name text;
  v_actor text;
begin
  if new.status is distinct from old.status then
    select pr.pm_id, pr.name into v_pm_id, v_project_name from public.projects pr where pr.id = new.project_id;
    select coalesce(p.name, 'Someone') into v_actor from public.profiles p where p.id = auth.uid();
    insert into public.activity_log (pm_id, project_id, actor_name, type, text)
    values (
      v_pm_id, new.project_id, coalesce(v_actor, 'Someone'), 'page_status',
      new.name || ' page ' ||
        case new.status
          when 'In Progress' then case when old.status = 'Pending Review' then 'sent back to contributors' else 'sent to contributors' end
          when 'Pending Review' then 'submitted for review'
          when 'Completed' then 'completed'
          else 'moved back to draft'
        end ||
      ' — ' || v_project_name
    );
  end if;
  return new;
end;
$$;

-- ── security audit ────────────────────────────────────────────────────
-- Direct calls with the public key used to be able to do what follows. All of
-- it is skipped for server-side work (no signed-in user).

-- Profiles: the email always mirrors the login, and the account type is fixed.
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new.email := coalesce((select email from auth.users where id = new.id), new.email);
  if tg_op = 'UPDATE' then new.role := old.role; end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- Comments: author, name and badge come from the session; afterwards anyone on
-- the project can resolve one, and only its author can reword it.
create or replace function public.comments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.pages where id = new.page_id and project_id = new.project_id) then
      raise exception 'This page is not part of this project.' using errcode = '42501';
    end if;
    new.author_id := auth.uid();
    new.author_name := coalesce((select nullif(name, '') from public.profiles where id = auth.uid()), 'Someone');
    new.role := case when public.is_agency_of_project(new.project_id) then 'pm' else 'client' end;
    return new;
  end if;
  if (to_jsonb(new) - 'resolved' - 'body') is distinct from (to_jsonb(old) - 'resolved' - 'body')
     or (new.body is distinct from old.body and old.author_id <> auth.uid()) then
    raise exception 'You can only resolve this comment.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists comments_guard on public.comments;
create trigger comments_guard
  before insert or update on public.comments
  for each row execute function public.comments_guard();

-- Copy: contributors change the text and nothing else (labels, limits, the
-- "what changed" history). Runs before stamp_copy_editor (triggers fire in name
-- order); pg_trigger_depth lets the hand-off snapshot through (record_page_handoff).
create or replace function public.copy_only_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then return new; end if;
  select project_id into v_project from public.pages where id = new.page_id;
  if public.is_agency_of_project(v_project) then return new; end if;
  if tg_op = 'INSERT' then
    new.baseline := null;
    new.prev_baseline := null;
    return new;
  end if;
  if (to_jsonb(new) - 'content' - 'updated_at') is distinct from (to_jsonb(old) - 'content' - 'updated_at') then
    raise exception 'Contributors can only edit the copy of a page.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists copy_only_guard on public.fields;
create trigger copy_only_guard
  before insert or update on public.fields
  for each row execute function public.copy_only_guard();
drop trigger if exists copy_only_guard on public.design_edits;
create trigger copy_only_guard
  before insert or update on public.design_edits
  for each row execute function public.copy_only_guard();

-- A removed or demoted admin keeps nothing: "created by" (pm_id) also gives
-- admin rights, so what they created goes to the workspace owner.
create or replace function public.hand_over_former_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if tg_op = 'UPDATE' and new.role = 'admin' then return new; end if;
  select owner_id into v_owner from public.workspaces where id = old.workspace_id;
  if v_owner is null or v_owner = old.user_id then return new; end if;
  update public.activity_log set pm_id = v_owner
    where pm_id = old.user_id and project_id in (select id from public.projects where workspace_id = old.workspace_id);
  update public.projects set pm_id = v_owner where workspace_id = old.workspace_id and pm_id = old.user_id;
  update public.clients set pm_id = v_owner where workspace_id = old.workspace_id and pm_id = old.user_id;
  return coalesce(new, old);
end;
$$;
drop trigger if exists hand_over_former_admin on public.workspace_members;
create trigger hand_over_former_admin
  after delete or update of role on public.workspace_members
  for each row execute function public.hand_over_former_admin();

-- The same for admins removed before this migration.
update public.projects p set pm_id = w.owner_id
from public.workspaces w
where w.id = p.workspace_id and p.pm_id <> w.owner_id
  and not exists (select 1 from public.workspace_members m where m.workspace_id = p.workspace_id and m.user_id = p.pm_id and m.role = 'admin');
