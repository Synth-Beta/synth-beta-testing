-- Passport stamps, entity rarity, and the achievements engine.
-- Consolidated 2026-09-28 from supabase/passport-rarity-2026-09-24/ (files 03,
-- 04, 11, 13, 14, 16, 20), which were applied to production one at a time via
-- the Supabase SQL editor between 2026-09-24 and 2026-09-27 and verified there.
-- This file is the record of that work; it is idempotent and re-runnable.
--
-- ROOT CAUSE behind nearly all of it: reviews.event_id is ALWAYS NULL in this
-- database. Anything that resolved an artist/venue/city by joining events on
-- r.event_id silently matched zero rows. Names resolve from reviews.artist_id /
-- reviews.venue_id instead. See reference_reviews_event_id_always_null.
--
-- MEASURED RESULT after applying:
--   stamps        19 -> 116 (artist 48, venue 42, city 26 - first city stamps ever)
--   users stamped  3 -> 8
--   rarity        uniform 'common' -> 3% legendary / 12% uncommon / 85% common
--   achievements  0 tiers ever -> 47 (bronze 25, silver 10, gold 12), 7 users
--
-- SUPERSEDED SOURCE FILES (do not resurrect):
--   07-10 -> folded into 11. Early rarity models ranked by inverse supply, which
--           made a 1-event tribute act "legendary" and Melkweg "common".
--   18,19 -> folded into 20. Each ended with a backfill; the editor runs a
--           selection as ONE transaction, so the failing backfill rolled back
--           the DDL above it. Splitting DDL from data work is what fixed it.
--
-- STILL PENDING, deliberately not here - see supabase/pending/:
--   venue_loyalist counts deduplicated stamps (always 1) instead of visits.
--   Three functions still resolve names through the dead event_id join.


-- ========================================================================
-- SOURCE: 03_fix_stamp_trigger.sql
-- ========================================================================

-- Passport stamps: make the trigger actually create stamps. 2026-09-24.
-- REVIEW ONLY, NOT APPLIED.
--
-- trigger_auto_unlock_passport_on_review has been attached and enabled the
-- whole time. The body looked the review's event up with
-- `WHERE e.id = NEW.event_id`, but reviews.event_id is always NULL here, so
-- v_event_data never matched and every unlock_* call was skipped. Stamps stop
-- at 2026-01-18, when reviews moved to artist_id / venue_id.
--
-- This rewrite reads artist/venue off the review itself and keeps the event
-- join only as a fallback for rows that do carry an event_id.

CREATE OR REPLACE FUNCTION public.auto_unlock_passport_on_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_artist_id   uuid;
  v_venue_id    uuid;
  v_artist_name text;
  v_venue_name  text;
  v_city        text;
  v_state       text;
  v_title       text;
  v_is_festival boolean := false;
BEGIN
  IF NEW.is_draft IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;
  IF NOT (NEW.was_there = true OR NEW.review_text IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  v_artist_id := NEW.artist_id;
  v_venue_id  := NEW.venue_id;

  -- Fallback for legacy rows that still carry an event_id.
  IF v_artist_id IS NULL AND v_venue_id IS NULL AND NEW.event_id IS NOT NULL THEN
    SELECT e.artist_id, e.venue_id, e.title
      INTO v_artist_id, v_venue_id, v_title
    FROM public.events e
    WHERE e.id = NEW.event_id;
  END IF;

  IF v_artist_id IS NOT NULL THEN
    SELECT a.name INTO v_artist_name
    FROM public.artists a WHERE a.id = v_artist_id;
  END IF;

  IF v_venue_id IS NOT NULL THEN
    SELECT v.name, v.city, v.state INTO v_venue_name, v_city, v_state
    FROM public.venues v WHERE v.id = v_venue_id;
  END IF;

  -- City comes from the venue now; reviews have no venue_city column.
  IF v_city IS NOT NULL AND lower(trim(v_city)) <> 'unknown' AND trim(v_city) <> '' THEN
    PERFORM public.unlock_passport_city(NEW.user_id, v_city, v_state);
  END IF;

  -- ::text deliberately selects the TEXT overload of unlock_passport_venue.
  -- The uuid overload writes entity_id only and uses a different conflict key,
  -- so mixing the two produces two stamps for one venue. The text overload
  -- also records entity_uuid, which is what the rarity join needs.
  IF v_venue_id IS NOT NULL AND v_venue_name IS NOT NULL THEN
    PERFORM public.unlock_passport_venue(NEW.user_id, v_venue_id::text, v_venue_name);
  END IF;

  IF v_artist_id IS NOT NULL AND v_artist_name IS NOT NULL THEN
    PERFORM public.unlock_passport_artist(NEW.user_id, v_artist_id::text, v_artist_name);
  END IF;

  v_is_festival := coalesce(v_venue_name, '') ~* '(festival|fest|gathering|fair)'
                OR coalesce(v_title, '')      ~* '(festival|fest)';
  IF v_is_festival THEN
    PERFORM public.detect_festival_stamps(NEW.user_id);
  END IF;

  -- detect_first_time_city(user, event_id) is dropped: it took NEW.event_id,
  -- which is always NULL. Re-add only if it gains an artist/venue signature.

  PERFORM public.calculate_artist_milestones(NEW.user_id);

  IF NEW.review_text IS NOT NULL AND NEW.review_text <> 'ATTENDANCE_ONLY' THEN
    PERFORM public.detect_deep_cut_reviewer(NEW.user_id);
  END IF;

  PERFORM public.check_all_achievements(NEW.user_id);

  RETURN NEW;
END;
$function$;

-- Verify: should now report artist/venue/city stamps for a recent reviewer.
-- SELECT type, count(*) FROM public.passport_entries GROUP BY type;


-- ========================================================================
-- SOURCE: 04_entity_rarity.sql
-- ========================================================================

-- Passport rarity: compute it instead of defaulting it. 2026-09-24.
-- REVIEW ONLY, NOT APPLIED.
--
-- Today passport_entries.rarity defaults to 'common' and nothing ever sets it,
-- so all 19 stamps are common and two of the three UI filters return zero.
--
-- Model: rarity = scarcity of opportunity, bucketed by PERCENTILE rather than
-- by absolute threshold. Percentiles make the distribution structural — the
-- system can never collapse back to all-common whatever the data does.
--
--   commonness = ln(1 + upcoming events) + ln(1 + events in catalog)
--
-- An artist with 389 upcoming dates is easy to catch (common). One with a
-- single show ever is not (legendary). Measured inputs, 2026-09-24:
-- num_upcoming_events has 0 nulls, p50=1, p95=11, max=389; event supply splits
-- 5.5k artists with none, 32k with 1-2, 12k with 3-10, 7.2k with 10+.
--
-- Peer scarcity ("only 3 Synth users saw this") is deliberately NOT used yet:
-- only 43 artists have any reviewer at all, 38 of them exactly one. Revisit at
-- roughly 10x the users.

CREATE TABLE IF NOT EXISTS public.entity_rarity (
  entity_type text        NOT NULL CHECK (entity_type IN ('artist', 'venue')),
  entity_uuid uuid        NOT NULL,
  commonness  numeric     NOT NULL,
  percentile  numeric     NOT NULL,
  rarity      text        NOT NULL CHECK (rarity IN ('common', 'uncommon', 'legendary')),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_uuid)
);

ALTER TABLE public.entity_rarity ENABLE ROW LEVEL SECURITY;

-- Rarity is catalog-wide, not per-user: readable by any signed-in user,
-- writable only by the refresh function (SECURITY DEFINER).
DROP POLICY IF EXISTS entity_rarity_read ON public.entity_rarity;
CREATE POLICY entity_rarity_read ON public.entity_rarity
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.refresh_entity_rarity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- Artists: touring reach + historical supply.
  WITH supply AS (
    SELECT a.id,
           coalesce(a.num_upcoming_events, 0) AS reach,
           count(e.id)                        AS catalog_events
    FROM public.artists a
    LEFT JOIN public.events e ON e.artist_id = a.id
    GROUP BY a.id, a.num_upcoming_events
  ), ranked AS (
    SELECT id,
           ln(1 + reach) + ln(1 + catalog_events) AS commonness,
           percent_rank() OVER (
             ORDER BY ln(1 + reach) + ln(1 + catalog_events)
           ) AS pr
    FROM supply
  )
  INSERT INTO public.entity_rarity AS er
        (entity_type, entity_uuid, commonness, percentile, rarity, computed_at)
  SELECT 'artist', id, commonness, pr,
         CASE WHEN pr <= 0.02 THEN 'legendary'
              WHEN pr <= 0.15 THEN 'uncommon'
              ELSE 'common' END,
         now()
  FROM ranked
  ON CONFLICT (entity_type, entity_uuid) DO UPDATE
    SET commonness  = EXCLUDED.commonness,
        percentile  = EXCLUDED.percentile,
        rarity      = EXCLUDED.rarity,
        computed_at = EXCLUDED.computed_at;

  -- Venues: no touring column, so supply alone. A room that hosts two shows a
  -- year is a rarer stamp than one running nightly.
  WITH supply AS (
    SELECT v.id, count(e.id) AS catalog_events
    FROM public.venues v
    LEFT JOIN public.events e ON e.venue_id = v.id
    GROUP BY v.id
  ), ranked AS (
    SELECT id,
           ln(1 + catalog_events) AS commonness,
           percent_rank() OVER (ORDER BY ln(1 + catalog_events)) AS pr
    FROM supply
  )
  INSERT INTO public.entity_rarity AS er
        (entity_type, entity_uuid, commonness, percentile, rarity, computed_at)
  SELECT 'venue', id, commonness, pr,
         CASE WHEN pr <= 0.02 THEN 'legendary'
              WHEN pr <= 0.15 THEN 'uncommon'
              ELSE 'common' END,
         now()
  FROM ranked
  ON CONFLICT (entity_type, entity_uuid) DO UPDATE
    SET commonness  = EXCLUDED.commonness,
        percentile  = EXCLUDED.percentile,
        rarity      = EXCLUDED.rarity,
        computed_at = EXCLUDED.computed_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_entity_rarity() FROM PUBLIC;

-- Stamps join to rarity instead of storing a frozen copy of it. Freezing a
-- computed value onto the row is exactly how every stamp ended up 'common'.
-- security_invoker keeps passport_entries' RLS in force through the view.
CREATE OR REPLACE VIEW public.passport_entries_with_rarity
WITH (security_invoker = true) AS
SELECT pe.id,
       pe.user_id,
       pe.type,
       pe.entity_id,
       pe.entity_uuid,
       pe.entity_name,
       pe.unlocked_at,
       pe.metadata,
       pe.cultural_context,
       coalesce(er.rarity, 'common')  AS rarity,
       er.percentile                  AS rarity_percentile
FROM public.passport_entries pe
LEFT JOIN public.entity_rarity er
       ON er.entity_uuid = pe.entity_uuid
      AND er.entity_type = pe.type;

GRANT SELECT ON public.passport_entries_with_rarity TO authenticated;

-- First run (57k artists + 25k venues; seconds, not minutes).
SELECT public.refresh_entity_rarity();

-- Nightly. 07:40 is taken by artist-genre-propagation, so 08:10.
-- SELECT cron.schedule('refresh-entity-rarity', '10 8 * * *',
--                      $$SELECT public.refresh_entity_rarity();$$);

-- Verify the distribution is actually spread:
-- SELECT entity_type, rarity, count(*) FROM public.entity_rarity
-- GROUP BY entity_type, rarity ORDER BY entity_type, rarity;


-- ========================================================================
-- SOURCE: 11_final_rarity.sql
-- ========================================================================

-- Rarity, final: 10's artist model + 09's venue model. 2026-09-25.
--
-- Measured on the 19 real stamps, neither file won outright:
--   10 fixed artists  - Tedeschi Trucks and Goose rose from common to uncommon.
--   10 broke venues   - Encore Theater at Wynn hit 1.000 (a ~1,500-seat room,
--                       top of the whole catalog) while Melkweg and The Anthem
--                       fell from legendary to uncommon. City spread is biased
--                       by catalog coverage: European rooms host acts with few
--                       DISTINCT cities in this US-centric JamBase data.
--   09 had venues right (Melkweg, The Anthem, The Pageant legendary) but
--                       artists wrong (Tedeschi Trucks, Goose common).
--
-- So: artists ranked by geographic spread, venues by the touring reach of the
-- acts they host. Known residual, accepted: Shakedown Citi still ranks
-- legendary - it really does tour regionally, so no signal here separates a
-- touring tribute act from a headliner.
--
-- CEILING: every term is a proxy for audience size, which this database does
-- not store. The real fix is artists.popularity / followers backfilled from
-- Spotify's artist endpoint. Until then this is as good as the data gets;
-- further tuning is noise, not signal.

CREATE OR REPLACE FUNCTION public.refresh_entity_rarity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  WITH supply AS (
    SELECT a.id,
           coalesce(a.num_upcoming_events, 0)                    AS reach,
           count(e.id)                                           AS catalog_events,
           count(DISTINCT e.venue_city) FILTER (
             WHERE e.venue_city IS NOT NULL AND e.venue_city <> ''
           )                                                     AS cities
    FROM public.artists a
    LEFT JOIN public.events e ON e.artist_id = a.id
    GROUP BY a.id, a.num_upcoming_events
  ), eligible AS (
    SELECT * FROM supply WHERE reach > 0 OR catalog_events > 0
  ), ranked AS (
    SELECT id,
           -- Cities carries 3x: it is the term that actually distinguishes a
           -- national act from a local one.
           3 * ln(1 + cities) + ln(1 + reach) + 0.5 * ln(1 + catalog_events) AS stature,
           percent_rank() OVER (
             ORDER BY 3 * ln(1 + cities) + ln(1 + reach)
                      + 0.5 * ln(1 + catalog_events), id
           ) AS pr
    FROM eligible
  )
  INSERT INTO public.entity_rarity
        (entity_type, entity_uuid, commonness, percentile, rarity, computed_at)
  SELECT 'artist', id, stature, pr,
         CASE WHEN pr >= 0.97 THEN 'legendary'
              WHEN pr >= 0.85 THEN 'uncommon'
              ELSE 'common' END,
         now()
  FROM ranked
  ON CONFLICT (entity_type, entity_uuid) DO UPDATE
    SET commonness  = EXCLUDED.commonness,
        percentile  = EXCLUDED.percentile,
        rarity      = EXCLUDED.rarity,
        computed_at = EXCLUDED.computed_at;

  -- VENUES: judged by who plays there, not how often the doors open.
  WITH hosted AS (
    SELECT v.id,
           count(e.id)                                      AS events_hosted,
           coalesce(max(a.num_upcoming_events), 0)          AS top_act_reach
    FROM public.venues v
    LEFT JOIN public.events e  ON e.venue_id  = v.id
    LEFT JOIN public.artists a ON a.id        = e.artist_id
    GROUP BY v.id
  ), eligible AS (
    SELECT * FROM hosted WHERE events_hosted > 0
  ), ranked AS (
    SELECT id,
           2 * ln(1 + top_act_reach) + ln(1 + events_hosted) AS stature,
           percent_rank() OVER (
             ORDER BY 2 * ln(1 + top_act_reach) + ln(1 + events_hosted), id
           ) AS pr
    FROM eligible
  )
  INSERT INTO public.entity_rarity
        (entity_type, entity_uuid, commonness, percentile, rarity, computed_at)
  SELECT 'venue', id, stature, pr,
         CASE WHEN pr >= 0.97 THEN 'legendary'
              WHEN pr >= 0.85 THEN 'uncommon'
              ELSE 'common' END,
         now()
  FROM ranked
  ON CONFLICT (entity_type, entity_uuid) DO UPDATE
    SET commonness  = EXCLUDED.commonness,
        percentile  = EXCLUDED.percentile,
        rarity      = EXCLUDED.rarity,
        computed_at = EXCLUDED.computed_at;
END;
$function$;

DELETE FROM public.entity_rarity;
SELECT public.refresh_entity_rarity();

-- Expect: Melkweg / The Anthem / The Pageant legendary again, Tedeschi Trucks
-- and Goose holding uncommon or better, Encore Theater no longer 1.000.
SELECT pe.type, pe.entity_name, er.rarity, round(er.percentile, 3) AS pct
FROM public.passport_entries pe
JOIN public.entity_rarity er
  ON er.entity_uuid = pe.entity_uuid AND er.entity_type = pe.type
ORDER BY er.percentile DESC;

SELECT entity_type, rarity, count(*),
       round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY entity_type), 1) AS pct
FROM public.entity_rarity
GROUP BY entity_type, rarity ORDER BY entity_type, rarity;

-- Last step: keep it fresh, or rarity freezes at today and every new artist
-- reads 'common' forever.
-- SELECT cron.schedule('refresh-entity-rarity', '10 8 * * *',
--                      $$SELECT public.refresh_entity_rarity();$$);


-- ========================================================================
-- SOURCE: 13_fix_achievements.sql
-- ========================================================================

-- Achievements: unstarve them. 2026-09-27. REVIEW ONLY, NOT APPLIED.
--
-- SAME ROOT CAUSE AS THE STAMPS. Every branch of check_all_achievements did:
--     FROM public.reviews r INNER JOIN public.events e ON e.id = r.event_id
-- reviews.event_id is always NULL here, and an INNER JOIN on NULL matches zero
-- rows, so v_progress was 0 for genre_curator, genre_specialist,
-- bucket_list_starter, intentional_explorer, festival_attendance and
-- artist_devotee -- six of ten, unconditionally. Measured: 297/300 rows at 0,
-- best progress 1, zero tiers ever earned by anyone.
--
-- Fix: read artist/venue straight off the review. Genres come from
-- artists.genres via reviews.artist_id (events.genres is unreachable without an
-- event_id). Per the genre backfill work, artists.genres has THREE empty states
-- -- NULL, '{}' and the literal 'small artist' -- all excluded below.
--
-- Also applies is_draft = false consistently. The original only filtered drafts
-- on intentional_explorer, so drafts could inflate the other five.
--
-- The remaining four (venue_regular, go_with_friends, new_blood,
-- return_engagement) delegate to get_achievement_progress(), which counts
-- passport_entries. Those unblock once the stamp backfill runs -- but SEE THE
-- NOTE AT THE BOTTOM: that function may carry the same event_id bug.

CREATE OR REPLACE FUNCTION public.check_all_achievements(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_achievement RECORD;
  v_progress INTEGER;
  v_highest_tier TEXT;
  v_metadata JSONB;
BEGIN
  FOR v_achievement IN
    SELECT id, achievement_key, bronze_goal, silver_goal, gold_goal
    FROM public.achievements
    WHERE is_active = true
  LOOP
    v_progress := 0;
    v_highest_tier := NULL;
    v_metadata := '{}'::jsonb;

    CASE v_achievement.achievement_key

      -- Distinct genres across the artists this user reviewed.
      WHEN 'genre_curator' THEN
        SELECT count(DISTINCT g) INTO v_progress
        FROM public.reviews r
        JOIN public.artists a ON a.id = r.artist_id
        CROSS JOIN LATERAL unnest(coalesce(a.genres, ARRAY[]::text[])) AS g
        WHERE r.user_id = p_user_id
          AND r.is_draft = false
          AND (r.was_there = true OR r.review_text IS NOT NULL)
          AND g <> '' AND lower(g) <> 'small artist';

      -- Deepest single genre.
      WHEN 'genre_specialist' THEN
        SELECT coalesce(max(c), 0) INTO v_progress
        FROM (
          SELECT g, count(*) AS c
          FROM public.reviews r
          JOIN public.artists a ON a.id = r.artist_id
          CROSS JOIN LATERAL unnest(coalesce(a.genres, ARRAY[]::text[])) AS g
          WHERE r.user_id = p_user_id
            AND r.is_draft = false
            AND (r.was_there = true OR r.review_text IS NOT NULL)
            AND g <> '' AND lower(g) <> 'small artist'
          GROUP BY g
        ) s;

      -- Reviews whose artist or venue was on the user's bucket list.
      WHEN 'bucket_list_starter' THEN
        SELECT count(*) INTO v_progress
        FROM public.reviews r
        WHERE r.user_id = p_user_id
          AND r.is_draft = false
          AND (r.was_there = true OR r.review_text IS NOT NULL)
          AND EXISTS (
            SELECT 1
            FROM public.bucket_list bl
            JOIN public.entities ent ON ent.id = bl.entity_id
            WHERE bl.user_id = p_user_id
              AND ((ent.entity_type = 'artist' AND ent.entity_uuid = r.artist_id)
                OR (ent.entity_type = 'venue'  AND ent.entity_uuid = r.venue_id))
          );

      -- Most distinct venues seen within a single genre.
      WHEN 'intentional_explorer' THEN
        SELECT coalesce(max(vc), 0) INTO v_progress
        FROM (
          SELECT g, count(DISTINCT r.venue_id) AS vc
          FROM public.reviews r
          JOIN public.artists a ON a.id = r.artist_id
          CROSS JOIN LATERAL unnest(coalesce(a.genres, ARRAY[]::text[])) AS g
          WHERE r.user_id = p_user_id
            AND r.is_draft = false
            AND (r.was_there = true
                 OR (r.review_text IS NOT NULL AND r.review_text <> 'ATTENDANCE_ONLY'))
            AND r.venue_id IS NOT NULL
            AND g <> '' AND lower(g) <> 'small artist'
          GROUP BY g
        ) gv;

      -- Festival-ish venues. e.title is gone with the event join, so this now
      -- matches on venue name only.
      WHEN 'festival_attendance' THEN
        SELECT count(*) INTO v_progress
        FROM public.reviews r
        LEFT JOIN public.venues v ON v.id = r.venue_id
        WHERE r.user_id = p_user_id
          AND r.is_draft = false
          AND (r.was_there = true OR r.review_text IS NOT NULL)
          AND coalesce(v.name, '') ~* '(festival|fest|gathering|fair)';

      -- Most times seeing one artist.
      WHEN 'artist_devotee' THEN
        SELECT coalesce(max(cnt), 0) INTO v_progress
        FROM (
          SELECT count(*) AS cnt
          FROM public.reviews r
          WHERE r.user_id = p_user_id
            AND r.is_draft = false
            AND (r.was_there = true OR r.review_text IS NOT NULL)
            AND r.artist_id IS NOT NULL
          GROUP BY r.artist_id
        ) per_artist;

      WHEN 'venue_regular' THEN
        SELECT current_progress INTO v_progress
        FROM public.get_achievement_progress(p_user_id)
        WHERE achievement_type = 'venue_loyalist' LIMIT 1;

      WHEN 'go_with_friends' THEN
        SELECT current_progress INTO v_progress
        FROM public.get_achievement_progress(p_user_id)
        WHERE achievement_type = 'connector' LIMIT 1;

      ELSE
        SELECT current_progress INTO v_progress
        FROM public.get_achievement_progress(p_user_id)
        WHERE achievement_type = v_achievement.achievement_key LIMIT 1;
    END CASE;

    v_progress := coalesce(v_progress, 0);

    IF v_progress >= v_achievement.gold_goal THEN
      v_highest_tier := 'gold';
    ELSIF v_progress >= v_achievement.silver_goal THEN
      v_highest_tier := 'silver';
    ELSIF v_progress >= v_achievement.bronze_goal THEN
      v_highest_tier := 'bronze';
    END IF;

    INSERT INTO public.user_achievement_progress (
      user_id, achievement_id, current_progress, highest_tier_achieved,
      progress_metadata, updated_at
    )
    VALUES (p_user_id, v_achievement.id, v_progress, v_highest_tier, v_metadata, now())
    ON CONFLICT (user_id, achievement_id)
    DO UPDATE SET
      current_progress      = EXCLUDED.current_progress,
      highest_tier_achieved = EXCLUDED.highest_tier_achieved,
      progress_metadata     = EXCLUDED.progress_metadata,
      updated_at            = now(),
      bronze_achieved_at = CASE
        WHEN EXCLUDED.highest_tier_achieved IN ('bronze','silver','gold')
         AND user_achievement_progress.bronze_achieved_at IS NULL THEN now()
        ELSE user_achievement_progress.bronze_achieved_at END,
      silver_achieved_at = CASE
        WHEN EXCLUDED.highest_tier_achieved IN ('silver','gold')
         AND user_achievement_progress.silver_achieved_at IS NULL THEN now()
        ELSE user_achievement_progress.silver_achieved_at END,
      gold_achieved_at = CASE
        WHEN EXCLUDED.highest_tier_achieved = 'gold'
         AND user_achievement_progress.gold_achieved_at IS NULL THEN now()
        ELSE user_achievement_progress.gold_achieved_at END;
  END LOOP;
END;
$function$;


-- Recompute for everyone who has ever published a review. Calls the function
-- directly; does NOT touch reviews rows, which carry 12 triggers including
-- notification ones.
DO $do$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM public.reviews WHERE is_draft = false
  LOOP
    PERFORM public.check_all_achievements(u);
  END LOOP;
END
$do$;


-- VERIFY -------------------------------------------------------------------
-- Was anything earned at last? Before this, every row was '(none)'.
SELECT coalesce(highest_tier_achieved, '(none)') AS tier,
       count(*) AS rows, count(DISTINCT user_id) AS users
FROM public.user_achievement_progress GROUP BY 1 ORDER BY 1;

-- Per achievement: progress should no longer be uniformly 0.
SELECT a.achievement_key, a.bronze_goal,
       max(p.current_progress) AS best,
       count(*) FILTER (WHERE p.highest_tier_achieved IS NOT NULL) AS earned
FROM public.achievements a
LEFT JOIN public.user_achievement_progress p ON p.achievement_id = a.id
WHERE a.is_active
GROUP BY a.achievement_key, a.bronze_goal, a.sort_order ORDER BY a.sort_order;


-- STILL TO CHECK -----------------------------------------------------------
-- Four achievements (venue_regular, go_with_friends, new_blood,
-- return_engagement) delegate to get_achievement_progress(), which reads BOTH
-- passport_entries and reviews. If it joins events on r.event_id it has the
-- same bug and those four stay at zero no matter what. Send me this:
SELECT pg_get_functiondef(p.oid) AS get_achievement_progress
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_achievement_progress';


-- ========================================================================
-- SOURCE: 14_fix_achievement_progress.sql
-- ========================================================================

-- get_achievement_progress: the last five event_id joins. 2026-09-27.
-- REVIEW ONLY, NOT APPLIED. Run AFTER 13_fix_achievements.sql.
--
-- 13 got tiers flowing (15 earned across 8 users, from zero). These five
-- metrics inside get_achievement_progress are still starved by the same
-- always-NULL reviews.event_id:
--
--   v_emerging_count      first_through_door   INNER JOIN events ON e.id = r.event_id
--   v_out_of_town_count   road_tripper         same
--   v_genre_count         genre_blender        same
--   v_early_events_count  early_adopter        same
--   v_friend_shows_count  connector            r2.event_id = r1.event_id, and
--                                              NULL = NULL is never true
--
-- connector also backs the go_with_friends achievement, so that one stayed at
-- zero after 13. "Same show" now means same artist + same venue + same date,
-- since event_id can no longer identify a show.
--
-- Everything else in this function was already sound: trusted_voice,
-- deep_cut_reviewer, memory_maker and passport_complete never touched events,
-- and the six stamp-counting metrics (venue_hopper, scene_explorer,
-- city_crosser, era_walker, scene_regular, venue_loyalist) unblock from the
-- stamp backfill instead.
--
-- KNOWN REMAINING GAP, not fixed here: passport_entries only ever contains
-- 'artist' and 'venue' rows. The repaired trigger now also writes 'city', but
-- NOTHING writes type 'scene' or type 'era'. So scene_explorer, scene_regular
-- and era_walker will sit at 0 regardless. They need a writer, which is a
-- separate piece of work -- see the note at the bottom.

CREATE OR REPLACE FUNCTION public.get_achievement_progress(p_user_id uuid)
 RETURNS TABLE(achievement_type text, current_progress integer, bronze_goal integer,
               silver_goal integer, gold_goal integer, highest_tier text,
               highest_progress integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venue_count INTEGER := 0;
  v_scene_count INTEGER := 0;
  v_city_count INTEGER := 0;
  v_era_count INTEGER := 0;
  v_emerging_count INTEGER := 0;
  v_saves_count INTEGER := 0;
  v_deep_cut_count INTEGER := 0;
  v_max_scene_events INTEGER := 0;
  v_out_of_town_count INTEGER := 0;
  v_max_venue_events INTEGER := 0;
  v_genre_count INTEGER := 0;
  v_pinned_count INTEGER := 0;
  v_early_events_count INTEGER := 0;
  v_friend_shows_count INTEGER := 0;
  v_achievement_count INTEGER := 0;
  v_home_city TEXT;
  v_join_date TIMESTAMPTZ;
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  -- Stamp-counting metrics: unchanged, they read passport_entries.
  SELECT COUNT(DISTINCT pe.entity_uuid) INTO v_venue_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id AND pe.type = 'venue' AND pe.entity_uuid IS NOT NULL;

  SELECT COUNT(DISTINCT pe.entity_uuid) INTO v_scene_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id AND pe.type = 'scene' AND pe.entity_uuid IS NOT NULL;

  SELECT COUNT(DISTINCT pe.entity_id) INTO v_city_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id AND pe.type = 'city';

  SELECT COUNT(DISTINCT pe.entity_id) INTO v_era_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id AND pe.type = 'era';

  -- FIXED: artist comes off the review. Counts reviews, not event_ids, since
  -- event_id is always NULL and would collapse every row into one group.
  SELECT COUNT(DISTINCT r.id) INTO v_emerging_count
  FROM public.reviews r
  INNER JOIN public.artists a ON a.id = r.artist_id
  WHERE r.user_id = p_user_id
    AND r.is_draft = false
    AND (r.was_there = true OR r.review_text IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.external_entity_ids eei
      WHERE eei.entity_type = 'artist' AND eei.entity_uuid = a.id AND eei.source = 'jambase'
    );

  SELECT COALESCE(SUM(r.shares_count), 0) INTO v_saves_count
  FROM public.reviews r
  WHERE r.user_id = p_user_id AND r.is_public = true;

  SELECT COUNT(DISTINCT r.id) INTO v_deep_cut_count
  FROM public.reviews r
  WHERE r.user_id = p_user_id
    AND r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'
    AND (
      LOWER(r.review_text) LIKE '%opening%' OR LOWER(r.review_text) LIKE '%support%'
      OR LOWER(r.review_text) LIKE '%opener%' OR LOWER(r.review_text) LIKE '%first act%'
      OR LOWER(r.review_text) LIKE '%warm-up%'
    );

  SELECT COALESCE(MAX(scene_events.count), 0) INTO v_max_scene_events
  FROM (
    SELECT pe.entity_uuid, COUNT(*) as count
    FROM public.passport_entries pe
    WHERE pe.user_id = p_user_id AND pe.type = 'scene' AND pe.entity_uuid IS NOT NULL
    GROUP BY pe.entity_uuid
  ) scene_events;

  SELECT pe.entity_id INTO v_home_city
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id AND pe.type = 'city'
  GROUP BY pe.entity_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- FIXED: venue comes off the review.
  IF v_home_city IS NOT NULL THEN
    SELECT COUNT(DISTINCT r.id) INTO v_out_of_town_count
    FROM public.reviews r
    INNER JOIN public.venues v ON v.id = r.venue_id
    WHERE r.user_id = p_user_id
      AND r.is_draft = false
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND LOWER(COALESCE(v.city, '') || '_' || COALESCE(v.state, '')) != LOWER(v_home_city);
  END IF;

  SELECT COALESCE(MAX(venue_events.count), 0) INTO v_max_venue_events
  FROM (
    SELECT pe.entity_uuid, COUNT(*) as count
    FROM public.passport_entries pe
    WHERE pe.user_id = p_user_id AND pe.type = 'venue' AND pe.entity_uuid IS NOT NULL
    GROUP BY pe.entity_uuid
  ) venue_events;

  -- FIXED: genres via reviews.artist_id. artists.genres has three empty states
  -- (NULL, '{}', and the literal 'small artist') -- all excluded.
  SELECT COUNT(DISTINCT genre) INTO v_genre_count
  FROM (
    SELECT UNNEST(a.genres) as genre
    FROM public.reviews r
    INNER JOIN public.artists a ON a.id = r.artist_id
    WHERE r.user_id = p_user_id
      AND r.is_draft = false
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND a.genres IS NOT NULL
  ) genre_list
  WHERE genre <> '' AND LOWER(genre) <> 'small artist';

  SELECT COUNT(*) INTO v_pinned_count
  FROM public.passport_timeline
  WHERE user_id = p_user_id AND is_pinned = true;

  -- FIXED: the events join added nothing here, it only nulled the result.
  SELECT created_at INTO v_join_date FROM auth.users WHERE id = p_user_id;
  IF v_join_date IS NOT NULL THEN
    v_cutoff_date := v_join_date + INTERVAL '30 days';
    SELECT COUNT(DISTINCT r.id) INTO v_early_events_count
    FROM public.reviews r
    WHERE r.user_id = p_user_id
      AND r.is_draft = false
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND r.created_at <= v_cutoff_date AND r.created_at >= v_join_date;
  END IF;

  -- FIXED: "same show" is now same artist + same venue + same date. The old
  -- r2.event_id = r1.event_id could never match, because NULL = NULL is unknown.
  SELECT COUNT(DISTINCT r1.id) INTO v_friend_shows_count
  FROM public.reviews r1
  INNER JOIN public.reviews r2
          ON r2.user_id <> r1.user_id
         AND r2.artist_id IS NOT DISTINCT FROM r1.artist_id
         AND r2.venue_id  IS NOT DISTINCT FROM r1.venue_id
         AND r2."Event_date"::date = r1."Event_date"::date
         AND r2.is_draft = false
         AND (r2.was_there = true OR r2.review_text IS NOT NULL)
  INNER JOIN public.user_relationships ur ON (
    (ur.user_id = r1.user_id AND ur.related_user_id = r2.user_id)
    OR (ur.user_id = r2.user_id AND ur.related_user_id = r1.user_id)
  )
  WHERE r1.user_id = p_user_id
    AND r1.is_draft = false
    AND (r1.was_there = true OR r1.review_text IS NOT NULL)
    AND r1."Event_date" IS NOT NULL
    AND r1.artist_id IS NOT NULL
    AND ur.relationship_type = 'friend'
    AND ur.status = 'accepted';

  SELECT COUNT(DISTINCT uap.achievement_id) INTO v_achievement_count
  FROM public.user_achievement_progress uap
  INNER JOIN public.achievements a ON a.id = uap.achievement_id
  WHERE uap.user_id = p_user_id
    AND uap.highest_tier_achieved IS NOT NULL
    AND a.achievement_key != 'passport_complete';

  RETURN QUERY
  SELECT 'venue_hopper'::TEXT, v_venue_count, 3, 7, 15,
    CASE WHEN v_venue_count >= 15 THEN 'gold' WHEN v_venue_count >= 7 THEN 'silver' WHEN v_venue_count >= 3 THEN 'bronze' ELSE NULL END, v_venue_count
  UNION ALL SELECT 'scene_explorer'::TEXT, v_scene_count, 2, 4, 7,
    CASE WHEN v_scene_count >= 7 THEN 'gold' WHEN v_scene_count >= 4 THEN 'silver' WHEN v_scene_count >= 2 THEN 'bronze' ELSE NULL END, v_scene_count
  UNION ALL SELECT 'city_crosser'::TEXT, v_city_count, 2, 5, 10,
    CASE WHEN v_city_count >= 10 THEN 'gold' WHEN v_city_count >= 5 THEN 'silver' WHEN v_city_count >= 2 THEN 'bronze' ELSE NULL END, v_city_count
  UNION ALL SELECT 'era_walker'::TEXT, v_era_count, 2, 3, 5,
    CASE WHEN v_era_count >= 5 THEN 'gold' WHEN v_era_count >= 3 THEN 'silver' WHEN v_era_count >= 2 THEN 'bronze' ELSE NULL END, v_era_count
  UNION ALL SELECT 'first_through_door'::TEXT, v_emerging_count, 1, 3, 6,
    CASE WHEN v_emerging_count >= 6 THEN 'gold' WHEN v_emerging_count >= 3 THEN 'silver' WHEN v_emerging_count >= 1 THEN 'bronze' ELSE NULL END, v_emerging_count
  UNION ALL SELECT 'trusted_voice'::TEXT, v_saves_count, 3, 10, 25,
    CASE WHEN v_saves_count >= 25 THEN 'gold' WHEN v_saves_count >= 10 THEN 'silver' WHEN v_saves_count >= 3 THEN 'bronze' ELSE NULL END, v_saves_count
  UNION ALL SELECT 'deep_cut_reviewer'::TEXT, v_deep_cut_count, 2, 5, 10,
    CASE WHEN v_deep_cut_count >= 10 THEN 'gold' WHEN v_deep_cut_count >= 5 THEN 'silver' WHEN v_deep_cut_count >= 2 THEN 'bronze' ELSE NULL END, v_deep_cut_count
  UNION ALL SELECT 'scene_regular'::TEXT, v_max_scene_events, 3, 6, 10,
    CASE WHEN v_max_scene_events >= 10 THEN 'gold' WHEN v_max_scene_events >= 6 THEN 'silver' WHEN v_max_scene_events >= 3 THEN 'bronze' ELSE NULL END, v_max_scene_events
  UNION ALL SELECT 'road_tripper'::TEXT, v_out_of_town_count, 1, 3, 6,
    CASE WHEN v_out_of_town_count >= 6 THEN 'gold' WHEN v_out_of_town_count >= 3 THEN 'silver' WHEN v_out_of_town_count >= 1 THEN 'bronze' ELSE NULL END, v_out_of_town_count
  UNION ALL SELECT 'venue_loyalist'::TEXT, v_max_venue_events, 3, 6, 10,
    CASE WHEN v_max_venue_events >= 10 THEN 'gold' WHEN v_max_venue_events >= 6 THEN 'silver' WHEN v_max_venue_events >= 3 THEN 'bronze' ELSE NULL END, v_max_venue_events
  UNION ALL SELECT 'genre_blender'::TEXT, v_genre_count, 2, 4, 6,
    CASE WHEN v_genre_count >= 6 THEN 'gold' WHEN v_genre_count >= 4 THEN 'silver' WHEN v_genre_count >= 2 THEN 'bronze' ELSE NULL END, v_genre_count
  UNION ALL SELECT 'memory_maker'::TEXT, v_pinned_count, 1, 3, 5,
    CASE WHEN v_pinned_count >= 5 THEN 'gold' WHEN v_pinned_count >= 3 THEN 'silver' WHEN v_pinned_count >= 1 THEN 'bronze' ELSE NULL END, v_pinned_count
  UNION ALL SELECT 'early_adopter'::TEXT, v_early_events_count, 1, 3, 5,
    CASE WHEN v_early_events_count >= 5 THEN 'gold' WHEN v_early_events_count >= 3 THEN 'silver' WHEN v_early_events_count >= 1 THEN 'bronze' ELSE NULL END, v_early_events_count
  UNION ALL SELECT 'connector'::TEXT, v_friend_shows_count, 2, 5, 10,
    CASE WHEN v_friend_shows_count >= 10 THEN 'gold' WHEN v_friend_shows_count >= 5 THEN 'silver' WHEN v_friend_shows_count >= 2 THEN 'bronze' ELSE NULL END, v_friend_shows_count
  UNION ALL SELECT 'passport_complete'::TEXT, v_achievement_count, 5, 10, 15,
    CASE WHEN v_achievement_count >= 15 THEN 'gold' WHEN v_achievement_count >= 10 THEN 'silver' WHEN v_achievement_count >= 5 THEN 'bronze' ELSE NULL END, v_achievement_count;
END;
$function$;


-- Recompute everyone again, now that the delegated metrics work.
DO $do$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM public.reviews WHERE is_draft = false
  LOOP
    PERFORM public.check_all_achievements(u);
  END LOOP;
END
$do$;


-- VERIFY -------------------------------------------------------------------
-- Tier counts should rise above 13's result (bronze 8 / silver 3 / gold 4).
SELECT coalesce(highest_tier_achieved, '(none)') AS tier,
       count(*) AS rows, count(DISTINCT user_id) AS users
FROM public.user_achievement_progress GROUP BY 1 ORDER BY 1;

-- Per-metric view straight from the source, for one real user. Anything still
-- at 0 here is either genuinely unearned or has no writer (see below).
SELECT * FROM public.get_achievement_progress(
  (SELECT user_id FROM public.reviews WHERE is_draft = false
   GROUP BY user_id ORDER BY count(*) DESC LIMIT 1)
) ORDER BY achievement_type;


-- SEPARATE WORK, NOT A BUG IN THIS FILE ------------------------------------
-- passport_entries holds only 'artist' and 'venue' rows today; the repaired
-- trigger adds 'city'. Nothing writes 'scene' or 'era', so these three stay at
-- zero until something does:
--     scene_explorer, scene_regular   need type 'scene' stamps
--     era_walker                      needs type 'era' stamps
-- unlock_passport_scene() already exists and is never called. detect_user_eras()
-- exists too. Worth deciding whether scenes/eras are a real feature before
-- wiring them, rather than lighting up three achievements nobody can read.
SELECT type, count(*) FROM public.passport_entries GROUP BY type ORDER BY type;


-- ========================================================================
-- SOURCE: 16_seed_achievement_catalog.sql
-- ========================================================================

-- Make the achievements catalog match the engine. 2026-09-27.
-- REVIEW ONLY, NOT APPLIED. Run after 13 and 14.
--
-- THE PROBLEM. Two half-features that never met:
--   * achievements TABLE: 10 rows. Custom logic in check_all_achievements
--     (repaired in 13), but the client's display map has no entry for any of
--     these keys, so they render with fallback names.
--   * get_achievement_progress(): 15 DIFFERENT keys, each with goals defined,
--     and the client has full name/description/icon for all 15 -- but no table
--     row exists, so a computed tier has nowhere to be stored. That is why
--     genre_blender scored gold and first_through_door silver while the stored
--     tier counts never moved.
--
-- THE FIX. Seed the 15 canonical keys. check_all_achievements already has an
-- ELSE branch that does:
--     get_achievement_progress WHERE achievement_type = v_achievement.achievement_key
-- so once the keys line up, all 15 store and display with zero code changes.
--
-- Goals below are copied from get_achievement_progress verbatim so the stored
-- goal and the computed tier can never disagree.

-- 1. Seed the 15. Idempotent via NOT EXISTS (achievement_key may not be unique).
INSERT INTO public.achievements
  (achievement_key, name, description,
   bronze_requirement, bronze_goal, silver_requirement, silver_goal,
   gold_requirement, gold_goal, category, sort_order, is_active)
SELECT v.k, v.n, v.d, v.br, v.bg, v.sr, v.sg, v.gr, v.gg, v.cat, v.so, true
FROM (VALUES
  ('venue_hopper','Venue Hopper','Play the field across different rooms',
   'Attend shows at 3 different venues',3,'Attend shows at 7 different venues',7,
   'Attend shows at 15 different venues',15,'exploration',11),
  ('city_crosser','City Crosser','See live music beyond your own city',
   'Attend shows in 2 cities',2,'Attend shows in 5 cities',5,
   'Attend shows in 10 cities',10,'exploration',12),
  ('road_tripper','Road Tripper','Travel out of town for a show',
   'See 1 show outside your home city',1,'See 3 shows outside your home city',3,
   'See 6 shows outside your home city',6,'exploration',13),
  ('genre_blender','Genre Blender','Range across musical styles',
   'See shows in 2 genres',2,'See shows in 4 genres',4,
   'See shows in 6 genres',6,'exploration',14),
  ('venue_loyalist','Venue Loyalist','Make one room your own',
   'See 3 shows at one venue',3,'See 6 shows at one venue',6,
   'See 10 shows at one venue',10,'specialization',15),
  ('first_through_door','First Through the Door','Catch artists before the algorithms do',
   'See 1 emerging artist',1,'See 3 emerging artists',3,
   'See 6 emerging artists',6,'discovery',16),
  ('deep_cut_reviewer','Deep Cut Reviewer','Give the opening acts their due',
   'Write about 2 opening acts',2,'Write about 5 opening acts',5,
   'Write about 10 opening acts',10,'community',17),
  ('trusted_voice','Trusted Voice','Reviews others actually share',
   'Have your reviews shared 3 times',3,'Have your reviews shared 10 times',10,
   'Have your reviews shared 25 times',25,'community',18),
  ('connector','Connector','Show up together',
   'See 2 shows alongside a friend',2,'See 5 shows alongside a friend',5,
   'See 10 shows alongside a friend',10,'community',19),
  ('memory_maker','Memory Maker','Pin the nights worth keeping',
   'Pin 1 timeline moment',1,'Pin 3 timeline moments',3,
   'Pin 5 timeline moments',5,'collection',20),
  ('early_adopter','Early Adopter','Hit the ground running',
   'Log 1 show in your first month',1,'Log 3 shows in your first month',3,
   'Log 5 shows in your first month',5,'collection',21),
  ('passport_complete','Passport Complete','Fill the book',
   'Earn 5 other achievements',5,'Earn 10 other achievements',10,
   'Earn 15 other achievements',15,'collection',22),
  -- The three below have NO WRITER yet: nothing creates passport_entries rows of
  -- type 'scene' or 'era'. Seeded inactive so users are not shown goals that
  -- cannot move. Flip is_active once a writer exists.
  ('scene_explorer','Scene Explorer','Move between music scenes',
   'Engage with 2 distinct scenes',2,'Engage with 4 distinct scenes',4,
   'Engage with 7 distinct scenes',7,'exploration',23),
  ('scene_regular','Scene Regular','Become a face in one scene',
   'Attend 3 shows in one scene',3,'Attend 6 shows in one scene',6,
   'Attend 10 shows in one scene',10,'specialization',24),
  ('era_walker','Era Walker','Hear music across eras',
   'See artists from 2 eras',2,'See artists from 3 eras',3,
   'See artists from 5 eras',5,'exploration',25)
) AS v(k,n,d,br,bg,sr,sg,gr,gg,cat,so)
WHERE NOT EXISTS (
  SELECT 1 FROM public.achievements a WHERE a.achievement_key = v.k
);

-- Scene/era have no writer; do not advertise them.
UPDATE public.achievements SET is_active = false, updated_at = now()
WHERE achievement_key IN ('scene_explorer','scene_regular','era_walker');

-- 2. Retire the genuine duplicates. venue_regular delegates to venue_loyalist
--    and go_with_friends to connector, so keeping both double-counts the same
--    behaviour under two names.
UPDATE public.achievements SET is_active = false, updated_at = now()
WHERE achievement_key IN ('venue_regular','go_with_friends');

-- 3. Retire the two that cannot ever compute. Both fall to the ELSE branch and
--    look up an achievement_type get_achievement_progress never returns, so
--    they are structurally pinned at 0.
UPDATE public.achievements SET is_active = false, updated_at = now()
WHERE achievement_key IN ('new_blood','return_engagement');

-- 4. Recompute for everyone.
DO $do$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM public.reviews WHERE is_draft = false
  LOOP
    PERFORM public.check_all_achievements(u);
  END LOOP;
END
$do$;

-- 5. Keep rarity fresh. 07:40 is artist-genre-propagation and 08:10 is
--    genre-idf-refresh, so 08:25. Without this every newly stamped artist has
--    no entity_rarity row and the view reports 'common' -- the exact bug this
--    whole exercise started from.
SELECT cron.schedule('refresh-entity-rarity', '25 8 * * *',
                     $$SELECT public.refresh_entity_rarity();$$);


-- VERIFY -------------------------------------------------------------------
-- A. Active catalog. Expect 18 active (6 original custom + 12 new), with
--    scene/era and the 4 retired ones inactive.
SELECT achievement_key, bronze_goal, silver_goal, gold_goal, is_active
FROM public.achievements ORDER BY is_active DESC, sort_order;

-- B. THE test: tiers should jump well past bronze 8 / silver 3 / gold 4.
SELECT coalesce(highest_tier_achieved,'(none)') AS tier,
       count(*) AS rows, count(DISTINCT user_id) AS users
FROM public.user_achievement_progress GROUP BY 1 ORDER BY 1;

-- C. Per achievement, so nothing is silently stuck.
SELECT a.achievement_key, a.bronze_goal,
       max(p.current_progress) AS best,
       count(*) FILTER (WHERE p.highest_tier_achieved IS NOT NULL) AS earned
FROM public.achievements a
LEFT JOIN public.user_achievement_progress p ON p.achievement_id = a.id
WHERE a.is_active
GROUP BY a.achievement_key, a.bronze_goal, a.sort_order ORDER BY a.sort_order;

-- D. Confirm the rarity job is scheduled and active.
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'refresh-entity-rarity';


-- ========================================================================
-- SOURCE: 20_ddl_only.sql
-- ========================================================================

-- STEP 1 of 2: DDL ONLY. Run this whole file by itself. 2026-09-27.
--
-- WHY THIS FILE EXISTS. The Supabase SQL editor runs a selection as ONE
-- transaction. Files 18 and 19 each ended with the backfill, so when the
-- backfill raised, the rollback also undid the DROP TRIGGER and the function
-- replacements at the top of those files -- which is why the same
-- "record new has no field is_draft" error came back after 18 appeared to work.
--
-- So: all schema changes here, nothing that can fail. Run 21_run_backfill.sql
-- afterwards, separately.
--
-- Everything below is idempotent and safe to re-run.

-- 1. The passport_entries scene trigger. auto_update_scene_progress() reads
--    NEW.is_draft / NEW.event_id / NEW.artist_id -- all `reviews` columns -- so
--    on passport_entries it raises 42703 and blocks every stamp insert. It is
--    also redundant: the review that creates a stamp already fires
--    trigger_auto_update_scene_progress_review for the same artist/venue.
DROP TRIGGER IF EXISTS trigger_auto_update_scene_progress_passport
  ON public.passport_entries;

-- 2. Guard the function so re-attaching it anywhere fails safe rather than
--    blocking that table's writes. Body otherwise byte-identical.
CREATE OR REPLACE FUNCTION public.auto_update_scene_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_scene_ids UUID[];
  v_artist_venue_ids RECORD;
BEGIN
  IF TG_TABLE_NAME <> 'reviews' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'DELETE') THEN
    SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
    FROM public.scene_participants sp
    WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
    AND (
      (sp.participant_type = 'artist' AND sp.artist_id IS NOT NULL AND (
        (OLD.event_id IS NOT NULL AND sp.artist_id IN (SELECT e.artist_id FROM public.events e WHERE e.id = OLD.event_id))
        OR (OLD.event_id IS NULL AND sp.artist_id = COALESCE(OLD.artist_id, OLD.user_created_artist_id))
      )) OR
      (sp.participant_type = 'venue' AND sp.venue_id IS NOT NULL AND (
        (OLD.event_id IS NOT NULL AND sp.venue_id IN (SELECT e.venue_id FROM public.events e WHERE e.id = OLD.event_id))
        OR (OLD.event_id IS NULL AND sp.venue_id = OLD.venue_id)
      ))
    );
  ELSIF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_draft = false THEN
    IF NEW.event_id IS NOT NULL THEN
      SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
      FROM public.scene_participants sp
      JOIN public.events e ON e.id = NEW.event_id
      WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
      AND (
        (sp.participant_type = 'artist' AND sp.artist_id IS NOT NULL AND sp.artist_id = e.artist_id) OR
        (sp.participant_type = 'venue' AND sp.venue_id IS NOT NULL AND sp.venue_id = e.venue_id) OR
        (sp.participant_type = 'city' AND e.venue_city = sp.text_value) OR
        (sp.participant_type = 'genre' AND e.genres IS NOT NULL AND e.genres @> ARRAY[sp.text_value])
      );
    ELSE
      SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
      FROM public.scene_participants sp
      WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
      AND (
        (sp.participant_type = 'artist' AND sp.artist_id IS NOT NULL AND sp.artist_id = COALESCE(NEW.artist_id, NEW.user_created_artist_id)) OR
        (sp.participant_type = 'venue' AND sp.venue_id IS NOT NULL AND sp.venue_id = NEW.venue_id)
      );
    END IF;
  END IF;

  IF v_scene_ids IS NOT NULL AND array_length(v_scene_ids, 1) > 0 THEN
    PERFORM public.calculate_scene_progress(v_user_id, unnest_scene_id)
    FROM UNNEST(v_scene_ids) AS unnest_scene_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3. unlock_passport_city: ON CONFLICT (user_id, type, entity_id) referenced a
--    unique constraint that does not exist, so this raised 42P10 on every call
--    and no 'city' stamp has ever been written. Now check-then-insert, matching
--    what unlock_passport_artist / unlock_passport_venue already do.
--    ponytail: check-then-insert can race; worst case is a duplicate stamp, the
--    same trade the artist/venue functions already make.
CREATE OR REPLACE FUNCTION public.unlock_passport_city(
  p_user_id uuid, p_city_name text, p_state text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_entry_id UUID;
  v_entity_id TEXT;
BEGIN
  IF p_city_name IS NULL OR trim(p_city_name) = '' THEN
    RETURN NULL;
  END IF;

  v_entity_id := LOWER(COALESCE(p_city_name, '') || COALESCE('_' || p_state, ''));

  SELECT id INTO v_entry_id
  FROM public.passport_entries
  WHERE user_id = p_user_id AND type = 'city' AND entity_id = v_entity_id;

  IF v_entry_id IS NULL THEN
    INSERT INTO public.passport_entries (user_id, type, entity_id, entity_name, metadata)
    VALUES (p_user_id, 'city', v_entity_id,
            COALESCE(p_city_name, 'Unknown City'),
            jsonb_build_object('state', p_state))
    RETURNING id INTO v_entry_id;
  END IF;

  RETURN v_entry_id;
END;
$function$;

-- 4. Same defect, same fix, for scenes.
CREATE OR REPLACE FUNCTION public.unlock_passport_scene(
  p_user_id uuid, p_scene_id text, p_scene_name text,
  p_scene_description text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_entry_id UUID;
BEGIN
  IF p_scene_id IS NULL OR trim(p_scene_id) = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_entry_id
  FROM public.passport_entries
  WHERE user_id = p_user_id AND type = 'scene' AND entity_id = p_scene_id;

  IF v_entry_id IS NULL THEN
    INSERT INTO public.passport_entries (user_id, type, entity_id, entity_name, metadata)
    VALUES (p_user_id, 'scene', p_scene_id, p_scene_name,
            jsonb_build_object('description', p_scene_description))
    RETURNING id INTO v_entry_id;
  END IF;

  RETURN v_entry_id;
END;
$function$;


-- CONFIRM THE DDL STUCK ----------------------------------------------------
-- All three must be true before running 21. If any is false the transaction
-- rolled back again and nothing below it applied.
SELECT
  NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND c.relname = 'passport_entries'
      AND t.tgname = 'trigger_auto_update_scene_progress_passport'
  ) AS scene_trigger_dropped,
  (SELECT p.prosrc ILIKE '%TG_TABLE_NAME%' FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'auto_update_scene_progress'
  ) AS scene_function_guarded,
  (SELECT p.prosrc NOT ILIKE '%ON CONFLICT%' FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'unlock_passport_city'
  ) AS city_function_fixed;
