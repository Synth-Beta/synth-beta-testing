-- Ensure genres table is readable by anon for onboarding (direct table query)
-- RLS policy already allows SELECT; grant table access to anon.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'genres') THEN
    GRANT SELECT ON public.genres TO anon;
    GRANT SELECT ON public.genres TO authenticated;
  END IF;
END $$;

COMMIT;
