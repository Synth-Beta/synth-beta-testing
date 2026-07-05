-- DB integrity fixes, part 1 of 3: missing foreign keys (audit 2026-07-03)
--
-- Root problem behind the ghost-user bugs: several user-data tables have NO
-- foreign key to users, and one (streaming_profiles) points at auth.users
-- while the rest of the app treats public.users as canonical. When an account
-- is deleted from public.users, those tables keep orphaned rows -- which is
-- exactly what broke refresh_user_preferences_v5(NULL) twice today.
--
-- Zero app-logic change: FKs only enforce what the app already assumes.
-- All orphan counts verified against prod before writing this file.
-- Safe to run as one normal transaction; all affected tables are small,
-- so the brief locks taken by ADD CONSTRAINT are negligible.

-- ---------------------------------------------------------------------------
-- 1. user_preference_signals.user_id -> users  (the table that bit us)
--    Orphans already cleaned by 20260703000003; verified 0 remain.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_preference_signals
  ADD CONSTRAINT user_preference_signals_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. personalized_feed_cache.user_id -> users
--    96 orphaned cache rows exist for deleted accounts (verified). They're
--    expired TTL-cache garbage -- delete, then constrain.
-- ---------------------------------------------------------------------------
DELETE FROM public.personalized_feed_cache c
WHERE c.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = c.user_id);

ALTER TABLE public.personalized_feed_cache
  ADD CONSTRAINT personalized_feed_cache_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. streaming_profiles: retarget FK from auth.users to public.users.
--    This is how today's ghost profile survived: the account was removed from
--    public.users but still existed in auth.users, so the auth-side CASCADE
--    never fired. public.users.user_id itself FKs auth.users(id), so every
--    row valid under the new FK was valid under the old one -- the new one is
--    simply stricter and matches what the app treats as "a user exists".
--    Verified: 0 current rows violate it.
--    CAVEAT: if any code path ever writes a streaming profile BEFORE the
--    public.users row exists (e.g. mid-onboarding), that insert would now
--    fail. Spotify/Apple sync runs well after profile creation, so this
--    should not occur -- but it's the one behavioral edge to be aware of.
-- ---------------------------------------------------------------------------
ALTER TABLE public.streaming_profiles
  DROP CONSTRAINT streaming_profiles_user_id_fkey;

ALTER TABLE public.streaming_profiles
  ADD CONSTRAINT streaming_profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- NOT changed here (documented for a future pass):
--  * These tables also FK auth.users instead of public.users and can orphan
--    the same way if a public profile is deleted without the auth account:
--      bucket_list, passport_entries, passport_identity, passport_timeline,
--      spotify_user_tokens, user_achievement_progress, user_created_artists,
--      user_jambase_events, user_scene_progress, user_settings_preferences,
--      content_feed_items(created_by/updated_by), scenes(created_by)
--    Each needs its write path checked (does anything insert before the
--    public.users row exists?) before retargeting -- do them one at a time.
--  * jambase_events has FK-less artist_id/venue_id but 0 rows -- dead legacy
--    table, candidate for DROP TABLE in a cleanup pass.
--  * _genre_cooc_stg has no primary key -- internal staging table, harmless.
--  * The cleanest long-term account-deletion story: always delete the
--    auth.users row (supabase.auth.admin.deleteUser) and let CASCADEs do the
--    rest, instead of deleting public.users directly.
-- ---------------------------------------------------------------------------
