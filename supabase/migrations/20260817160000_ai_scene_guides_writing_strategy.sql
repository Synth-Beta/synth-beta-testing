-- Persist voice + strategy + opener templates so admin can edit without a code deploy.

ALTER TABLE public.ai_scene_guides_settings
  ADD COLUMN IF NOT EXISTS writing_strategy jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ai_scene_guides_settings.writing_strategy IS
  'Editable AI Scene Guide voice, strategy notes, and opener templates. Empty object uses code defaults.';
