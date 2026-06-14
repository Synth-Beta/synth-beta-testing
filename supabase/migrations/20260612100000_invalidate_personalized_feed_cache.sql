-- Client-callable feed cache invalidation after streaming sync (server API uses service_role DELETE directly).
BEGIN;

CREATE OR REPLACE FUNCTION public.invalidate_personalized_feed_cache(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.personalized_feed_cache
  WHERE user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.invalidate_personalized_feed_cache(uuid) IS
  'Removes cached Feed V5 rows for a user so the next load reflects updated preferences.';

GRANT EXECUTE ON FUNCTION public.invalidate_personalized_feed_cache(uuid) TO authenticated;

COMMIT;
