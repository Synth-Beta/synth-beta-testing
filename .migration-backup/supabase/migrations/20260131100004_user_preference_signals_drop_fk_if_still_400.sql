-- RUN ONLY IF YOU STILL GET 400 after 20260131100003.
-- Foreign key user_id -> users(user_id) can cause 400 when auth.uid() is not
-- in public.users (e.g. sync delay or different id). Dropping it lets inserts
-- succeed; you can re-add the FK later once users sync is fixed.

ALTER TABLE public.user_preference_signals
  DROP CONSTRAINT IF EXISTS user_preference_signals_user_id_fkey;
