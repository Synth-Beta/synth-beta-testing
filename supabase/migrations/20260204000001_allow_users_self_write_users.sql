-- ============================================
-- ALLOW USERS TO INSERT/UPDATE OWN USERS ROW
-- ============================================
-- Apple sign-in creates/updates a minimal public.users row immediately after auth,
-- and onboarding upserts profile fields. Both require write access under RLS.
--
-- This migration:
-- - Enables RLS on public.users (if it exists)
-- - Allows authenticated users to INSERT their own row (user_id = auth.uid())
-- - Allows authenticated users to UPDATE their own row (user_id = auth.uid())
-- ============================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'users'
  ) THEN
    -- Ensure RLS is enabled
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

    -- Drop old policies if they exist (idempotent)
    DROP POLICY IF EXISTS "Users can insert their own user row" ON public.users;
    DROP POLICY IF EXISTS "Users can update their own user row" ON public.users;

    -- Insert: user can create their own row
    CREATE POLICY "Users can insert their own user row"
    ON public.users
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

    -- Update: user can update their own row
    CREATE POLICY "Users can update their own user row"
    ON public.users
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

    -- Grant DML privileges to authenticated
    GRANT INSERT, UPDATE ON public.users TO authenticated;
  END IF;
END $$;

COMMIT;

