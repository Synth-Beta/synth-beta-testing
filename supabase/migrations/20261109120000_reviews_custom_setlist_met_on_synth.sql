-- Review compose collects a custom setlist and "met on Synth", but production has neither
-- column, so both were silently dropped on save (the submit service retries without them).
-- Additive and nullable: safe to run with the current app builds.
--
-- ROLLBACK:
--   ALTER TABLE public.reviews DROP COLUMN IF EXISTS custom_setlist;
--   ALTER TABLE public.reviews DROP COLUMN IF EXISTS met_on_synth;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS custom_setlist jsonb,
  ADD COLUMN IF NOT EXISTS met_on_synth boolean;
