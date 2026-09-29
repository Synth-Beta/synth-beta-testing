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
