-- CopyDash — soft-delete (archive) support for projects and pages.
-- Run after 0004_figma_import.sql.

alter table public.projects add column if not exists archived_at timestamptz;
alter table public.pages add column if not exists archived_at timestamptz;

create index if not exists projects_archived_at_idx on public.projects (pm_id, archived_at);
