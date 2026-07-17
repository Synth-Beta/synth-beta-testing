-- =============================================================================
-- 02 — Repoint references from duplicate events onto their canonical
-- =============================================================================
-- Moves every dependent row off a duplicate event and onto the canonical. This
-- is REQUIRED before delete: reviews/interests/media/reminders/genres all CASCADE
-- on event delete, so without repointing first, deleting a dup would destroy them.
-- Only ~15 interests actually attach to dups today (0 reviews/media/shares), so
-- this is tiny — but written to be complete and collision-safe.
--
-- Small operation (~6.8K dup rows). Run each statement; no transaction wrapper
-- needed. events_genres is NOT repointed — it cascades on delete and the canonical
-- already has its own genres.
-- =============================================================================
SET statement_timeout = '900s';

-- user_event_relationships — PK (user_id, event_id): drop the collision, then move
DELETE FROM public.user_event_relationships u
USING public.event_dedup_map m
WHERE u.event_id = m.duplicate_id
  AND EXISTS (SELECT 1 FROM public.user_event_relationships k
              WHERE k.user_id = u.user_id AND k.event_id = m.canonical_id);
UPDATE public.user_event_relationships u
SET event_id = m.canonical_id
FROM public.event_dedup_map m
WHERE u.event_id = m.duplicate_id;

-- reviews — UNIQUE (user_id, event_id): same collision-safe pattern (0 rows today)
DELETE FROM public.reviews r
USING public.event_dedup_map m
WHERE r.event_id = m.duplicate_id
  AND EXISTS (SELECT 1 FROM public.reviews k
              WHERE k.user_id = r.user_id AND k.event_id = m.canonical_id);
UPDATE public.reviews r
SET event_id = m.canonical_id
FROM public.event_dedup_map m
WHERE r.event_id = m.duplicate_id;

-- event_media — no unique on event_id: plain repoint
UPDATE public.event_media em
SET event_id = m.canonical_id
FROM public.event_dedup_map m
WHERE em.event_id = m.duplicate_id;

-- event_reminders_sent — plain repoint
UPDATE public.event_reminders_sent s
SET event_id = m.canonical_id
FROM public.event_dedup_map m
WHERE s.event_id = m.duplicate_id;

-- messages.shared_event_id — NO ACTION FK: plain repoint
UPDATE public.messages ms
SET shared_event_id = m.canonical_id
FROM public.event_dedup_map m
WHERE ms.shared_event_id = m.duplicate_id;

-- ---------------------------------------------------------------------------
-- VERIFY — all must be 0 before running 03
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.reviews r                 JOIN public.event_dedup_map m ON r.event_id=m.duplicate_id)  AS reviews_left,
  (SELECT count(*) FROM public.user_event_relationships u JOIN public.event_dedup_map m ON u.event_id=m.duplicate_id) AS interests_left,
  (SELECT count(*) FROM public.event_media em            JOIN public.event_dedup_map m ON em.event_id=m.duplicate_id) AS media_left,
  (SELECT count(*) FROM public.event_reminders_sent s    JOIN public.event_dedup_map m ON s.event_id=m.duplicate_id)  AS reminders_left,
  (SELECT count(*) FROM public.messages ms               JOIN public.event_dedup_map m ON ms.shared_event_id=m.duplicate_id) AS shares_left;
