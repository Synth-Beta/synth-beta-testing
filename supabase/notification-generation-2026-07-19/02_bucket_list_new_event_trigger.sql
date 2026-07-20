-- =============================================================================
-- 02 — Wire "bucket-list new event" notifications
-- =============================================================================
-- WHY: notify_bucket_list_new_event() is already written for the CURRENT schema
-- (reads events/artists/venues/bucket_list/entities, inserts type
-- 'bucket_list_new_event' which IS in notifications_type_check) — it was simply
-- never attached to a trigger. Its siblings notify_artist_followers_new_event and
-- notify_venue_followers_new_event ARE wired on events INSERT; this is the missing
-- third one (alerts users when an artist/venue on their bucket list gets a new show).
--
-- GUARD: fire only for FUTURE events (NEW.event_date >= now()). Without this, a
-- JamBase backfill of past-dated events would generate "has a new show!" alerts for
-- shows that already happened. now() is STABLE and legal in a trigger WHEN clause.
--
-- SAFETY: adds one AFTER INSERT trigger; function unchanged. Idempotent.
-- Review, then apply yourself.
-- =============================================================================

DROP TRIGGER IF EXISTS trigger_notify_bucket_list_new_event ON public.events;
CREATE TRIGGER trigger_notify_bucket_list_new_event
  AFTER INSERT ON public.events
  FOR EACH ROW
  WHEN (NEW.event_date >= now())
  EXECUTE FUNCTION public.notify_bucket_list_new_event();

-- ---- VERIFY -----------------------------------------------------------------
SELECT count(*) AS bucket_list_trigger_expect_1
FROM pg_trigger WHERE tgname='trigger_notify_bucket_list_new_event';

-- NOTE on volume: like the two follower triggers, this fires once per inserted
-- future event and notifies only users who bucket-listed that exact artist/venue,
-- so volume tracks genuinely-new upcoming shows (bounded). If a large future-dated
-- import ever needs to run silently, disable briefly:
--   ALTER TABLE public.events DISABLE TRIGGER trigger_notify_bucket_list_new_event;
--   ... import ...
--   ALTER TABLE public.events ENABLE  TRIGGER trigger_notify_bucket_list_new_event;

-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trigger_notify_bucket_list_new_event ON public.events;
