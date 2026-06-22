-- Fix the event_interests table to match the events table id type
ALTER TABLE public.event_interests 
ALTER COLUMN event_id TYPE bigint USING event_id::bigint;

-- Update user_swipes table as well
ALTER TABLE public.user_swipes 
ALTER COLUMN event_id TYPE bigint USING event_id::bigint;

-- Update matches table
ALTER TABLE public.matches 
ALTER COLUMN event_id TYPE bigint USING event_id::bigint;