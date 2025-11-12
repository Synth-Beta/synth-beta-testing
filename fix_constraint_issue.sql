-- Fix constraint issue - ensure constraint is properly updated
-- Run this if you're getting constraint violations

-- Step 1: Drop the constraint if it exists (with all possible names)
ALTER TABLE public.user_recommendations_cache
DROP CONSTRAINT IF EXISTS user_recommendations_cache_connection_label_check;

-- Step 2: Check what constraint actually exists
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.user_recommendations_cache'::regclass
AND contype = 'c';

-- Step 3: Recreate the constraint with the correct values
ALTER TABLE public.user_recommendations_cache
ADD CONSTRAINT user_recommendations_cache_connection_label_check
CHECK (connection_label IN ('Friend', 'Mutual Friend', 'Mutual Friends +', 'Stranger'));

-- Step 4: Verify the constraint
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.user_recommendations_cache'::regclass
AND contype = 'c'
AND conname = 'user_recommendations_cache_connection_label_check';

-- Step 5: Check for any rows that violate the new constraint
SELECT 
    connection_label,
    COUNT(*) as count
FROM public.user_recommendations_cache
WHERE connection_label NOT IN ('Friend', 'Mutual Friend', 'Mutual Friends +', 'Stranger')
GROUP BY connection_label;

-- Step 6: If there are invalid rows, update them
UPDATE public.user_recommendations_cache
SET connection_label = 'Stranger'
WHERE connection_label NOT IN ('Friend', 'Mutual Friend', 'Mutual Friends +', 'Stranger');

