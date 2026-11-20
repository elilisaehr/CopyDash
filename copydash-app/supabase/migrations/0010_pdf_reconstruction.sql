-- CopyDash — PDF → reconstructed page (Acrobat-style "PDF to HTML").
--
-- A newly imported PDF is split once, in the browser (lib/pdf-reconstruct),
-- into background layers, pictures and live text. The files go to the
-- existing 'pdfs' bucket under <project>/pages/<page>/rebuild/; the
-- description of the page (where each piece goes, the text blocks, the
-- conversion report) is stored here. Pages imported before keep
-- design_source = 'pdf' and the old image + overlay editor.
--
-- Backward compatible with the deployed code: it only widens a check and
-- adds a table the old code never reads.

alter table public.pages drop constraint if exists pages_design_source_check;
alter table public.pages add constraint pages_design_source_check
  check (design_source in ('pdf', 'figma', 'pdf_html'));

create table if not exists public.pdf_reconstructions (
  page_id uuid primary key references public.pages (id) on delete cascade,
  -- Format of `model`, bumped when lib/pdf-reconstruct changes shape.
  version integer not null default 1,
  -- { pages: [{ w, h, background, layers, images, blocks, report }] },
  -- geometry in PDF points (scale 1), file paths relative to the bucket.
  model jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.pdf_reconstructions enable row level security;

-- Same access as figma_designs: admins and editors write, everyone on the project reads.
drop policy if exists "pdf_reconstructions: pm full access" on public.pdf_reconstructions;
create policy "pdf_reconstructions: pm full access" on public.pdf_reconstructions for all
  using (public.is_pm_of_page(page_id)) with check (public.is_pm_of_page(page_id));
drop policy if exists "pdf_reconstructions: editor full access" on public.pdf_reconstructions;
create policy "pdf_reconstructions: editor full access" on public.pdf_reconstructions for all
  using (public.is_editor_of_page(page_id)) with check (public.is_editor_of_page(page_id));
drop policy if exists "pdf_reconstructions: member read" on public.pdf_reconstructions;
create policy "pdf_reconstructions: member read" on public.pdf_reconstructions for select
  using (public.is_member_of_page(page_id));
