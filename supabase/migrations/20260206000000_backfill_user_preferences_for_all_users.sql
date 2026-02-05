-- ============================================================
-- Ensure every user has a row in user_preferences
-- ============================================================
-- refresh_user_preferences_v5 only upserts users who have at least one
-- user_preference_signal. This backfill inserts a default (empty) row for
-- every user in public.users that does not yet have a row.
-- ============================================================

INSERT INTO public.user_preferences (
  user_id,
  genre_preference_scores,
  artist_preference_scores,
  venue_preference_scores,
  top_genres,
  top_artists,
  top_venues,
  last_signal_at,
  signal_count,
  last_computed_at,
  updated_at
)
SELECT
  u.user_id,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::text[],
  '{}'::uuid[],
  '{}'::uuid[],
  NULL::timestamptz,
  0,
  now(),
  now()
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_preferences up WHERE up.user_id = u.user_id
)
ON CONFLICT (user_id) DO NOTHING;
