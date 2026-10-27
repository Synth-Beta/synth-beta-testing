-- Let reviewers keep their ticket price private on a public review.
--
-- Hiding it in the app is not enough: reviews are readable straight from the API,
-- so a UI-only flag would still leak the number. Instead, when show_ticket_price is
-- false a trigger moves the price into review_ticket_prices (readable only by the
-- author) and stores NULL on the public reviews row. Every screen already skips a
-- NULL price, and recommend_at_price ("worth it at that price?") stays public.
--
-- Older app versions don't send show_ticket_price, so they get the default (true)
-- and behave exactly as before.
--
-- Run this in the Supabase SQL editor.

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS show_ticket_price boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.reviews.show_ticket_price IS
  'false = ticket price hidden from others; the number lives in review_ticket_prices (author-only).';

CREATE TABLE IF NOT EXISTS public.review_ticket_prices (
  -- Deferred: the BEFORE INSERT trigger writes here before the review row exists.
  review_id uuid PRIMARY KEY REFERENCES public.reviews(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  user_id uuid NOT NULL,
  ticket_price_paid numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.review_ticket_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_ticket_prices FROM anon, authenticated;
GRANT SELECT ON public.review_ticket_prices TO authenticated;

DROP POLICY IF EXISTS "Authors read their own hidden ticket price" ON public.review_ticket_prices;
CREATE POLICY "Authors read their own hidden ticket price"
  ON public.review_ticket_prices FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.hide_review_ticket_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.show_ticket_price = false THEN
    IF NEW.ticket_price_paid IS NOT NULL THEN
      INSERT INTO public.review_ticket_prices (review_id, user_id, ticket_price_paid, updated_at)
      VALUES (NEW.id, NEW.user_id, NEW.ticket_price_paid, now())
      ON CONFLICT (review_id) DO UPDATE
        SET ticket_price_paid = EXCLUDED.ticket_price_paid, updated_at = now();
      NEW.ticket_price_paid := NULL;
    END IF;
  ELSE
    -- Switched back to shown without re-sending the number: restore it.
    IF NEW.ticket_price_paid IS NULL THEN
      SELECT p.ticket_price_paid INTO NEW.ticket_price_paid
      FROM public.review_ticket_prices p WHERE p.review_id = NEW.id;
    END IF;
    DELETE FROM public.review_ticket_prices WHERE review_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hide_review_ticket_price ON public.reviews;
CREATE TRIGGER hide_review_ticket_price
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.hide_review_ticket_price();

-- VERIFY: column + trigger exist.
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'show_ticket_price';
SELECT tgname FROM pg_trigger WHERE tgname = 'hide_review_ticket_price';
