-- =============================================================================
-- 02 — Repoint foreign keys from duplicate venues to their canonical
-- =============================================================================
-- Moves every reference off a duplicate venue and onto the canonical one. NO rows
-- are deleted here except redundant follows that would collide with a follow the
-- user ALREADY has on the canonical (explained below). Run 01 first.
--
-- The 5 tables that reference venues.id (confirmed via pg_constraint):
--   events.venue_id (RESTRICT), reviews.venue_id (NO ACTION),
--   event_media.venue_id (NO ACTION), user_venue_relationships.venue_id (CASCADE),
--   scene_participants.venue_id (CASCADE).
-- Only user_venue_relationships has UNIQUE(user_id, venue_id) — the one that can
-- collide on repoint; handled explicitly. The rest just UPDATE.
-- =============================================================================

-- HEAVY (480K-row updates): if the web SQL editor times out, run this over a
-- direct psql connection instead (see README). Raise the timeout either way:
SET statement_timeout = '900s';

-- Optional but recommended: wrap this file in a transaction so it's all-or-nothing.
BEGIN;

-- --- events ---------------------------------------------------------------
UPDATE public.events e
SET venue_id = m.canonical_id
FROM public.venue_dedup_map m
WHERE e.venue_id = m.duplicate_id;

-- --- reviews --------------------------------------------------------------
UPDATE public.reviews r
SET venue_id = m.canonical_id
FROM public.venue_dedup_map m
WHERE r.venue_id = m.duplicate_id;

-- --- event_media ----------------------------------------------------------
UPDATE public.event_media em
SET venue_id = m.canonical_id
FROM public.venue_dedup_map m
WHERE em.venue_id = m.duplicate_id;

-- --- scene_participants (no unique on scene+venue, plain repoint) ----------
UPDATE public.scene_participants sp
SET venue_id = m.canonical_id
FROM public.venue_dedup_map m
WHERE sp.venue_id = m.duplicate_id;

-- --- user_venue_relationships: UNIQUE(user_id, venue_id) => collision-safe --
-- Step A: drop follows on a duplicate where the user ALREADY follows the
--         canonical (repointing them would violate the unique constraint; the
--         user's follow of that venue is preserved via the canonical row).
DELETE FROM public.user_venue_relationships uvr
USING public.venue_dedup_map m
WHERE uvr.venue_id = m.duplicate_id
  AND EXISTS (
    SELECT 1 FROM public.user_venue_relationships keep
    WHERE keep.user_id = uvr.user_id AND keep.venue_id = m.canonical_id
  );

-- Step B: repoint the remaining (non-colliding) follows.
UPDATE public.user_venue_relationships uvr
SET venue_id = m.canonical_id
FROM public.venue_dedup_map m
WHERE uvr.venue_id = m.duplicate_id;

-- -----------------------------------------------------------------------------
-- VERIFY (run inside the transaction, before COMMIT): all should be 0.
-- -----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.events e            JOIN public.venue_dedup_map m ON e.venue_id  = m.duplicate_id) AS events_left,
  (SELECT count(*) FROM public.reviews r           JOIN public.venue_dedup_map m ON r.venue_id  = m.duplicate_id) AS reviews_left,
  (SELECT count(*) FROM public.event_media em      JOIN public.venue_dedup_map m ON em.venue_id = m.duplicate_id) AS media_left,
  (SELECT count(*) FROM public.scene_participants sp JOIN public.venue_dedup_map m ON sp.venue_id = m.duplicate_id) AS scenes_left,
  (SELECT count(*) FROM public.user_venue_relationships uvr JOIN public.venue_dedup_map m ON uvr.venue_id = m.duplicate_id) AS follows_left;

-- If every column above is 0, COMMIT. Otherwise ROLLBACK and investigate.
COMMIT;
-- ROLLBACK;   -- <- use this instead of COMMIT if the verify row wasn't all zeros
