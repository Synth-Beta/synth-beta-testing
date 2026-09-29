-- City and scene stamps have never worked. 2026-09-27. REVIEW ONLY.
--
--   ERROR 42P10: there is no unique or exclusion constraint matching the
--   ON CONFLICT specification
--   ... unlock_passport_city() line 10
--
-- unlock_passport_city and unlock_passport_scene both do
--     ON CONFLICT (user_id, type, entity_id) DO NOTHING
-- but no unique constraint on that triple exists. So both have raised on every
-- call since they were written -- which is why passport_entries has never held a
-- single 'city' or 'scene' row, and why city_crosser / road_tripper read 0.
--
-- unlock_passport_artist and unlock_passport_venue (the TEXT overload) already
-- dodge this: they SELECT first and INSERT only if absent, with a comment about
-- the partial unique index on entity_uuid. City and scene were written against a
-- constraint nobody created.
--
-- FIX: match the proven pattern -- check, then insert. Chosen over adding the
-- missing unique index because the index could fail on pre-existing duplicate
-- (user_id, type, entity_id) rows, and because entity_id is NULLABLE, so a
-- plain unique index would not constrain NULL rows anyway.
--
-- ponytail: check-then-insert races under true concurrency (two simultaneous
-- inserts could both miss). Worst case is a duplicate stamp, and the artist /
-- venue functions already accept the same trade. Add a real unique index if
-- duplicates ever show up in practice.

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
    VALUES (
      p_user_id,
      'city',
      v_entity_id,
      COALESCE(p_city_name, 'Unknown City'),
      jsonb_build_object('state', p_state)
    )
    RETURNING id INTO v_entry_id;
  END IF;

  RETURN v_entry_id;
END;
$function$;


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
    VALUES (
      p_user_id,
      'scene',
      p_scene_id,
      p_scene_name,
      jsonb_build_object('description', p_scene_description)
    )
    RETURNING id INTO v_entry_id;
  END IF;

  RETURN v_entry_id;
END;
$function$;


-- Now run the whole chain. Every step is idempotent.
SELECT * FROM public.backfill_passport_stamps();
SELECT public.refresh_entity_rarity();

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
-- A. 'city' should appear for the first time ever; artist/venue rise from 10/9.
SELECT type, count(*) AS stamps, count(DISTINCT user_id) AS users
FROM public.passport_entries GROUP BY type ORDER BY type;

-- B. Users with stamps: 3 -> 8.
SELECT count(DISTINCT user_id) AS users_with_stamps FROM public.passport_entries;

-- C. Rarity across the larger set. city rows have no entity_uuid so they read
--    'common' by design.
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

-- E. Tiers, against bronze 19 / silver 4 / gold 9.
SELECT coalesce(highest_tier_achieved,'(none)') AS tier,
       count(*) AS rows, count(DISTINCT user_id) AS users
FROM public.user_achievement_progress GROUP BY 1 ORDER BY 1;
