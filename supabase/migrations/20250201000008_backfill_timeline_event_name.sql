-- ============================================
-- BACKFILL Event_name IN PASSPORT_TIMELINE
-- Populates Event_name from Artists.name and Venues.name
-- ============================================

UPDATE public.passport_timeline pt
SET "Event_name" = subquery.event_name,
    updated_at = now()
FROM (
  SELECT 
    pt2.id,
    CASE
      WHEN a.name IS NOT NULL AND v.name IS NOT NULL THEN a.name || ' @ ' || v.name
      WHEN a.name IS NOT NULL THEN a.name
      WHEN v.name IS NOT NULL THEN v.name
      ELSE NULL
    END AS event_name
  FROM public.passport_timeline pt2
  LEFT JOIN public.reviews r ON r.id = pt2.review_id
  LEFT JOIN public.events e ON e.id = r.event_id
  -- Prefer artist/venue from events table, fallback to review's artist/venue
  LEFT JOIN public.artists a ON a.id = COALESCE(e.artist_id, r.artist_id)
  LEFT JOIN public.venues v ON v.id = COALESCE(e.venue_id, r.venue_id)
  WHERE pt2."Event_name" IS NULL
    AND pt2.review_id IS NOT NULL
) subquery
WHERE pt.id = subquery.id
  AND pt."Event_name" IS NULL;

-- Log results
DO $$
DECLARE
  v_updated_count INTEGER;
  v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM public.passport_timeline
  WHERE "Event_name" IS NOT NULL;
  
  SELECT COUNT(*) INTO v_null_count
  FROM public.passport_timeline
  WHERE "Event_name" IS NULL
    AND review_id IS NOT NULL;
  
  RAISE NOTICE 'Backfill completed. Event_name populated: %, still NULL: %', v_updated_count, v_null_count;
END $$;

