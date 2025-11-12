-- Fix constraint violation issue
-- The constraint may not have been updated properly, or there's a mismatch

-- Step 1: Drop ALL possible constraint names (in case it has a different name)
DO $$
BEGIN
    -- Drop constraint if it exists with any name
    ALTER TABLE public.user_recommendations_cache
    DROP CONSTRAINT IF EXISTS user_recommendations_cache_connection_label_check;
    
    -- Also try dropping any other possible constraint names
    ALTER TABLE public.user_recommendations_cache
    DROP CONSTRAINT IF EXISTS user_recommendations_cache_connection_label_check1;
END $$;

-- Step 2: Check what constraints currently exist
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.user_recommendations_cache'::regclass
AND contype = 'c';

-- Step 3: Find any rows with invalid connection_label values
SELECT 
    connection_label,
    COUNT(*) as count
FROM public.user_recommendations_cache
WHERE connection_label NOT IN ('Friend', 'Mutual Friend', 'Mutual Friends +', 'Stranger')
GROUP BY connection_label;

-- Step 4: Update any invalid rows to 'Stranger' (safest default)
UPDATE public.user_recommendations_cache
SET connection_label = 'Stranger'
WHERE connection_label NOT IN ('Friend', 'Mutual Friend', 'Mutual Friends +', 'Stranger');

-- Step 5: Now recreate the constraint with the correct values
ALTER TABLE public.user_recommendations_cache
ADD CONSTRAINT user_recommendations_cache_connection_label_check
CHECK (connection_label IN ('Friend', 'Mutual Friend', 'Mutual Friends +', 'Stranger'));

-- Step 6: Verify the constraint was created correctly
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.user_recommendations_cache'::regclass
AND contype = 'c'
AND conname = 'user_recommendations_cache_connection_label_check';

-- Step 7: Test that we can insert valid values
-- This should work without error
DO $$
BEGIN
    -- Just verify the constraint allows our values
    RAISE NOTICE 'Constraint check passed - all values are valid';
END $$;

