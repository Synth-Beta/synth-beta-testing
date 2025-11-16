-- ============================================
-- DATABASE CONSOLIDATION: PHASE 3 - MIGRATE CONTENT
-- ============================================
-- This migration migrates reviews, comments, likes, and shares to consolidated tables
-- Run this AFTER Phase 3.2 (migrate relationships) is complete

-- ============================================
-- 3.3.1 MIGRATE USER_REVIEWS → REVIEWS
-- ============================================

-- Migrate user_reviews to reviews_new
INSERT INTO public.reviews_new (
  id,
  user_id,
  event_id,
  artist_id,
  venue_id,
  rating,
  artist_rating,
  venue_rating,
  performance_rating,
  venue_rating_new,
  overall_experience_rating,
  reaction_emoji,
  review_text,
  performance_review_text,
  venue_review_text,
  overall_experience_review_text,
  photos,
  videos,
  mood_tags,
  genre_tags,
  context_tags,
  venue_tags,
  artist_tags,
  review_type,
  likes_count,
  comments_count,
  shares_count,
  is_public,
  is_draft,
  attendees,
  rank_order,
  was_there,
  created_at,
  updated_at
)
SELECT 
  ur.id,
  ur.user_id,
  ur.event_id,
  NULL::UUID as artist_id, -- Will be populated from events_new.artist_uuid
  NULL::UUID as venue_id, -- Will be populated from events_new.venue_uuid
  ur.rating,
  ur.artist_rating,
  ur.venue_rating,
  ur.performance_rating,
  ur.venue_rating_new,
  ur.overall_experience_rating,
  ur.reaction_emoji,
  ur.review_text,
  ur.performance_review_text,
  ur.venue_review_text,
  ur.overall_experience_review_text,
  ur.photos,
  ur.videos,
  ur.mood_tags,
  ur.genre_tags,
  ur.context_tags,
  ur.venue_tags,
  ur.artist_tags,
  ur.review_type,
  ur.likes_count,
  ur.comments_count,
  ur.shares_count,
  ur.is_public,
  COALESCE(ur.is_draft, false) as is_draft,
  CASE 
    WHEN ur.attendees IS NULL OR ur.attendees = '[]'::jsonb THEN ARRAY[]::TEXT[]
    WHEN jsonb_typeof(ur.attendees) = 'array' THEN 
      ARRAY(
        SELECT 
          CASE 
            WHEN elem->>'type' = 'user' THEN elem->>'user_id'
            WHEN elem->>'type' = 'phone' THEN elem->>'phone'
            ELSE elem::TEXT
          END
        FROM jsonb_array_elements(ur.attendees) AS elem
      )
    ELSE ARRAY[]::TEXT[]
  END as attendees, -- Convert JSONB array of objects to TEXT[] (extract user_id or phone)
  ur.rank_order,
  COALESCE(ur.was_there, false) as was_there,
  ur.created_at,
  ur.updated_at
FROM public.user_reviews ur
JOIN public.events_new e ON ur.event_id = e.id
ON CONFLICT (user_id, event_id) DO NOTHING;

-- Update artist_id and venue_id in reviews_new if they're NULL
UPDATE public.reviews_new r
SET artist_id = e.artist_uuid
FROM public.events_new e
WHERE r.event_id = e.id
  AND r.artist_id IS NULL
  AND e.artist_uuid IS NOT NULL;

UPDATE public.reviews_new r
SET venue_id = e.venue_uuid
FROM public.events_new e
WHERE r.event_id = e.id
  AND r.venue_id IS NULL
  AND e.venue_uuid IS NOT NULL;

-- Verify migration
DO $$
DECLARE
  v_user_reviews_count INTEGER;
  v_reviews_new_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_user_reviews_count FROM public.user_reviews;
  SELECT COUNT(*) INTO v_reviews_new_count FROM public.reviews_new;
  
  IF v_user_reviews_count != v_reviews_new_count THEN
    RAISE WARNING 'Reviews migration mismatch: user_reviews=%, reviews_new=%', 
      v_user_reviews_count, v_reviews_new_count;
  ELSE
    RAISE NOTICE 'Reviews migration successful: % rows migrated', v_reviews_new_count;
  END IF;
END $$;

-- ============================================
-- 3.3.2 MIGRATE EVENT_COMMENTS → COMMENTS
-- ============================================

-- Migrate event_comments to comments_new
INSERT INTO public.comments_new (
  id,
  user_id,
  entity_type,
  entity_id,
  parent_comment_id,
  comment_text,
  likes_count,
  created_at,
  updated_at
)
SELECT 
  ec.id,
  ec.user_id,
  'event' as entity_type,
  ec.event_id as entity_id,
  ec.parent_comment_id,
  ec.comment_text,
  0 as likes_count, -- Will be updated from comment_likes migration
  ec.created_at,
  ec.updated_at
FROM public.event_comments ec
JOIN public.events_new e ON ec.event_id = e.id
ON CONFLICT DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_event_comments_count INTEGER;
  v_comments_event_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_event_comments_count FROM public.event_comments;
  SELECT COUNT(*) INTO v_comments_event_count 
  FROM public.comments_new 
  WHERE entity_type = 'event';
  
  IF v_event_comments_count != v_comments_event_count THEN
    RAISE WARNING 'Event comments migration mismatch: event_comments=%, comments_new (event)=%', 
      v_event_comments_count, v_comments_event_count;
  ELSE
    RAISE NOTICE 'Event comments migration successful: % rows migrated', v_comments_event_count;
  END IF;
END $$;

-- ============================================
-- 3.3.3 MIGRATE REVIEW_COMMENTS → COMMENTS
-- ============================================

-- Migrate review_comments to comments_new
INSERT INTO public.comments_new (
  id,
  user_id,
  entity_type,
  entity_id,
  parent_comment_id,
  comment_text,
  likes_count,
  created_at,
  updated_at
)
SELECT 
  rc.id,
  rc.user_id,
  'review' as entity_type,
  rc.review_id as entity_id,
  rc.parent_comment_id,
  rc.comment_text,
  0 as likes_count, -- Will be updated from comment_likes migration
  rc.created_at,
  rc.updated_at
FROM public.review_comments rc
JOIN public.reviews_new rn ON rc.review_id = rn.id
ON CONFLICT DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_review_comments_count INTEGER;
  v_comments_review_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_review_comments_count FROM public.review_comments;
  SELECT COUNT(*) INTO v_comments_review_count 
  FROM public.comments_new 
  WHERE entity_type = 'review';
  
  IF v_review_comments_count != v_comments_review_count THEN
    RAISE WARNING 'Review comments migration mismatch: review_comments=%, comments_new (review)=%', 
      v_review_comments_count, v_comments_review_count;
  ELSE
    RAISE NOTICE 'Review comments migration successful: % rows migrated', v_comments_review_count;
  END IF;
END $$;

-- ============================================
-- 3.3.4 UPDATE COMMENT LIKES COUNT
-- ============================================

-- Update likes_count in comments_new from comment_likes (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comment_likes') THEN
    -- Update event comment likes count
    UPDATE public.comments_new c
    SET likes_count = (
      SELECT COUNT(*) 
      FROM public.comment_likes cl 
      WHERE cl.comment_id = c.id
        AND c.entity_type = 'event'
    )
    WHERE c.entity_type = 'event';
    
    -- Update review comment likes count
    UPDATE public.comments_new c
    SET likes_count = (
      SELECT COUNT(*) 
      FROM public.comment_likes cl 
      WHERE cl.comment_id = c.id
        AND c.entity_type = 'review'
    )
    WHERE c.entity_type = 'review';
    
    RAISE NOTICE 'Comment likes count updated';
  ELSE
    RAISE NOTICE 'Comment_likes table does not exist, skipping likes count update';
  END IF;
END $$;

-- ============================================
-- 3.3.5 MIGRATE EVENT_LIKES → ENGAGEMENTS
-- ============================================

-- Migrate event_likes to engagements_new
INSERT INTO public.engagements_new (
  user_id,
  entity_type,
  entity_id,
  engagement_type,
  engagement_value,
  metadata,
  created_at
)
SELECT 
  el.user_id,
  'event' as entity_type,
  el.event_id as entity_id, -- Keep as UUID, not TEXT
  'like' as engagement_type,
  NULL as engagement_value,
  jsonb_build_object(
    'like_id', el.id,
    'event_id', el.event_id
  ) as metadata,
  el.created_at
FROM public.event_likes el
JOIN public.events_new e ON el.event_id = e.id
ON CONFLICT (user_id, entity_type, entity_id, engagement_type) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_event_likes_count INTEGER;
  v_engagements_event_likes_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_event_likes_count FROM public.event_likes;
  SELECT COUNT(*) INTO v_engagements_event_likes_count 
  FROM public.engagements_new 
  WHERE entity_type = 'event' AND engagement_type = 'like';
  
  IF v_event_likes_count != v_engagements_event_likes_count THEN
    RAISE WARNING 'Event likes migration mismatch: event_likes=%, engagements_new (event like)=%', 
      v_event_likes_count, v_engagements_event_likes_count;
  ELSE
    RAISE NOTICE 'Event likes migration successful: % rows migrated', v_engagements_event_likes_count;
  END IF;
END $$;

-- ============================================
-- 3.3.6 MIGRATE REVIEW_LIKES → ENGAGEMENTS
-- ============================================

-- Migrate review_likes to engagements_new
INSERT INTO public.engagements_new (
  user_id,
  entity_type,
  entity_id,
  engagement_type,
  engagement_value,
  metadata,
  created_at
)
SELECT 
  rl.user_id,
  'review' as entity_type,
  rl.review_id as entity_id, -- Keep as UUID, not TEXT
  'like' as engagement_type,
  NULL as engagement_value,
  jsonb_build_object(
    'like_id', rl.id,
    'review_id', rl.review_id
  ) as metadata,
  rl.created_at
FROM public.review_likes rl
JOIN public.reviews_new rn ON rl.review_id = rn.id
ON CONFLICT (user_id, entity_type, entity_id, engagement_type) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_review_likes_count INTEGER;
  v_engagements_review_likes_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_review_likes_count FROM public.review_likes;
  SELECT COUNT(*) INTO v_engagements_review_likes_count 
  FROM public.engagements_new 
  WHERE entity_type = 'review' AND engagement_type = 'like';
  
  IF v_review_likes_count != v_engagements_review_likes_count THEN
    RAISE WARNING 'Review likes migration mismatch: review_likes=%, engagements_new (review like)=%', 
      v_review_likes_count, v_engagements_review_likes_count;
  ELSE
    RAISE NOTICE 'Review likes migration successful: % rows migrated', v_engagements_review_likes_count;
  END IF;
END $$;

-- ============================================
-- 3.3.7 MIGRATE COMMENT_LIKES → ENGAGEMENTS
-- ============================================

-- Migrate comment_likes to engagements_new (if comment_likes table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comment_likes') THEN
    -- Migrate comment_likes
    INSERT INTO public.engagements_new (
      user_id,
      entity_type,
      entity_id,
      engagement_type,
      engagement_value,
      metadata,
      created_at
    )
    SELECT 
      cl.user_id,
      'comment' as entity_type,
      cl.comment_id as entity_id, -- Keep as UUID, not TEXT
      'like' as engagement_type,
      NULL as engagement_value,
      jsonb_build_object(
        'like_id', cl.id,
        'comment_id', cl.comment_id
      ) as metadata,
      cl.created_at
    FROM public.comment_likes cl
    JOIN public.comments_new c ON cl.comment_id = c.id
    ON CONFLICT (user_id, entity_type, entity_id, engagement_type) DO NOTHING;
    
    RAISE NOTICE 'Comment likes migration completed';
  ELSE
    RAISE NOTICE 'Comment_likes table does not exist, skipping migration';
  END IF;
END $$;

-- ============================================
-- 3.3.8 MIGRATE REVIEW_SHARES → ENGAGEMENTS
-- ============================================

-- Migrate review_shares to engagements_new (if review_shares table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'review_shares') THEN
    -- Migrate review_shares
    INSERT INTO public.engagements_new (
      user_id,
      entity_type,
      entity_id,
      engagement_type,
      engagement_value,
      metadata,
      created_at
    )
    SELECT 
      rs.user_id,
      'review' as entity_type,
      rs.review_id as entity_id, -- Keep as UUID, not TEXT
      'share' as engagement_type,
      rs.share_platform as engagement_value,
      jsonb_build_object(
        'share_id', rs.id,
        'review_id', rs.review_id,
        'share_platform', rs.share_platform
      ) as metadata,
      rs.created_at
    FROM public.review_shares rs
    JOIN public.reviews_new rn ON rs.review_id = rn.id
    ON CONFLICT (user_id, entity_type, entity_id, engagement_type) DO NOTHING;
    
    RAISE NOTICE 'Review shares migration completed';
  ELSE
    RAISE NOTICE 'Review_shares table does not exist, skipping migration';
  END IF;
END $$;

-- ============================================
-- 3.3.9 UPDATE REVIEW COUNTS
-- ============================================

-- Update likes_count, comments_count, shares_count in reviews_new
UPDATE public.reviews_new r
SET 
  likes_count = (
    SELECT COUNT(*) 
    FROM public.engagements_new e 
    WHERE e.entity_type = 'review' 
      AND e.entity_id = r.id -- Both are UUID, no cast needed
      AND e.engagement_type = 'like'
  ),
  comments_count = (
    SELECT COUNT(*) 
    FROM public.comments_new c 
    WHERE c.entity_type = 'review' 
      AND c.entity_id = r.id
  ),
  shares_count = (
    SELECT COUNT(*) 
    FROM public.engagements_new e 
    WHERE e.entity_type = 'review' 
      AND e.entity_id = r.id -- Both are UUID, no cast needed
      AND e.engagement_type = 'share'
  );

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify all content migrated
SELECT 
  'Content migration complete' as status,
  (SELECT COUNT(*) FROM public.reviews_new) as reviews_count,
  (SELECT COUNT(*) FROM public.comments_new WHERE entity_type = 'event') as event_comments_count,
  (SELECT COUNT(*) FROM public.comments_new WHERE entity_type = 'review') as review_comments_count,
  (SELECT COUNT(*) FROM public.engagements_new WHERE entity_type = 'event' AND engagement_type = 'like') as event_likes_count,
  (SELECT COUNT(*) FROM public.engagements_new WHERE entity_type = 'review' AND engagement_type = 'like') as review_likes_count,
  (SELECT COUNT(*) FROM public.engagements_new WHERE entity_type = 'comment' AND engagement_type = 'like') as comment_likes_count,
  (SELECT COUNT(*) FROM public.engagements_new WHERE entity_type = 'review' AND engagement_type = 'share') as review_shares_count,
  (SELECT COUNT(*) FROM public.user_reviews) as user_reviews_old_count,
  (SELECT COUNT(*) FROM public.event_comments) as event_comments_old_count,
  (SELECT COUNT(*) FROM public.review_comments) as review_comments_old_count,
  (SELECT COUNT(*) FROM public.event_likes) as event_likes_old_count,
  (SELECT COUNT(*) FROM public.review_likes) as review_likes_old_count;

