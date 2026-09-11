-- Apple Music pipeline check (2026-09-11). READ-ONLY — safe to paste into the SQL editor.
--
-- Context: production has never stored a single apple-music streaming_profiles row
-- (3 rows total, all spotify; 0 apple_music_genre signals). The web sync never reached
-- the database, so none of the DB side below has ever run against real Apple data.

-- Q1. Triggers on streaming_profiles — which ones fire for an apple-music row?
SELECT t.tgname, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t
WHERE t.tgrelid = 'public.streaming_profiles'::regclass
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- Q2. Live source of the functions an Apple Music sync depends on.
--     process_apple_music_genres_to_signals exists ONLY in the live DB (no migration in
--     the repo), so this is the only way to see which profile_data keys it reads.
--     The new web sync writes BOTH topArtists[].genres and a flat topGenres[] list.
SELECT p.proname, pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'process_apple_music_genres_to_signals',
    'process_spotify_artists_to_signals'
  );

-- Q3. service_type CHECK must allow 'apple-music'; UNIQUE(user_id, service_type) must
--     exist for the client upsert's onConflict.
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.streaming_profiles'::regclass
  AND contype IN ('c', 'u');
