-- Supabase linter remediation (safe defaults for app behavior):
--  - policy_exists_rls_disabled / rls_disabled_in_public on listed tables
--  - security_definer_view → security_invoker where relation is a normal VIEW
--
-- Requires PostgreSQL 15+ (Supabase: security_invoker on views).
-- Staging first recommended.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) user_preference_signals — enable RLS; drop stray policies; recreate
--    Client uses authenticated .select / .insert / .delete (settings onboarding).
--    Revoke anon writes (anon has no auth.uid(); RLS would block anyway).
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.user_preference_signals ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_preference_signals'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.user_preference_signals',
      pol.policyname
    );
  END LOOP;
END $$;

CREATE POLICY "Users can view their own signals"
  ON public.user_preference_signals
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own signals"
  ON public.user_preference_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own signals"
  ON public.user_preference_signals
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own signals"
  ON public.user_preference_signals
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.user_preference_signals FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preference_signals TO authenticated;
GRANT ALL ON public.user_preference_signals TO service_role;


-- ---------------------------------------------------------------------------
-- 2) personalized_feed_cache — RLS on; no policies for anon/authenticated.
--    Access should be via SECURITY DEFINER RPC (owner bypasses RLS).
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.personalized_feed_cache ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.personalized_feed_cache FROM anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3) Genre / taxonomy reference tables — RLS + world-readable SELECT
--    (adjust/remove anon if you never query these pre-login via PostgREST).
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.genre_similarity_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.genre_taxonomy_roots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.genre_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.genre_parent ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.genre_taxonomy_exclude ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'genre_similarity_edges',
    'genre_taxonomy_roots',
    'genre_paths',
    'genre_parent',
    'genre_taxonomy_exclude'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      t || '_public_read',
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (true)',
      t || '_public_read',
      t
    );
  END LOOP;
END $$;

GRANT SELECT ON public.genre_similarity_edges TO anon, authenticated;
GRANT SELECT ON public.genre_taxonomy_roots TO anon, authenticated;
GRANT SELECT ON public.genre_paths TO anon, authenticated;
GRANT SELECT ON public.genre_parent TO anon, authenticated;
GRANT SELECT ON public.genre_taxonomy_exclude TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4) Views flagged as SECURITY DEFINER — prefer SECURITY INVOKER (PG15+)
--    Only alters relkind = 'v' (plain views). Skips missing names quietly.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_name text;
  v_oid oid;
  v_targets text[] := ARRAY[
    'v_discover_usage_summary',
    'events_with_external_ids',
    'analytics_daily',
    'artists_with_external_ids',
    'users_complete',
    'venues_with_stats',
    'artist_profile_summary',
    'events_with_artist_venue',
    'venue_search_results',
    'content_feed_items_public_v1',
    'v_feed_interaction_summary',
    'users_with_verification',
    'analytics_events_by_umbrella',
    'v_search_usage_summary',
    'genre_cluster_keys',
    'reviews_with_connection_degree',
    'genre_similarity_pmi',
    'analytics_artists_by_cluster',
    'v_profile_interaction_summary',
    'venues_with_external_ids',
    'analytics_events_by_cluster',
    'artist_follows_with_details',
    'event_clusters',
    'artist_clusters',
    'friends',
    'users_with_subscription',
    'v_content_activity_summary'
  ];
BEGIN
  FOREACH v_name IN ARRAY v_targets
  LOOP
    SELECT c.oid
    INTO v_oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v_name
      AND c.relkind = 'v';

    IF v_oid IS NOT NULL THEN
      EXECUTE format(
        'ALTER VIEW public.%I SET (security_invoker = true)',
        v_name
      );
      RAISE NOTICE 'security_invoker enabled: public.%', v_name;
    END IF;
  END LOOP;
END $$;

COMMIT;
