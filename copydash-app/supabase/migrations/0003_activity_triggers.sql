-- CopyDash — auto-populate the PM dashboard's activity feed.
-- Run after 0002_rls.sql.

create or replace function public.log_project_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (pm_id, project_id, actor_name, type, text)
  values (new.pm_id, new.id, coalesce((select name from public.profiles where id = new.pm_id), 'You'), 'project_created', 'New project created: ' || new.name);
  return new;
end;
$$;

drop trigger if exists log_project_created on public.projects;
create trigger log_project_created
  after insert on public.projects
  for each row execute function public.log_project_created();

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
          when 'Completed' then 'completed'
          when 'Pending Review' then 'submitted for review'
          when 'In Progress' then 'updated'
          else 'reset to draft'
        end ||
      ' — ' || v_project_name
    );
  end if;
  return new;
end;
$$;

drop trigger if exists log_page_status_change on public.pages;
create trigger log_page_status_change
  after update on public.pages
  for each row execute function public.log_page_status_change();

create or replace function public.log_comment_added()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pm_id uuid;
  v_project_name text;
begin
  select pr.pm_id, pr.name into v_pm_id, v_project_name from public.projects pr where pr.id = new.project_id;
  insert into public.activity_log (pm_id, project_id, actor_name, type, text)
  values (v_pm_id, new.project_id, new.author_name, 'comment', new.author_name || ' commented on ' || v_project_name);
  return new;
end;
$$;

drop trigger if exists log_comment_added on public.comments;
create trigger log_comment_added
  after insert on public.comments
  for each row execute function public.log_comment_added();
