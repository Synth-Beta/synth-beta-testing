-- Extend news_items with optional metadata columns used by the Media feed UI.
-- These line up with the Admin dashboard inputs and front-end queries.

ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS image_alt text,
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS primary_keyword text,
  ADD COLUMN IF NOT EXISTS keywords text[];

COMMENT ON COLUMN public.news_items.image_alt IS 'Accessible alt text for preview images.';
COMMENT ON COLUMN public.news_items.seo_title IS 'Optional SEO title override for the feed.';
COMMENT ON COLUMN public.news_items.seo_description IS 'Optional SEO description for the feed.';
COMMENT ON COLUMN public.news_items.primary_keyword IS 'Primary keyword for SEO clustering.';
COMMENT ON COLUMN public.news_items.keywords IS 'Additional keywords/labels (stored as text array).';
