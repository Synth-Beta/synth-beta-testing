-- Where are we? Run PART 1 alone first. 2026-09-25.

-- ── PART 1: state check (read-only) ──────────────────────────────────────
-- Expect all four to be 'yes' before running PART 2.
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='auto_unlock_passport_on_review'
      AND p.prosrc LIKE '%NEW.artist_id%') > 0            AS trigger_fixed_03,
  to_regclass('public.entity_rarity') IS NOT NULL          AS rarity_table_04,
  to_regclass('public.passport_entries_with_rarity') IS NOT NULL AS view_04,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='backfill_passport_stamps') > 0 AS backfill_fn_05;

-- Current stamp state (baseline to compare against after PART 2).
SELECT type, rarity, count(*) AS stamps, count(DISTINCT user_id) AS users
FROM public.passport_entries GROUP BY type, rarity ORDER BY type, rarity;


-- ── PART 2: actually do it. Only if PART 1 shows all four true. ─────────
-- Run these three, in order, one at a time.

-- 2a. Create the missing stamps. Returns before/after counts.
--     Expect stamps_after around 90-130, up from 19.
SELECT * FROM public.backfill_passport_stamps();

-- 2b. Recompute rarity so the new stamps are not all 'common'.
SELECT public.refresh_entity_rarity();

-- 2c. Recompute achievements for users who just gained stamps.
SELECT * FROM public.recalculate_all_passport_data();


-- ── PART 3: did it work? ────────────────────────────────────────────────
-- A: stamps per type/rarity THROUGH THE VIEW. This is what the app shows.
--    Success = more than one rarity value appears.
SELECT type, rarity, count(*) AS stamps, count(DISTINCT user_id) AS users
FROM public.passport_entries_with_rarity
GROUP BY type, rarity ORDER BY type, rarity;

-- B: users with stamps should now be 8, not 3.
SELECT count(DISTINCT user_id) AS users_with_stamps FROM public.passport_entries;

-- C: the rarity catalog itself — is the percentile split sane?
--    Rough expectation: ~2% legendary, ~13% uncommon, rest common.
SELECT entity_type, rarity, count(*),
       round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY entity_type), 1) AS pct
FROM public.entity_rarity
GROUP BY entity_type, rarity ORDER BY entity_type, rarity;

-- D: eyeball the extremes. Do these names feel right?
(SELECT 'rarest' AS end, a.name, er.rarity, er.percentile
 FROM public.entity_rarity er JOIN public.artists a ON a.id = er.entity_uuid
 WHERE er.entity_type='artist'
   AND er.entity_uuid IN (SELECT entity_uuid FROM public.passport_entries WHERE type='artist')
 ORDER BY er.percentile ASC LIMIT 5)
UNION ALL
(SELECT 'most common', a.name, er.rarity, er.percentile
 FROM public.entity_rarity er JOIN public.artists a ON a.id = er.entity_uuid
 WHERE er.entity_type='artist'
   AND er.entity_uuid IN (SELECT entity_uuid FROM public.passport_entries WHERE type='artist')
 ORDER BY er.percentile DESC LIMIT 5);
