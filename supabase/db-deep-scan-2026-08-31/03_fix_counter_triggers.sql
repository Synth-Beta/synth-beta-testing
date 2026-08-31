-- =============================================================================
-- Fix the events counter triggers — REVIEW ONLY, apply yourself.
--
-- THE BUG is the ELSIF branch in the TG_OP = 'UPDATE' arm of both functions:
--
--     ELSIF NEW.artist_id IS NOT NULL THEN
--       UPDATE public.artists SET num_upcoming_events = (SELECT COUNT(*) ...)
--
-- It recounts on EVERY update where artist_id did not change. The count depends
-- only on artist_id, event_date and event_status — so an update touching
-- description, images, external_url, tour_name or any other column triggers a
-- full COUNT(*) over events for that artist AND rewrites the artists row, to
-- arrive at the number it already held.
--
-- The sync updates existing events on every run. Two triggers x every updated
-- event = two counts plus two row rewrites that cannot change anything. That is
-- a large share of the 2,114 ms average events INSERT and of the WAL volume the
-- realtime decoder was spending 26% of total database time chewing through.
--
-- The fix adds the missing guard. Semantics are identical: every case that can
-- actually change the count still recounts.
--
-- NOTE: the guard must live inside the function, not in a trigger WHEN clause.
-- Postgres rejects a WHEN that references OLD on a trigger declared for
-- INSERT OR UPDATE OR DELETE, so the triggers themselves stay exactly as they
-- are — this is CREATE OR REPLACE FUNCTION only, no trigger changes.
-- =============================================================================


-- ##### ARTISTS ##############################################################
CREATE OR REPLACE FUNCTION public.update_artist_upcoming_events_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.artist_id IS NOT NULL THEN
      UPDATE public.artists
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events
        WHERE events.artist_id = NEW.artist_id
          AND events.event_date >= NOW()
          AND events.event_status IS DISTINCT FROM 'EventCancelled'
      )
      WHERE artists.id = NEW.artist_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.artist_id IS NOT NULL THEN
      UPDATE public.artists
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events
        WHERE events.artist_id = OLD.artist_id
          AND events.event_date >= NOW()
          AND events.event_status IS DISTINCT FROM 'EventCancelled'
      )
      WHERE artists.id = OLD.artist_id;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.artist_id IS DISTINCT FROM NEW.artist_id THEN
      -- The event moved between artists: both counts change.
      IF OLD.artist_id IS NOT NULL THEN
        UPDATE public.artists
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events
          WHERE events.artist_id = OLD.artist_id
            AND events.event_date >= NOW()
            AND events.event_status IS DISTINCT FROM 'EventCancelled'
        )
        WHERE artists.id = OLD.artist_id;
      END IF;

      IF NEW.artist_id IS NOT NULL THEN
        UPDATE public.artists
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events
          WHERE events.artist_id = NEW.artist_id
            AND events.event_date >= NOW()
            AND events.event_status IS DISTINCT FROM 'EventCancelled'
        )
        WHERE artists.id = NEW.artist_id;
      END IF;

    -- CHANGED: was `ELSIF NEW.artist_id IS NOT NULL THEN`, which recounted on
    -- every update regardless of what changed. The count reads only event_date
    -- and event_status, so nothing else can move it.
    ELSIF NEW.artist_id IS NOT NULL
          AND (OLD.event_date   IS DISTINCT FROM NEW.event_date
            OR OLD.event_status IS DISTINCT FROM NEW.event_status) THEN
      UPDATE public.artists
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events
        WHERE events.artist_id = NEW.artist_id
          AND events.event_date >= NOW()
          AND events.event_status IS DISTINCT FROM 'EventCancelled'
      )
      WHERE artists.id = NEW.artist_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;


-- ##### VENUES ###############################################################
CREATE OR REPLACE FUNCTION public.update_venue_upcoming_events_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.venue_id IS NOT NULL THEN
      UPDATE public.venues
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events
        WHERE events.venue_id = NEW.venue_id
          AND events.event_date >= NOW()
          AND events.event_status IS DISTINCT FROM 'EventCancelled'
      )
      WHERE venues.id = NEW.venue_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.venue_id IS NOT NULL THEN
      UPDATE public.venues
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events
        WHERE events.venue_id = OLD.venue_id
          AND events.event_date >= NOW()
          AND events.event_status IS DISTINCT FROM 'EventCancelled'
      )
      WHERE venues.id = OLD.venue_id;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.venue_id IS DISTINCT FROM NEW.venue_id THEN
      IF OLD.venue_id IS NOT NULL THEN
        UPDATE public.venues
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events
          WHERE events.venue_id = OLD.venue_id
            AND events.event_date >= NOW()
            AND events.event_status IS DISTINCT FROM 'EventCancelled'
        )
        WHERE venues.id = OLD.venue_id;
      END IF;

      IF NEW.venue_id IS NOT NULL THEN
        UPDATE public.venues
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events
          WHERE events.venue_id = NEW.venue_id
            AND events.event_date >= NOW()
            AND events.event_status IS DISTINCT FROM 'EventCancelled'
        )
        WHERE venues.id = NEW.venue_id;
      END IF;

    -- CHANGED: same guard as the artist function above.
    ELSIF NEW.venue_id IS NOT NULL
          AND (OLD.event_date   IS DISTINCT FROM NEW.event_date
            OR OLD.event_status IS DISTINCT FROM NEW.event_status) THEN
      UPDATE public.venues
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events
        WHERE events.venue_id = NEW.venue_id
          AND events.event_date >= NOW()
          AND events.event_status IS DISTINCT FROM 'EventCancelled'
      )
      WHERE venues.id = NEW.venue_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;


-- ---- VERIFY ----------------------------------------------------------------
-- 1. Counts must be unchanged. Run this BEFORE and AFTER applying, and diff:
--
--   SELECT id, num_upcoming_events FROM public.artists
--   WHERE num_upcoming_events > 0 ORDER BY num_upcoming_events DESC LIMIT 20;
--
-- 2. Touching a non-counted column must no longer rewrite the artist row.
--    xmin is the row version — if it changes, the row was rewritten.
--
--   SELECT xmin, num_upcoming_events FROM public.artists WHERE id = '<artist>';
--   UPDATE public.events SET description = description WHERE id = '<their event>';
--   SELECT xmin, num_upcoming_events FROM public.artists WHERE id = '<artist>';
--   -- expect IDENTICAL xmin and identical count. Before this fix xmin changed.
--
-- 3. Changing event_date must still recount:
--
--   UPDATE public.events SET event_date = event_date + interval '1 day'
--   WHERE id = '<a past event for that artist>';
--   -- count should move if that crosses the NOW() boundary


-- ---- KNOWN LIMITATION, deliberately not fixed here -------------------------
-- num_upcoming_events is defined against NOW(), so it drifts wrong on its own
-- as events age past their date — it is only corrected when some event for that
-- artist or venue happens to be touched. An artist whose shows have all passed
-- keeps a stale non-zero count indefinitely.
--
-- That is pre-existing behaviour and this change does not make it worse: the old
-- ELSIF only recounted when an unrelated column changed, which was never a
-- reliable refresh either.
--
-- The real fix is a periodic recount instead of per-row triggers. You already
-- run refresh_event_popularity() on pg_cron; a nightly recount on the same
-- schedule would let both triggers be dropped entirely. Worth doing once the
-- sync cost is measured, not before.
