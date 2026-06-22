-- ============================================
-- ADD ACQUISITION SOURCE TRACKING
-- ============================================
-- 1. Track how users heard about Synth for marketing attribution.
-- 2. Store free-form details when "Other" is selected.
-- ============================================

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS other_acquisition_source TEXT;

COMMENT ON COLUMN public.users.acquisition_source IS 'Canonical source selected by user during onboarding.';
COMMENT ON COLUMN public.users.other_acquisition_source IS 'Custom text supplied when acquisition_source = ''other''.';

COMMIT;
