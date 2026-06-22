-- Clear non-usable placeholder image URLs so enrichment/backfill treat rows consistently.
-- Safe to re-run.
--
-- SQL Editor has a short statement timeout (~8s). Do NOT run one big UPDATE on artists/events.
-- Run each BATCH block below repeatedly until it reports "UPDATE 0" (or 0 rows returned).
-- Wait a few seconds between runs if Disk IO budget is low.
--
-- Suggested order: counts → artists batches → events batches → relink batches → final counts.

-- =============================================================================
-- 0) Scope check (fast — run once)
-- =============================================================================
SELECT
  (SELECT COUNT(*) FROM public.artists
   WHERE image_url IS NOT NULL
     AND (
       image_url LIKE '%jambase-default-band-image%'
       OR image_url = '/Synth_Placeholder.png'
       OR image_url LIKE '%/Synth_Placeholder.png%'
     )) AS artists_placeholder_rows,
  (SELECT COUNT(*) FROM public.events
   WHERE event_media_url IS NOT NULL
     AND (
       event_media_url LIKE '%jambase-default-band-image%'
       OR event_media_url = '/Synth_Placeholder.png'
       OR event_media_url LIKE '%/Synth_Placeholder.png%'
     )) AS events_placeholder_rows,
  (SELECT COUNT(*) FROM public.events e
   INNER JOIN public.artists a ON a.id = e.artist_id
   WHERE e.event_media_url IS NULL
     AND a.image_url IS NOT NULL
     AND a.image_url NOT LIKE '%jambase-default-band-image%'
     AND a.image_url <> '/Synth_Placeholder.png'
     AND a.image_url NOT LIKE '%/Synth_Placeholder.png%'
     AND e.event_date >= CURRENT_DATE) AS upcoming_events_to_relink;

-- =============================================================================
-- A) Artists — run until UPDATE 0 (adjust LIMIT down to 100 if still timing out)
-- =============================================================================
WITH batch AS (
  SELECT id
  FROM public.artists
  WHERE image_url IS NOT NULL
    AND (
      image_url LIKE '%jambase-default-band-image%'
      OR image_url = '/Synth_Placeholder.png'
      OR image_url LIKE '%/Synth_Placeholder.png%'
    )
  LIMIT 300
)
UPDATE public.artists a
SET image_url = NULL,
    updated_at = NOW()
FROM batch b
WHERE a.id = b.id;

-- =============================================================================
-- B) Events — run until UPDATE 0
-- =============================================================================
WITH batch AS (
  SELECT id
  FROM public.events
  WHERE event_media_url IS NOT NULL
    AND (
      event_media_url LIKE '%jambase-default-band-image%'
      OR event_media_url = '/Synth_Placeholder.png'
      OR event_media_url LIKE '%/Synth_Placeholder.png%'
    )
  LIMIT 300
)
UPDATE public.events e
SET event_media_url = NULL,
    updated_at = NOW()
FROM batch b
WHERE e.id = b.id;

-- =============================================================================
-- C) Re-link upcoming events from artists with real images — run until UPDATE 0
-- =============================================================================
WITH batch AS (
  SELECT e.id AS event_id, a.image_url AS artist_image_url
  FROM public.events e
  INNER JOIN public.artists a ON a.id = e.artist_id
  WHERE e.event_media_url IS NULL
    AND a.image_url IS NOT NULL
    AND a.image_url NOT LIKE '%jambase-default-band-image%'
    AND a.image_url <> '/Synth_Placeholder.png'
    AND a.image_url NOT LIKE '%/Synth_Placeholder.png%'
    AND e.event_date >= CURRENT_DATE
  LIMIT 200
)
UPDATE public.events e
SET event_media_url = b.artist_image_url,
    updated_at = NOW()
FROM batch b
WHERE e.id = b.event_id;

-- =============================================================================
-- D) Final counts (run when A–C are all at UPDATE 0)
-- =============================================================================
SELECT
  (SELECT COUNT(*) FROM public.artists WHERE image_url IS NOT NULL) AS artists_with_real_image,
  (SELECT COUNT(*) FROM public.artists WHERE image_url IS NULL) AS artists_without_image,
  (SELECT COUNT(*)
   FROM public.events e
   WHERE e.event_date >= CURRENT_DATE
     AND e.event_media_url IS NULL
     AND e.artist_id IS NOT NULL) AS upcoming_events_missing_media;
