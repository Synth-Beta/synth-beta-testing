-- Fix existing drafts that have incorrect ratings
-- Set rating to NULL for all draft reviews

UPDATE user_reviews 
SET rating = NULL 
WHERE is_draft = true AND rating IS NOT NULL;

-- Also ensure is_public is false for all drafts
UPDATE user_reviews 
SET is_public = false 
WHERE is_draft = true AND is_public = true;
