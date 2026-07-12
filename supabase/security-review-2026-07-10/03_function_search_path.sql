-- =============================================================================
-- 03 — Pin search_path on functions that don't set it
-- Advisor: function_search_path_mutable  (243 functions)
-- =============================================================================
--
-- WHY: A function without a fixed search_path resolves unqualified object names
--   using the CALLER's search_path. A malicious caller can prepend a schema with
--   a shadowing object and hijack what the function references. Pinning
--   search_path closes this. This is the #1 hardening Supabase recommends.
--
-- CHOSEN VALUE: 'public, extensions, pg_temp'
--   - public: your tables/functions
--   - extensions: pg_trgm / similarity() and other extension functions some of
--     these functions call unqualified (setting only 'public' could break those)
--   - pg_temp: last, per Postgres guidance (never first)
--   Functions that call auth.uid() are unaffected — auth.uid() is already
--   schema-qualified, so it resolves regardless of search_path.
--
-- -----------------------------------------------------------------------------
-- DRY RUN 1 — how many / which functions will be changed
-- -----------------------------------------------------------------------------
SELECT n.nspname AS schema, p.proname AS function,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'                              -- plain functions only
  AND NOT EXISTS (                                 -- that DON'T already set search_path
    SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg
    WHERE cfg LIKE 'search_path=%'
  )
ORDER BY p.proname;

-- -----------------------------------------------------------------------------
-- DRY RUN 2 — preview the exact ALTER statements without running them
-- -----------------------------------------------------------------------------
SELECT format(
         'ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_temp;',
         p.proname, pg_get_function_identity_arguments(p.oid)
       ) AS stmt
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg
    WHERE cfg LIKE 'search_path=%'
  )
ORDER BY p.proname;

-- -----------------------------------------------------------------------------
-- APPLY — idempotent: only touches functions missing a search_path setting.
--   Re-running is safe (already-pinned functions are skipped). Wrapped so one
--   bad function raises a notice instead of aborting the whole batch.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_temp;',
        r.proname, r.args
      );
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipped %(%): %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- VERIFY — should return 0 rows after applying
-- -----------------------------------------------------------------------------
SELECT count(*) AS still_mutable
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg
    WHERE cfg LIKE 'search_path=%'
  );

-- Then smoke-test: search a venue/artist (pg_trgm), load the home feed,
-- sign up a test user. All exercise functions changed here.

-- -----------------------------------------------------------------------------
-- ROLLBACK (rarely needed): reset search_path on all public functions.
-- -----------------------------------------------------------------------------
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN
--     SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.prokind = 'f'
--   LOOP
--     EXECUTE format('ALTER FUNCTION public.%I(%s) RESET search_path;', r.proname, r.args);
--   END LOOP;
-- END $$;
