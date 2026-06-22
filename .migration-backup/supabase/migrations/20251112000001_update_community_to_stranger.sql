-- Update connection labels to simplified naming
-- This migration updates the existing data and constraint

-- Step 1: First, drop the constraint to allow updates
ALTER TABLE public.user_recommendations_cache
DROP CONSTRAINT IF EXISTS user_recommendations_cache_connection_label_check;

-- Step 2: Update existing records in the cache
UPDATE public.user_recommendations_cache
SET connection_label = 'Stranger'
WHERE connection_label = 'Community';

-- Update all old labels to new simplified labels
UPDATE public.user_recommendations_cache
SET connection_label = 'Friend'
WHERE connection_label = 'Friends';

UPDATE public.user_recommendations_cache
SET connection_label = 'Mutual Friend'
WHERE connection_label IN ('Friends of Friends', 'Mutual Friends');

UPDATE public.user_recommendations_cache
SET connection_label = 'Mutual Friends +'
WHERE connection_label IN ('Extended Network', 'Mutual Friends of Mutual Friends', 'Extended Friends');

-- Step 3: Set any remaining invalid values to 'Stranger' as a safe default
UPDATE public.user_recommendations_cache
SET connection_label = 'Stranger'
WHERE connection_label NOT IN ('Friend', 'Mutual Friend', 'Mutual Friends +', 'Stranger');

-- Step 4: Now recreate the CHECK constraint with the new values
ALTER TABLE public.user_recommendations_cache
ADD CONSTRAINT user_recommendations_cache_connection_label_check
CHECK (connection_label IN ('Friend', 'Mutual Friend', 'Mutual Friends +', 'Stranger'));

-- Verify the update
SELECT 
  connection_label,
  COUNT(*) as count
FROM public.user_recommendations_cache
GROUP BY connection_label
ORDER BY connection_label;

