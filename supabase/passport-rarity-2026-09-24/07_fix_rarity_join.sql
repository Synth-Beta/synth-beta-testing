-- Stamps still show 'common' — repair the join key. 2026-09-25.
-- REVIEW ONLY. Run PART 1 first.
--
-- passport_entries_with_rarity joins entity_rarity ON entity_uuid. The OLD
-- trigger called unlock_passport_venue(user_id, venue_id::uuid, name), which
-- resolves to the UUID overload — and that overload writes entity_id only,
-- never entity_uuid. Those rows therefore cannot match, and the view's
-- coalesce() reports them as 'common'.
--
-- (The artist path used ::TEXT, so artist stamps should already carry
-- entity_uuid. PART 1 confirms which types are affected.)

-- ── PART 1: diagnose (read-only) ─────────────────────────────────────────
-- Is the rarity data even there?
SELECT to_regclass('public.entity_rarity')                  IS NOT NULL AS table_exists,
       to_regclass('public.passport_entries_with_rarity')   IS NOT NULL AS view_exists,
       (SELECT count(*) FROM public.entity_rarity)                      AS rarity_rows;

-- THE likely culprit: stamps with no join key.
SELECT type,
       count(*)                                        AS stamps,
       count(*) FILTER (WHERE entity_uuid IS NULL)     AS missing_entity_uuid,
       count(*) FILTER (WHERE entity_uuid IS NOT NULL) AS has_entity_uuid
FROM public.passport_entries
GROUP BY type ORDER BY type;

-- Of the stamps that DO have a uuid, does a rarity row exist for it?
SELECT pe.type,
       count(*)                            AS with_uuid,
       count(er.entity_uuid)               AS matched_in_entity_rarity
FROM public.passport_entries pe
LEFT JOIN public.entity_rarity er
       ON er.entity_uuid = pe.entity_uuid AND er.entity_type = pe.type
WHERE pe.entity_uuid IS NOT NULL
GROUP BY pe.type ORDER BY pe.type;


-- ── PART 2: repair. Run after PART 1 shows missing_entity_uuid > 0. ──────
-- entity_id holds the uuid as text for rows the uuid overload created, so
-- recover the key from it. Also tries identifier, then exact name.

UPDATE public.passport_entries pe
SET entity_uuid = v.id
FROM public.venues v
WHERE pe.type = 'venue' AND pe.entity_uuid IS NULL
  AND pe.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND v.id = pe.entity_id::uuid;

UPDATE public.passport_entries pe
SET entity_uuid = v.id
FROM public.venues v
WHERE pe.type = 'venue' AND pe.entity_uuid IS NULL
  AND v.identifier = pe.entity_id;

UPDATE public.passport_entries pe
SET entity_uuid = v.id
FROM public.venues v
WHERE pe.type = 'venue' AND pe.entity_uuid IS NULL
  AND lower(v.name) = lower(pe.entity_name);

-- Same three passes for artists, in case any row took the fallback path.
UPDATE public.passport_entries pe
SET entity_uuid = a.id
FROM public.artists a
WHERE pe.type = 'artist' AND pe.entity_uuid IS NULL
  AND pe.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND a.id = pe.entity_id::uuid;

UPDATE public.passport_entries pe
SET entity_uuid = a.id
FROM public.artists a
WHERE pe.type = 'artist' AND pe.entity_uuid IS NULL
  AND a.identifier = pe.entity_id;

UPDATE public.passport_entries pe
SET entity_uuid = a.id
FROM public.artists a
WHERE pe.type = 'artist' AND pe.entity_uuid IS NULL
  AND lower(a.name) = lower(pe.entity_name);

-- Make sure rarity is actually computed (safe to re-run).
SELECT public.refresh_entity_rarity();


-- ── PART 3: verify ──────────────────────────────────────────────────────
-- Success = more than one rarity value here. city/scene stamps stay 'common'
-- (they have no entity_uuid by design) — that is expected, not a failure.
SELECT type, rarity, count(*) AS stamps
FROM public.passport_entries_with_rarity
GROUP BY type, rarity ORDER BY type, rarity;

-- Anything still unmatched after the repair?
SELECT type, entity_id, entity_name
FROM public.passport_entries
WHERE entity_uuid IS NULL AND type IN ('artist', 'venue');


-- ── PART 4: stop it recurring ───────────────────────────────────────────
-- The uuid overload is the trap: same call site, different write shape, and
-- Postgres picks it silently when passed a uuid. 03_fix_stamp_trigger.sql now
-- casts ::text, so nothing should call it. Confirm, then drop it.
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.prosrc ILIKE '%unlock_passport_venue(%';
--
-- DROP FUNCTION IF EXISTS public.unlock_passport_venue(uuid, uuid, text);
