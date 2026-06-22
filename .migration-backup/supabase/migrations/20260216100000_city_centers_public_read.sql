-- Ensure city_centers is readable by anon for search_city_centers RPC (onboarding, discover)
-- The search_city_centers function uses SECURITY INVOKER, so the caller (anon) needs SELECT.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'city_centers') THEN
    GRANT SELECT ON public.city_centers TO anon;

    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'city_centers' AND c.relrowsecurity
    ) THEN
      DROP POLICY IF EXISTS "city_centers_select_public" ON public.city_centers;
      CREATE POLICY "city_centers_select_public" ON public.city_centers
        FOR SELECT USING (true);
    END IF;
  END IF;
END $$;

COMMIT;
