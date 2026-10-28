-- Dev only: wipe the public schema and app storage policies, keep auth users.
drop policy if exists "pdfs: pm read/write own project files" on storage.objects;
drop policy if exists "pdfs: member read own project files" on storage.objects;
drop policy if exists "pdfs: editor read/write project files" on storage.objects;
drop schema public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
