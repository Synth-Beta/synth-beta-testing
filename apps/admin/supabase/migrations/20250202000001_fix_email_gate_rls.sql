-- Fix RLS policies for email_gate_entries table
-- Drop existing policies
DROP POLICY IF EXISTS "Allow anonymous insert" ON public.email_gate_entries;
DROP POLICY IF EXISTS "Allow anonymous select by IP" ON public.email_gate_entries;

-- Grant necessary permissions to anon role
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT, SELECT ON public.email_gate_entries TO anon;

-- Create more permissive policies for anonymous users
CREATE POLICY "Enable insert for anonymous users"
ON public.email_gate_entries
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Enable select for anonymous users"
ON public.email_gate_entries
FOR SELECT
TO anon, authenticated
USING (true);

-- Also allow authenticated users to update (for when IP changes email)
CREATE POLICY "Enable update for anonymous users"
ON public.email_gate_entries
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Grant SELECT permission on the sequence (for id generation)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

