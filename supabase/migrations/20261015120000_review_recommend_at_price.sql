-- "Would you recommend this show at the price you paid?" Yes/No, set next to
-- ticket_price_paid in the review form and shown on review details so readers
-- can judge whether a show is worth the ticket. NULL = not answered.
--
-- Run this in the Supabase SQL editor BEFORE deploying the web/mobile code that
-- selects this column.

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS recommend_at_price boolean;

COMMENT ON COLUMN public.reviews.recommend_at_price IS
  'Reviewer would recommend the show at the ticket price they paid. NULL = not answered.';

-- VERIFY
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'recommend_at_price';
