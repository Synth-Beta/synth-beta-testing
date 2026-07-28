-- Expand editorial research signal storage for multi-source adapters.

ALTER TABLE public.editorial_runs
  ADD COLUMN IF NOT EXISTS source_status JSONB NOT NULL DEFAULT '{}'::JSONB;

COMMENT ON COLUMN public.editorial_runs.source_status IS
  'Per-source adapter status and result counts for the research run.';

ALTER TABLE public.editorial_source_snippets
  DROP CONSTRAINT IF EXISTS editorial_source_snippets_platform_check;

ALTER TABLE public.editorial_source_snippets
  ALTER COLUMN platform TYPE TEXT;

ALTER TABLE public.editorial_source_snippets
  ADD COLUMN IF NOT EXISTS canonical_url TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signal_type TEXT,
  ADD COLUMN IF NOT EXISTS confidence REAL,
  ADD COLUMN IF NOT EXISTS subject_label TEXT,
  ADD COLUMN IF NOT EXISTS sentiment TEXT;

COMMENT ON COLUMN public.editorial_source_snippets.platform IS
  'Source adapter id (jambase, reddit, capitalbop, etc.).';
COMMENT ON COLUMN public.editorial_source_snippets.sentiment IS
  'Normalized sentiment: positive|neutral|negative|mixed|unknown.';
COMMENT ON COLUMN public.editorial_source_snippets.signal_type IS
  'listing|review|news|social|setlist|place|profile|calendar|other';

CREATE INDEX IF NOT EXISTS idx_editorial_snippets_content_hash
  ON public.editorial_source_snippets (content_hash)
  WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_editorial_snippets_canonical_url
  ON public.editorial_source_snippets (canonical_url)
  WHERE canonical_url IS NOT NULL;

-- Soft-migrate polarity into sentiment when sentiment is empty
UPDATE public.editorial_source_snippets
SET sentiment = polarity
WHERE sentiment IS NULL AND polarity IS NOT NULL;
