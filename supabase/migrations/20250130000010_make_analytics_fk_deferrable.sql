-- Alternative fix: Make foreign key constraint deferrable
-- This allows analytics to be inserted after the event is committed

-- Step 1: Drop the existing foreign key constraint
ALTER TABLE public.analytics_event_daily 
DROP CONSTRAINT IF EXISTS analytics_event_daily_event_id_fkey;

-- Step 2: Recreate the foreign key constraint as deferrable
ALTER TABLE public.analytics_event_daily 
ADD CONSTRAINT analytics_event_daily_event_id_fkey 
FOREIGN KEY (event_id) 
REFERENCES public.jambase_events(id) 
ON DELETE CASCADE 
DEFERRABLE INITIALLY DEFERRED;

-- Step 3: Add helpful comment
COMMENT ON CONSTRAINT analytics_event_daily_event_id_fkey ON public.analytics_event_daily 
IS 'Deferrable foreign key constraint to allow analytics insertion after event creation';
