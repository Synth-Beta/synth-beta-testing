-- ============================================
-- STEP 2: CONSOLIDATE SIMPLE TABLES
-- ============================================
-- This script consolidates simple relationship/engagement tables
-- into the existing consolidated tables

-- ============================================
-- PART A: CONSOLIDATE event_photo_likes → engagements
-- ============================================
-- Merge photo likes into the engagements table

DO $$
DECLARE
  migrated_count INTEGER;
  source_count INTEGER;
BEGIN
  -- Check if event_photo_likes exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_photo_likes'
  ) THEN
    -- Get source count
    SELECT COUNT(*) INTO source_count FROM public.event_photo_likes;
    
    -- Migrate data
    INSERT INTO public.engagements (
      user_id,
      entity_type,
      entity_id,
      engagement_type,
      engagement_value,
      metadata,
      created_at
    )
    SELECT 
      epl.user_id,
      'event_photo' as entity_type,
      epl.photo_id as entity_id,
      'like' as engagement_type,
      NULL as engagement_value,
      jsonb_build_object(
        'source_table', 'event_photo_likes',
        'photo_id', epl.photo_id
      ) as metadata,
      epl.created_at
    FROM public.event_photo_likes epl
    WHERE NOT EXISTS (
      SELECT 1 FROM public.engagements e
      WHERE e.user_id = epl.user_id
        AND e.entity_type = 'event_photo'
        AND e.entity_id = epl.photo_id
        AND e.engagement_type = 'like'
    );
    
    GET DIAGNOSTICS migrated_count = ROW_COUNT;
    
    RAISE NOTICE 'Migrated % photo likes from event_photo_likes to engagements (source had % rows)', migrated_count, source_count;
  ELSE
    RAISE NOTICE 'Table event_photo_likes does not exist, skipping migration';
  END IF;
END $$;

-- ============================================
-- PART B: CONSOLIDATE event_photo_comments → comments
-- ============================================
-- Merge photo comments into the comments table

DO $$
DECLARE
  migrated_count INTEGER;
  source_count INTEGER;
BEGIN
  -- Check if event_photo_comments exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_photo_comments'
  ) THEN
    -- Get source count
    SELECT COUNT(*) INTO source_count FROM public.event_photo_comments;
    
    -- Migrate data
    INSERT INTO public.comments (
      user_id,
      entity_type,
      entity_id,
      comment_text,
      parent_comment_id,
      created_at,
      updated_at
    )
    SELECT 
      epc.user_id,
      'event_photo' as entity_type,
      epc.photo_id as entity_id,
      epc.comment as comment_text,
      NULL as parent_comment_id,
      epc.created_at,
      COALESCE(epc.updated_at, epc.created_at) as updated_at
    FROM public.event_photo_comments epc
    WHERE NOT EXISTS (
      SELECT 1 FROM public.comments c
      WHERE c.user_id = epc.user_id
        AND c.entity_type = 'event_photo'
        AND c.entity_id = epc.photo_id
        AND c.comment_text = epc.comment
        AND c.created_at = epc.created_at
    );
    
    GET DIAGNOSTICS migrated_count = ROW_COUNT;
    
    RAISE NOTICE 'Migrated % photo comments from event_photo_comments to comments (source had % rows)', migrated_count, source_count;
  ELSE
    RAISE NOTICE 'Table event_photo_comments does not exist, skipping migration';
  END IF;
END $$;

-- ============================================
-- PART C: CONSOLIDATE event_shares → interactions
-- ============================================
-- Merge event shares into the interactions table

DO $$
DECLARE
  migrated_count INTEGER;
  source_count INTEGER;
BEGIN
  -- Check if event_shares exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_shares'
  ) THEN
    -- Get source count
    SELECT COUNT(*) INTO source_count FROM public.event_shares;
    
    -- Migrate data
    INSERT INTO public.interactions (
      user_id,
      event_type,
      entity_type,
      entity_id,
      metadata,
      occurred_at,
      created_at
    )
    SELECT 
      es.sharer_user_id as user_id,
      'share' as event_type,
      'event' as entity_type,
      es.event_id::TEXT as entity_id,
      jsonb_build_object(
        'source_table', 'event_shares',
        'event_id', es.event_id,
        'chat_id', es.chat_id,
        'message_id', es.message_id,
        'share_type', es.share_type
      ) as metadata,
      es.created_at as occurred_at,
      es.created_at
    FROM public.event_shares es
    WHERE NOT EXISTS (
      SELECT 1 FROM public.interactions i
      WHERE i.user_id = es.sharer_user_id
        AND i.event_type = 'share'
        AND i.entity_type = 'event'
        AND i.entity_id = es.event_id::TEXT
        AND i.occurred_at = es.created_at
    );
    
    GET DIAGNOSTICS migrated_count = ROW_COUNT;
    
    RAISE NOTICE 'Migrated % event shares from event_shares to interactions (source had % rows)', migrated_count, source_count;
  ELSE
    RAISE NOTICE 'Table event_shares does not exist, skipping migration';
  END IF;
END $$;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
SELECT 
  'Consolidation Verification' as analysis_type,
  'event_photo_likes → engagements' as consolidation,
  (SELECT COUNT(*) FROM public.engagements WHERE entity_type = 'event_photo' AND engagement_type = 'like') as new_count,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_photo_likes')
    THEN (SELECT COUNT(*) FROM public.event_photo_likes)
    ELSE 0
  END as old_count;

SELECT 
  'Consolidation Verification' as analysis_type,
  'event_photo_comments → comments' as consolidation,
  (SELECT COUNT(*) FROM public.comments WHERE entity_type = 'event_photo') as new_count,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_photo_comments')
    THEN (SELECT COUNT(*) FROM public.event_photo_comments)
    ELSE 0
  END as old_count;

SELECT 
  'Consolidation Verification' as analysis_type,
  'event_shares → interactions' as consolidation,
  (SELECT COUNT(*) FROM public.interactions WHERE event_type = 'share' AND entity_type = 'event') as new_count,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_shares')
    THEN (SELECT COUNT(*) FROM public.event_shares)
    ELSE 0
  END as old_count;

