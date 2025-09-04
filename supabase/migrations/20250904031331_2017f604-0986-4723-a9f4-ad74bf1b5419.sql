-- Enable RLS on events table that was missing it
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow everyone to read events (since they're public data)
CREATE POLICY "Events are viewable by everyone" ON public.events FOR SELECT USING (true);