-- Fonts the PM assigns to a PDF design so edited copy renders in the
-- design's own typeface: {"heading": "Open Sans", "body": "Open Sans"}.
-- Nullable and unused by older code, so safe to apply before deploying.
alter table public.pages
  add column if not exists design_fonts jsonb;
