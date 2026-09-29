-- STEP 2 of 2: the data work. Run ONLY after 20_ddl_only.sql reports all three
-- columns true. 2026-09-27.
--
-- Kept separate from the DDL on purpose: the SQL editor runs a selection as one
-- transaction, so a failure here would roll back the schema fixes if they shared
-- a file. That is exactly what silently undid file 18.
--
-- Run these ONE AT A TIME so a failure in a later step cannot discard an
-- earlier one. Each is idempotent.

-- 1. Create the missing stamps for 55 published reviews across 8 users.
--    Returns reviews_processed / stamps_before / stamps_after.
SELECT * FROM public.backfill_passport_stamps();

-- 2. Rarity for anything newly stamped.
SELECT public.refresh_entity_rarity();

-- 3. Achievements that count stamps -- city_crosser, road_tripper, venue_hopper,
--    venue_loyalist -- can finally move.
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
-- A. 'city' should appear for the first time in the app's history; artist and
--    venue rise from 10 / 9.
SELECT type, count(*) AS stamps, count(DISTINCT user_id) AS users
FROM public.passport_entries GROUP BY type ORDER BY type;

-- B. Users with stamps: 3 -> 8.
SELECT count(DISTINCT user_id) AS users_with_stamps FROM public.passport_entries;

-- C. Rarity spread. 'city' rows have no entity_uuid, so they read 'common' by
--    design -- that is correct, not a regression.
SELECT type, rarity, count(*) AS stamps
FROM public.passport_entries_with_rarity
GROUP BY type, rarity ORDER BY type, rarity;

-- D. city_crosser and road_tripper should leave zero.
SELECT a.achievement_key, a.bronze_goal,
       max(p.current_progress) AS best,
       count(*) FILTER (WHERE p.highest_tier_achieved IS NOT NULL) AS earned
FROM public.achievements a
LEFT JOIN public.user_achievement_progress p ON p.achievement_id = a.id
WHERE a.is_active
GROUP BY a.achievement_key, a.bronze_goal, a.sort_order ORDER BY a.sort_order;

-- E. Tiers, against the current bronze 19 / silver 4 / gold 9.
SELECT coalesce(highest_tier_achieved,'(none)') AS tier,
       count(*) AS rows, count(DISTINCT user_id) AS users
FROM public.user_achievement_progress GROUP BY 1 ORDER BY 1;
