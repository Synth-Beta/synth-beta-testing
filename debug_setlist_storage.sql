-- Debug script to check setlist storage
-- Run this in your Supabase SQL editor

-- 1. Check if setlist column exists
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'user_reviews' AND column_name = 'setlist';

-- 2. Check recent reviews for setlist data
SELECT 
  id,
  user_id,
  event_id,
  review_text,
  setlist,
  created_at
FROM user_reviews 
ORDER BY created_at DESC 
LIMIT 10;

-- 3. Check if any reviews have setlist data
SELECT 
  COUNT(*) as total_reviews,
  COUNT(setlist) as reviews_with_setlist,
  COUNT(*) FILTER (WHERE setlist IS NOT NULL) as non_null_setlists
FROM user_reviews;

-- 4. Show sample setlist data if any exists
SELECT 
  id,
  review_text,
  setlist,
  created_at
FROM user_reviews 
WHERE setlist IS NOT NULL 
ORDER BY created_at DESC 
LIMIT 5;
