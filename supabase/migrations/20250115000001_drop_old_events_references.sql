-- Drop old database function and references to events table
-- This fixes the issue where old functions try to query the non-existent events table

-- Drop the old function that references the events table
DROP FUNCTION IF EXISTS public.populate_events_from_concerts() CASCADE;

-- Drop any triggers that might reference the old events table
DROP TRIGGER IF EXISTS update_events_updated_at ON public.events;

-- Drop the old events table completely if it still exists
DROP TABLE IF EXISTS public.events CASCADE;

-- Create a new function that works with jambase_events if needed
-- (Currently not needed as we're using direct API integration)
