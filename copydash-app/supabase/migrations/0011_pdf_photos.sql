-- CopyDash — rebuilt PDF pages: replace a photo, crop / zoom it in its frame.
--
-- One row per picture changed on a rebuilt page (design_source 'pdf_html').
-- `piece` = "<page index>:<layer index>" in pdf_reconstructions.model; a new
-- split of the PDF (Replace design / Try again) deletes the rows, since the
-- pieces change. `path` = the uploaded photo in the 'pdfs' bucket
-- (<project>/pages/<page>/photos/…), null = the original picture, only
-- re-cropped. `zoom` (≥ 1) and `dx`/`dy` (PDF points) move the picture inside
-- its frame.
--
-- Same rules as the copy (design_edits): everyone on the page, contributors
-- only while the page is with them (In Progress).
--
-- Backward compatible with the deployed code: a new table and two storage
-- policies the old code never uses.

create table if not exists public.pdf_photo_edits (
  page_id uuid not null references public.pages (id) on delete cascade,
  piece text not null check (piece ~ '^[0-9]+:[0-9]+$'),
  path text,
  zoom real not null default 1 check (zoom >= 1 and zoom <= 10),
  dx real not null default 0,
  dy real not null default 0,
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (page_id, piece)
);

alter table public.pdf_photo_edits enable row level security;

drop policy if exists "pdf_photo_edits: pm full access" on public.pdf_photo_edits;
create policy "pdf_photo_edits: pm full access" on public.pdf_photo_edits for all
  using (public.is_pm_of_page(page_id)) with check (public.is_pm_of_page(page_id));
drop policy if exists "pdf_photo_edits: editor full access" on public.pdf_photo_edits;
create policy "pdf_photo_edits: editor full access" on public.pdf_photo_edits for all
  using (public.is_editor_of_page(page_id)) with check (public.is_editor_of_page(page_id));
drop policy if exists "pdf_photo_edits: member read" on public.pdf_photo_edits;
create policy "pdf_photo_edits: member read" on public.pdf_photo_edits for select
  using (public.is_member_of_page(page_id));
drop policy if exists "pdf_photo_edits: member write" on public.pdf_photo_edits;
create policy "pdf_photo_edits: member write" on public.pdf_photo_edits for insert
  with check (public.is_member_of_page(page_id));
drop policy if exists "pdf_photo_edits: member update" on public.pdf_photo_edits;
create policy "pdf_photo_edits: member update" on public.pdf_photo_edits for update
  using (public.is_member_of_page(page_id)) with check (public.is_member_of_page(page_id));
drop policy if exists "pdf_photo_edits: member delete" on public.pdf_photo_edits;
create policy "pdf_photo_edits: member delete" on public.pdf_photo_edits for delete
  using (public.is_member_of_page(page_id));

-- Contributors only on their turn (restrictive: applies on top of the above).
drop policy if exists "pdf_photo_edits: clients only on their turn (insert)" on public.pdf_photo_edits;
create policy "pdf_photo_edits: clients only on their turn (insert)" on public.pdf_photo_edits
  as restrictive for insert with check (public.can_edit_page_copy(page_id));
drop policy if exists "pdf_photo_edits: clients only on their turn (update)" on public.pdf_photo_edits;
create policy "pdf_photo_edits: clients only on their turn (update)" on public.pdf_photo_edits
  as restrictive for update using (public.can_edit_page_copy(page_id)) with check (public.can_edit_page_copy(page_id));
drop policy if exists "pdf_photo_edits: clients only on their turn (delete)" on public.pdf_photo_edits;
create policy "pdf_photo_edits: clients only on their turn (delete)" on public.pdf_photo_edits
  as restrictive for delete using (public.can_edit_page_copy(page_id));

-- The author is whoever saves, and a photo must come from this page's folder.
create or replace function public.pdf_photo_edits_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
begin
  if auth.uid() is null then return new; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if new.path is not null then
    select project_id into v_project from public.pages where id = new.page_id;
    if new.path not like v_project::text || '/pages/' || new.page_id::text || '/photos/%' then
      raise exception 'This photo is not part of this page.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists pdf_photo_edits_guard on public.pdf_photo_edits;
create trigger pdf_photo_edits_guard
  before insert or update on public.pdf_photo_edits
  for each row execute function public.pdf_photo_edits_guard();

-- Storage: anyone on the page may upload a photo into the page's photos
-- folder (<project>/pages/<page>/photos/<file>), contributors on their turn.
-- Admins and editors already read/write the whole project folder; members
-- already read it (0002 "pdfs: member read own project files").
create or replace function public.can_upload_page_photo(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  f text[] := storage.foldername(p_name);
  v_page uuid;
begin
  if array_length(f, 1) <> 4 or f[2] <> 'pages' or f[4] <> 'photos' then return false; end if;
  begin
    v_page := f[3]::uuid;
  exception when others then
    return false;
  end;
  return exists (select 1 from public.pages where id = v_page and project_id::text = f[1])
    and public.is_member_of_page(v_page)
    and public.can_edit_page_copy(v_page);
end;
$$;

drop policy if exists "pdfs: members upload page photos" on storage.objects;
create policy "pdfs: members upload page photos" on storage.objects for insert
  with check (bucket_id = 'pdfs' and public.can_upload_page_photo(name));
