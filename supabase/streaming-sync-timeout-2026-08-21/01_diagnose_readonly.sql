-- ============================================================================
-- Streaming Stats "Failed to save streaming profile" — READ-ONLY DIAGNOSIS
-- 2026-08-21
-- ============================================================================
--
-- CONFIRMED ROOT CAUSE (reproduced locally against production, 2026-08-21):
--   The Spotify fetch half now works — 123 artists / 150 tracks / 50 recent came
--   back clean, so the `/v1` pagination fix in e79fe7ee is good.
--   What fails is the write:
--
--     supabase.from('streaming_profiles').upsert(...)
--       -> code    : 57014
--          message : canceling statement due to statement timeout
--          elapsed : 8300 ms   (Supabase statement_timeout = 8s)
--
--   api/spotify/sync-profile.ts discarded that error and returned only the
--   string "Failed to save streaming profile", which is why several rounds of
--   app-side changes could not fix it — the real failure was never visible.
--   (That blind spot is now fixed in the same commit as this file.)
--
-- ALREADY RULED OUT — do not re-investigate these:
--   * UNIQUE(user_id, service_type) for onConflict ....... exists, correct
--   * missing/renamed columns, CHECK constraint values ... all valid
--   * payload too large ................................. 0.76 MB (the row that
--       saved fine on 2026-07-02 was 0.78 MB — no meaningful difference)
--   * malformed JSON (NUL bytes / lone surrogates) ....... clean
--   * artists.name lookups in the trigger ............... a FULL seq scan of all
--       53,191 artists measures ~0 ms; the table is tiny and fully cached, so a
--       functional index on lower(name) would NOT fix this. (Tested — this was
--       my first hypothesis and it was wrong.)
--   * refresh_user_preferences_v5 volume ................ user_preference_signals
--       holds only 3,350 rows total, user_preferences 125.
--
--   Every table in the cascade is small, so 8s is pathological, not load. The
--   cost is inside the AFTER INSERT OR UPDATE OF profile_data trigger cascade on
--   streaming_profiles. Those triggers cannot be read from this repo: only ONE
--   of them (trigger_process_spotify_artists_to_signals) exists in
--   supabase/migrations/. process_spotify_genres_to_signals and friends live only
--   in the live database. That drift is why the queries below are needed.
--
-- HOW TO RUN: one statement at a time in the Supabase SQL editor. Do not paste
-- the whole file — the editor wraps multi-statement pastes in a transaction, and
-- a "Failed to fetch" then leaves an orphaned session holding locks.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Q1. What actually fires on streaming_profiles? (read-only)
--     Expect more than the single trigger present in supabase/migrations/.
-- ----------------------------------------------------------------------------
SELECT
  t.tgname                              AS trigger_name,
  CASE t.tgtype::integer & 1 WHEN 0 THEN 'AFTER' ELSE 'BEFORE' END AS timing,
  pg_get_triggerdef(t.oid)              AS definition,
  p.proname                             AS function_name
FROM pg_trigger t
JOIN pg_class c   ON c.oid = t.tgrelid
JOIN pg_proc p    ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'streaming_profiles'
  AND n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY t.tgname;


-- ----------------------------------------------------------------------------
-- Q2. THE DECISIVE ONE — per-trigger timings, safely rolled back.
--
--     EXPLAIN ANALYZE reports a "Trigger <name>: time=... calls=..." line for
--     EVERY trigger fired, which names the culprit outright. The no-op
--     `profile_data = profile_data` still fires the AFTER UPDATE OF profile_data
--     triggers (this is exactly what migration 20260703000003 does), and the
--     ROLLBACK means nothing is committed.
--
--     Run this whole block as ONE statement (it is a single transaction).
--     Replace the user_id if you want a different account; this one is the
--     130-artist profile from the failing screenshot.
-- ----------------------------------------------------------------------------
BEGIN;
  SET LOCAL statement_timeout = '120s';   -- so it completes instead of cancelling

  EXPLAIN (ANALYZE, BUFFERS, TIMING)
  UPDATE public.streaming_profiles
  SET profile_data = profile_data
  WHERE user_id = '690d27ae-d803-4ff5-a381-162f8863dd9b'
    AND service_type = 'spotify';
ROLLBACK;

-- Read the "Trigger ...: time=" lines at the bottom of the output. Whichever
-- trigger owns the multi-second number is the bug. Then dump its source with Q3.


-- ----------------------------------------------------------------------------
-- Q3. Source of the guilty function (read-only).
--     Substitute the proname that Q2 blamed.
-- ----------------------------------------------------------------------------
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'process_spotify_artists_to_signals',
    'process_spotify_genres_to_signals',
    'process_apple_music_genres_to_signals'
  );


-- ----------------------------------------------------------------------------
-- Q4. Confirm the timeout budget the write is running under (read-only).
--     The API request runs as service_role. 8s matched what we measured.
-- ----------------------------------------------------------------------------
SELECT r.rolname, s.setconfig
FROM pg_roles r
LEFT JOIN pg_db_role_setting s ON s.setrole = r.oid
WHERE r.rolname IN ('service_role', 'authenticated', 'anon', 'postgres');


-- ----------------------------------------------------------------------------
-- Q5. Is anything in the cascade reaching into events (277,781 rows)?
--     A feed recompute / cache warm fired from inside this transaction would
--     explain 8s on otherwise tiny tables. Read-only.
-- ----------------------------------------------------------------------------
SELECT n.nspname, p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosrc ILIKE '%personalized_feed_cache%'
ORDER BY p.proname;
