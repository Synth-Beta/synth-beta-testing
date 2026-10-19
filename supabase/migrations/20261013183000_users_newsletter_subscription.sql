-- Subscription category on the account table the newsletter reads.
-- Existing accounts stay subscribed unless they already unsubscribed.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS newsletter_subscription text;

UPDATE public.users
SET newsletter_subscription = 'subscribed'
WHERE newsletter_subscription IS NULL;

UPDATE public.users AS account
SET newsletter_subscription = 'unsubscribed'
WHERE EXISTS (
  SELECT 1
  FROM public.newsletter_unsubscribes AS unsubscribed
  WHERE lower(btrim(unsubscribed.email)) = lower(btrim(account.email))
);

ALTER TABLE public.users
  ALTER COLUMN newsletter_subscription SET DEFAULT 'subscribed';

ALTER TABLE public.users
  ALTER COLUMN newsletter_subscription SET NOT NULL;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_newsletter_subscription_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_newsletter_subscription_check
  CHECK (newsletter_subscription IN ('subscribed', 'unsubscribed'));

CREATE INDEX IF NOT EXISTS users_newsletter_subscription_idx
  ON public.users (newsletter_subscription);

-- Case-insensitive exact email match. Callable by the unsubscribe function only.
CREATE OR REPLACE FUNCTION public.unsubscribe_newsletter_by_email(target_email text)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  normalized text;
  updated_count integer;
  matched_user uuid;
BEGIN
  normalized := lower(btrim(COALESCE(target_email, '')));
  IF normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN 0;
  END IF;

  UPDATE public.users
  SET newsletter_subscription = 'unsubscribed'
  WHERE lower(btrim(email)) = normalized;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count = 0 THEN
    RETURN 0;
  END IF;

  SELECT user_id INTO matched_user
  FROM public.users
  WHERE lower(btrim(email)) = normalized
  LIMIT 1;

  INSERT INTO public.newsletter_unsubscribes (email, user_id, source, reason)
  VALUES (normalized, matched_user, 'email_link', 'Unsubscribed from newsletter')
  ON CONFLICT (email) DO UPDATE
    SET user_id = COALESCE(EXCLUDED.user_id, public.newsletter_unsubscribes.user_id),
        reason = EXCLUDED.reason;

  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.unsubscribe_newsletter_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unsubscribe_newsletter_by_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.unsubscribe_newsletter_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_newsletter_by_email(text) TO service_role;
