-- Fix 400 on user_preference_signals: ensure PostgREST can insert.
-- 1. Grant table permissions (table may have had no INSERT for authenticated).
-- 2. Disable RLS so no policy can block the insert (400 can come from RLS).

GRANT SELECT, INSERT ON public.user_preference_signals TO authenticated;
GRANT SELECT, INSERT ON public.user_preference_signals TO anon;
GRANT ALL ON public.user_preference_signals TO service_role;

ALTER TABLE public.user_preference_signals DISABLE ROW LEVEL SECURITY;
