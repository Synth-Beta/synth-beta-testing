-- Editorial writing metadata: claim ledger, scores, attribution for review.

ALTER TABLE public.content_calendar_posts
  ADD COLUMN IF NOT EXISTS editorial_meta JSONB NOT NULL DEFAULT '{}'::JSONB;

COMMENT ON COLUMN public.content_calendar_posts.editorial_meta IS
  'Claim IDs used, source URLs, editor notes, rubric score, lint flags. Not public copy.';

ALTER TABLE public.editorial_subjects
  ADD COLUMN IF NOT EXISTS claim_ledger JSONB NOT NULL DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.editorial_subjects.claim_ledger IS
  'Cited claim ledger produced from research before generation.';
