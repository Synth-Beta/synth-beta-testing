-- ============================================
-- STEP 11: COMPLETE REMAINING MIGRATIONS
-- ============================================
-- Complete the migrations for event_interests and event_ticket_urls

-- ============================================
-- PART A: CREATE HELPER FUNCTION IF NEEDED
-- ============================================
-- Create extract_ticket_provider_from_url function if it doesn't exist
CREATE OR REPLACE FUNCTION extract_ticket_provider_from_url(url TEXT)
RETURNS TEXT AS $$
BEGIN
  IF url IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Extract provider from URL based on common patterns
  IF url ILIKE '%ticketmaster%' THEN
    RETURN 'ticketmaster';
  ELSIF url ILIKE '%seatgeek%' THEN
    RETURN 'seatgeek';
  ELSIF url ILIKE '%stubhub%' THEN
    RETURN 'stubhub';
  ELSIF url ILIKE '%viagogo%' THEN
    RETURN 'viagogo';
  ELSIF url ILIKE '%axs%' THEN
    RETURN 'axs';
  ELSIF url ILIKE '%eventbrite%' THEN
    RETURN 'eventbrite';
  ELSIF url ILIKE '%dice%' THEN
    RETURN 'dice';
  ELSIF url ILIKE '%ticketweb%' THEN
    RETURN 'ticketweb';
  ELSIF url ILIKE '%ticketfly%' THEN
    RETURN 'ticketfly';
  ELSIF url ILIKE '%brownpapertickets%' THEN
    RETURN 'brownpapertickets';
  ELSE
    RETURN 'other';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- PART B: COMPLETE MIGRATIONS
-- ============================================
DO $$
DECLARE
  event_interests_before BIGINT;
  event_interests_after BIGINT;
  relationships_before BIGINT;
  relationships_after BIGINT;
  event_ticket_urls_before BIGINT;
  event_tickets_before BIGINT;
  event_tickets_after BIGINT;
  migrated_count INTEGER;
BEGIN
  RAISE NOTICE '=== COMPLETING REMAINING MIGRATIONS ===';
  RAISE NOTICE '';
  
  -- ============================================
  -- 1. COMPLETE event_interests → relationships
  -- ============================================
  RAISE NOTICE 'Step 1: Completing event_interests → relationships migration...';
  
  SELECT COUNT(*) INTO event_interests_before FROM public.event_interests;
  SELECT COUNT(*) INTO relationships_before 
  FROM public.relationships r
  WHERE r.related_entity_type = 'event' 
    AND r.relationship_type = 'interest'
    AND r.metadata->>'source_table' = 'event_interests';
  
  RAISE NOTICE '  Before: event_interests = %, relationships from interests = %', 
    event_interests_before, relationships_before;
  
  -- Migrate remaining rows
  INSERT INTO public.relationships (
    user_id,
    related_entity_type,
    related_entity_id,
    relationship_type,
    metadata,
    created_at,
    updated_at
  )
  SELECT 
    ei.user_id,
    'event' as related_entity_type,
    ei.event_id::TEXT as related_entity_id,
    'interest' as relationship_type,
    jsonb_build_object(
      'source_table', 'event_interests',
      'event_id', ei.event_id
    ) as metadata,
    COALESCE(ei.created_at, NOW()) as created_at,
    COALESCE(ei.created_at, NOW()) as updated_at
  FROM public.event_interests ei
  WHERE NOT EXISTS (
    -- Skip if already exists in relationships
    SELECT 1 FROM public.relationships r
    WHERE r.user_id = ei.user_id
      AND r.related_entity_type = 'event'
      AND r.related_entity_id = ei.event_id::TEXT
      AND r.relationship_type = 'interest'
  )
  ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) 
  DO NOTHING;
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  
  SELECT COUNT(*) INTO relationships_after 
  FROM public.relationships r
  WHERE r.related_entity_type = 'event' 
    AND r.relationship_type = 'interest'
    AND r.metadata->>'source_table' = 'event_interests';
  
  RAISE NOTICE '  Migrated: % additional rows', migrated_count;
  RAISE NOTICE '  After: relationships from interests = %', relationships_after;
  
  IF relationships_after >= event_interests_before THEN
    RAISE NOTICE '  ✅ Migration complete!';
  ELSE
    RAISE NOTICE '  ⚠️ WARNING: Still missing % rows', event_interests_before - relationships_after;
  END IF;
  
  RAISE NOTICE '';
  
  -- ============================================
  -- 2. COMPLETE event_ticket_urls → event_tickets
  -- ============================================
  RAISE NOTICE 'Step 2: Completing event_ticket_urls → event_tickets migration...';
  
  SELECT COUNT(*) INTO event_ticket_urls_before FROM public.event_ticket_urls;
  SELECT COUNT(*) INTO event_tickets_before FROM public.event_tickets;
  
  RAISE NOTICE '  Before: event_ticket_urls = %, event_tickets = %', 
    event_ticket_urls_before, event_tickets_before;
  
  -- Migrate data
  INSERT INTO public.event_tickets (
    event_id,
    ticket_provider,
    ticket_url,
    ticket_type,
    price_min,
    price_max,
    currency,
    available_from,
    available_until,
    is_primary,
    created_at,
    updated_at
  )
  SELECT 
    etu.event_id,
    extract_ticket_provider_from_url(etu.ticket_url) as ticket_provider,
    etu.ticket_url,
    NULL as ticket_type,
    NULL as price_min,
    NULL as price_max,
    'USD' as currency,
    NULL as available_from,
    NULL as available_until,
    false as is_primary,
    NOW() as created_at,
    NOW() as updated_at
  FROM public.event_ticket_urls etu
  WHERE NOT EXISTS (
    -- Skip if URL already exists in event_tickets for the same event
    SELECT 1 FROM public.event_tickets et
    WHERE et.event_id = etu.event_id
      AND et.ticket_url = etu.ticket_url
  );
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  
  SELECT COUNT(*) INTO event_tickets_after FROM public.event_tickets;
  
  RAISE NOTICE '  Migrated: % rows', migrated_count;
  RAISE NOTICE '  After: event_tickets = %', event_tickets_after;
  
  IF migrated_count > 0 THEN
    RAISE NOTICE '  ✅ Migration complete!';
  ELSE
    RAISE NOTICE '  ⚠️ WARNING: No rows migrated (may already exist or error occurred)';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'event_interests: % source rows, % migrated rows', 
    event_interests_before, relationships_after;
  RAISE NOTICE 'event_ticket_urls: % source rows, % migrated rows', 
    event_ticket_urls_before, migrated_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Next step: Run verification again to confirm migrations are complete';
END $$;

