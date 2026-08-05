-- Add rank_order to bucket_list so users can prioritize which artists/venues
-- they most want to see. Feeds the personalized feed + notification triggers.

ALTER TABLE public.bucket_list
ADD COLUMN IF NOT EXISTS rank_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_bucket_list_user_rank
  ON public.bucket_list (user_id, rank_order NULLS LAST);

COMMENT ON COLUMN public.bucket_list.rank_order IS
  'User-set priority within their bucket list (lower = higher priority). Null means unranked, sorted after ranked items by added_at.';
