-- CopyDash — clearer review: page statuses that say whose turn it is,
-- hand-off history, and "what changed in the last round".
-- Run after 0007_workspaces_roles.sql.
--
-- Page statuses keep their names (pages_status_check from 0001), each now
-- meaning a turn:
--   'Draft'          agency is preparing the page (client can read, not edit)
--   'In Progress'    with the client: their turn to edit, then submit
--   'Pending Review' with the agency: complete it or send it back
--   'Completed'      final
--
-- Backward compatible with the code deployed before it.

-- ── who may do what ───────────────────────────────────────────────────
-- Agency people (admins, editors) can move a page to any status. A client
-- can only submit a page that is with them, and change nothing else on
-- the page row ("pages: member update" lets members update the row).
create or replace function public.is_agency_of_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_pm_of_project(p_project_id) or public.is_editor_of_project(p_project_id);
$$;

create or replace function public.pages_b_review_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_agency_of_project(new.project_id) then
    return new;
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'In Progress' and new.status = 'Pending Review') then
    raise exception 'Only your agency can move this page to "%".', new.status using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'status' - 'updated_by_name' - 'updated_at')
     is distinct from (to_jsonb(old) - 'status' - 'updated_by_name' - 'updated_at') then
    raise exception 'Clients can only edit the copy of a page.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists pages_b_review_guard on public.pages;
create trigger pages_b_review_guard
  before update on public.pages
  for each row execute function public.pages_b_review_guard();

-- Clients edit copy only while the page is with them.
create or replace function public.can_edit_page_copy(p_page_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pages pg
    where pg.id = p_page_id
      and (pg.status = 'In Progress' or public.is_agency_of_project(pg.project_id))
  );
$$;

drop policy if exists "design_edits: clients only on their turn (insert)" on public.design_edits;
create policy "design_edits: clients only on their turn (insert)" on public.design_edits
  as restrictive for insert with check (public.can_edit_page_copy(page_id));
drop policy if exists "design_edits: clients only on their turn (update)" on public.design_edits;
create policy "design_edits: clients only on their turn (update)" on public.design_edits
  as restrictive for update using (public.can_edit_page_copy(page_id)) with check (public.can_edit_page_copy(page_id));
drop policy if exists "design_edits: clients only on their turn (delete)" on public.design_edits;
create policy "design_edits: clients only on their turn (delete)" on public.design_edits
  as restrictive for delete using (public.can_edit_page_copy(page_id));
drop policy if exists "fields: clients only on their turn (insert)" on public.fields;
create policy "fields: clients only on their turn (insert)" on public.fields
  as restrictive for insert with check (public.can_edit_page_copy(page_id));
drop policy if exists "fields: clients only on their turn (update)" on public.fields;
create policy "fields: clients only on their turn (update)" on public.fields
  as restrictive for update using (public.can_edit_page_copy(page_id)) with check (public.can_edit_page_copy(page_id));
drop policy if exists "fields: clients only on their turn (delete)" on public.fields;
create policy "fields: clients only on their turn (delete)" on public.fields
  as restrictive for delete using (public.can_edit_page_copy(page_id));

-- ── who edited what ───────────────────────────────────────────────────
-- baseline      = the text at the latest hand-off (null = the design's
--                 original text / an empty field)
-- prev_baseline = the text at the hand-off before that
-- So "changed in the last round" = prev_baseline vs baseline.
alter table public.design_edits
  add column if not exists updated_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_by_name text,
  add column if not exists baseline text,
  add column if not exists prev_baseline text;

alter table public.fields
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_by_name text,
  add column if not exists baseline text,
  add column if not exists prev_baseline text;

create or replace function public.stamp_copy_editor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.content is distinct from old.content then
    new.updated_at := now();
    if auth.uid() is not null then
      new.updated_by := auth.uid();
      new.updated_by_name := (select name from public.profiles where id = auth.uid());
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists stamp_copy_editor on public.design_edits;
create trigger stamp_copy_editor
  before insert or update on public.design_edits
  for each row execute function public.stamp_copy_editor();
drop trigger if exists stamp_copy_editor on public.fields;
create trigger stamp_copy_editor
  before insert or update on public.fields
  for each row execute function public.stamp_copy_editor();

-- ── hand-off history ──────────────────────────────────────────────────
create table if not exists public.page_handoffs (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  from_status text not null,
  to_status text not null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists page_handoffs_page_idx on public.page_handoffs (page_id, created_at desc);

alter table public.page_handoffs enable row level security;
drop policy if exists "page_handoffs: project people read" on public.page_handoffs;
create policy "page_handoffs: project people read" on public.page_handoffs for select
  using (public.is_member_of_project(project_id) or public.is_pm_of_project(project_id));

create or replace function public.record_page_handoff()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.page_handoffs (page_id, project_id, from_status, to_status, actor_id, actor_name)
    values (new.id, new.project_id, old.status, new.status, auth.uid(),
            (select name from public.profiles where id = auth.uid()));
    -- Snapshot the copy. Updating only the baseline columns doesn't touch
    -- updated_by (stamp_copy_editor only reacts to content changes).
    update public.design_edits set prev_baseline = baseline, baseline = content where page_id = new.id;
    update public.fields set prev_baseline = baseline, baseline = content where page_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists record_page_handoff on public.pages;
create trigger record_page_handoff
  after update of status on public.pages
  for each row execute function public.record_page_handoff();

-- ── activity feed wording ─────────────────────────────────────────────
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
          when 'In Progress' then case when old.status = 'Pending Review' then 'sent back to the client' else 'sent to the client' end
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
