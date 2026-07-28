-- Cleanup script for duplicate draft reviews issue
-- This script removes orphaned draft reviews that were created by the auto-save feature
-- Run this AFTER deploying the fix to reviewService.ts

-- Step 1: View all draft reviews with rating = 1 (the default for drafts)
SELECT 
  ur.id,
  ur.user_id,
  ur.event_id,
  ur.rating,
  ur.is_draft,
  ur.is_public,
  ur.created_at,
  ur.updated_at,
  je.title as event_title,
  je.artist_name,
  je.venue_name
FROM user_reviews ur
LEFT JOIN jambase_events je ON ur.event_id = je.id
WHERE ur.is_draft = true
ORDER BY ur.created_at DESC;

-- Step 2: Find events where users have BOTH a draft AND a published review
-- These are the problematic duplicates
SELECT 
  ur1.user_id,
  ur1.event_id,
  je.title as event_title,
  je.artist_name,
  COUNT(*) as review_count,
  MAX(CASE WHEN ur1.is_draft = true THEN ur1.id END) as draft_review_id,
  MAX(CASE WHEN ur1.is_draft = true THEN ur1.rating END) as draft_rating,
  MAX(CASE WHEN ur1.is_draft = false THEN ur1.id END) as published_review_id,
  MAX(CASE WHEN ur1.is_draft = false THEN ur1.rating END) as published_rating
FROM user_reviews ur1
LEFT JOIN jambase_events je ON ur1.event_id = je.id
GROUP BY ur1.user_id, ur1.event_id, je.title, je.artist_name
HAVING COUNT(CASE WHEN ur1.is_draft = true THEN 1 END) > 0 
   AND COUNT(CASE WHEN ur1.is_draft = false THEN 1 END) > 0
ORDER BY ur1.user_id, ur1.event_id;

-- Step 3: Delete all orphaned draft reviews where a published review exists
-- IMPORTANT: Review the results from Step 2 before running this!
DELETE FROM user_reviews
WHERE id IN (
  SELECT ur_draft.id
  FROM user_reviews ur_draft
  WHERE ur_draft.is_draft = true
    AND EXISTS (
      SELECT 1
      FROM user_reviews ur_published
      WHERE ur_published.user_id = ur_draft.user_id
        AND ur_published.event_id = ur_draft.event_id
        AND ur_published.is_draft = false
    )
);

-- Step 4: Verify cleanup - this should return 0 rows if successful
SELECT 
  ur1.user_id,
  ur1.event_id,
  je.title as event_title,
  COUNT(*) as review_count
FROM user_reviews ur1
LEFT JOIN jambase_events je ON ur1.event_id = je.id
GROUP BY ur1.user_id, ur1.event_id, je.title
HAVING COUNT(CASE WHEN ur1.is_draft = true THEN 1 END) > 0 
   AND COUNT(CASE WHEN ur1.is_draft = false THEN 1 END) > 0;

-- Step 5: Optional - Delete ALL draft reviews (use with caution!)
-- Only run this if you want to remove ALL drafts, including ones without published versions
-- DELETE FROM user_reviews WHERE is_draft = true;

COMMENT ON SCRIPT IS 'Cleanup script for duplicate draft reviews bug - removes orphaned drafts where published review exists';

