-- ============================================================================
-- 02 — Clear the "Blues/Classical/Country/Electronic/Folk" placeholder genres.
-- ============================================================================
--
-- WHAT THIS IS
-- ------------
-- 918 artists carry the byte-identical genre array
--     ARRAY['Blues','Classical','Country','Electronic','Folk']
-- which is simply the first five entries of an alphabetical genre list applied
-- wholesale. It is on acts it cannot possibly describe -- "Czech Symphony
-- Orchestra Prague" is tagged Blues/Country/Electronic, a house DJ is tagged
-- Classical/Folk. It is a placeholder, not data.
--
-- These are REAL artists, not junk rows and not duplicates: all 918 have a
-- jambase: identifier and url, 691 have images, 586 have upcoming events, and
-- only ONE name appears twice across the whole set. (An earlier read of this
-- data suggested ~45% duplication; that was an artefact of paginating without
-- an ORDER BY and is not true -- table-wide artist duplication is 0.1% and
-- there are zero duplicate JamBase identifiers.) So: keep every row, drop only
-- the bad genre values.
--
-- Every one was created in the 2025-12 / 2026-01 import window and every one
-- has genre_lookup_attempted_at IS NULL, i.e. the current enrichment pipeline
-- (scripts/enrich-artist-genres.mjs) has never touched them. Nulling their
-- genres puts them back in that pipeline's work queue.
--
-- It spreads to events through eventGenresFromArtistIfEmpty() in
-- scripts/sync-jambase-incremental-3nf.mjs, which copies artist genres onto any
-- event with none -- so 3,319 events inherited it, which is how a symphony
-- orchestra ends up in the EDM chat's "Upcoming Shows".
--
-- WHY IT MATTERS BEYOND THE CHATS
-- -------------------------------
-- Because these rows are Title Case they are the only event tags that collide
-- with the Title Case keys in user_preferences.genre_preference_scores. Until
-- 01_ lands, they are literally the only events genre personalisation can see.
-- Clearing them without 01_ would take genre scoring from "wrong" to "zero", so
-- APPLY 01 FIRST, or apply both together.
--
-- ORDERING
--   01 -> 02 -> re-run scripts/enrich-artist-genres.mjs -> 03 -> 04
-- 03 (backfill events from artists) only helps these particular events once
-- enrichment has given their artists real genres again, so do not expect 02 to
-- immediately repopulate them -- it deliberately leaves them empty until a real
-- value is known. Empty is honest; a symphony tagged "Electronic" is not.

BEGIN;

-- ── Backup (audit trail, mirrors the venue/event dedup convention) ──────────
CREATE TABLE IF NOT EXISTS public.genre_placeholder_backup_20260820 (
  entity_kind text    NOT NULL,       -- 'artist' | 'event'
  entity_id   uuid    NOT NULL,
  name        text,
  genres      text[],
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_kind, entity_id)
);

INSERT INTO public.genre_placeholder_backup_20260820 (entity_kind, entity_id, name, genres)
SELECT 'artist', a.id, a.name, a.genres
FROM public.artists a
WHERE a.genres @> ARRAY['Blues','Classical','Country','Electronic','Folk']::text[]
ON CONFLICT (entity_kind, entity_id) DO NOTHING;

INSERT INTO public.genre_placeholder_backup_20260820 (entity_kind, entity_id, name, genres)
SELECT 'event', e.id, e.title, e.genres
FROM public.events e
WHERE e.genres @> ARRAY['Blues','Classical','Country','Electronic','Folk']::text[]
ON CONFLICT (entity_kind, entity_id) DO NOTHING;

-- ── Clear on artists, and re-queue them for enrichment ─────────────────────
UPDATE public.artists a
SET genres                    = NULL,
    genre_lookup_attempted_at = NULL,
    updated_at                = now()
WHERE a.genres @> ARRAY['Blues','Classical','Country','Electronic','Folk']::text[];

-- ── Clear on events ────────────────────────────────────────────────────────
-- Only the placeholder set is removed. If an event carried extra, real tags
-- alongside the placeholder they are preserved; the array is emptied only when
-- nothing real remains.
UPDATE public.events e
SET genres     = NULLIF(
                   ARRAY(
                     SELECT g FROM unnest(e.genres) AS g
                     WHERE g <> ALL (ARRAY['Blues','Classical','Country','Electronic','Folk']::text[])
                   ),
                   ARRAY[]::text[]
                 ),
    updated_at = now()
WHERE e.genres @> ARRAY['Blues','Classical','Country','Electronic','Folk']::text[];

-- ── Drop the mirrored rows in the normalised join table ────────────────────
-- events_genres inherited the placeholder too (verified live: an affected event
-- resolves to slugs country/classical/electronic/blues/folk). Remove only the
-- join rows that came from the placeholder, for events we just cleaned.
DELETE FROM public.events_genres eg
USING public.genres g, public.genre_placeholder_backup_20260820 b
WHERE eg.genre_id = g.id
  AND b.entity_kind = 'event'
  AND b.entity_id   = eg.event_id
  AND g.slug IN ('blues','classical','country','electronic','folk');

DELETE FROM public.artists_genres ag
USING public.genres g, public.genre_placeholder_backup_20260820 b
WHERE ag.genre_id = g.id
  AND b.entity_kind = 'artist'
  AND b.entity_id   = ag.artist_id
  AND g.slug IN ('blues','classical','country','electronic','folk');

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- Expect 0 / 0, and a backup row count of roughly 918 + 3319.
--
-- SELECT count(*) AS artists_still_placeholder FROM public.artists
--  WHERE genres @> ARRAY['Blues','Classical','Country','Electronic','Folk']::text[];
-- SELECT count(*) AS events_still_placeholder FROM public.events
--  WHERE genres @> ARRAY['Blues','Classical','Country','Electronic','Folk']::text[];
-- SELECT entity_kind, count(*) FROM public.genre_placeholder_backup_20260820 GROUP BY 1;
--
-- Artists now queued for enrichment (expect ~918 more than before):
-- SELECT count(*) FROM public.artists
--  WHERE (genres IS NULL OR cardinality(genres) = 0) AND genre_lookup_attempted_at IS NULL;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- UPDATE public.artists a SET genres = b.genres
-- FROM public.genre_placeholder_backup_20260820 b
-- WHERE b.entity_kind = 'artist' AND b.entity_id = a.id;
-- UPDATE public.events e SET genres = b.genres
-- FROM public.genre_placeholder_backup_20260820 b
-- WHERE b.entity_kind = 'event' AND b.entity_id = e.id;
