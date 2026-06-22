-- One-time repair: restore event_media_url from linked artist when sync cleared it.
-- Safe to run multiple times (only fills NULL event_media_url).
-- Run in Supabase SQL Editor when IO budget is healthy.

UPDATE public.events e
SET event_media_url = a.image_url,
    updated_at = NOW()
FROM public.artists a
WHERE e.artist_id = a.id
  AND e.event_media_url IS NULL
  AND a.image_url IS NOT NULL
  AND a.image_url NOT LIKE '%jambase-default-band-image%'
  AND a.image_url <> '/Synth_Placeholder.png'
  AND a.image_url NOT LIKE '%/Synth_Placeholder.png%';

-- Optional: see how many rows still lack media
SELECT COUNT(*) AS events_missing_media
FROM public.events e
WHERE e.event_date >= CURRENT_DATE
  AND e.event_media_url IS NULL
  AND e.artist_id IS NOT NULL;
