-- Add SEO columns to news_items for better search visibility

ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS image_alt text,
  ADD COLUMN IF NOT EXISTS primary_keyword text,
  ADD COLUMN IF NOT EXISTS keywords text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN public.news_items.seo_title IS 'SEO meta title override for this item';
COMMENT ON COLUMN public.news_items.seo_description IS 'SEO meta description for this item';
COMMENT ON COLUMN public.news_items.image_alt IS 'Alt text for the image (accessibility + SEO)';
COMMENT ON COLUMN public.news_items.primary_keyword IS 'Primary keyword for search targeting';
COMMENT ON COLUMN public.news_items.keywords IS 'Secondary keywords for search targeting';
