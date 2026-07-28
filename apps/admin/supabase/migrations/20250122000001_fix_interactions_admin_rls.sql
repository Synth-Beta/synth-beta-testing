-- Fix RLS policies for interactions table to allow admin access
-- This ensures admins can view all interactions for analytics

-- First, ensure RLS is enabled
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

-- Drop existing admin policy if it exists (to recreate it)
DROP POLICY IF EXISTS "Admins can view all interactions" ON public.interactions;

-- Create admin policy that allows admins to see ALL interactions
CREATE POLICY "Admins can view all interactions"
  ON public.interactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- Also ensure users can see their own interactions
DROP POLICY IF EXISTS "Users can view their own interactions" ON public.interactions;

CREATE POLICY "Users can view their own interactions"
  ON public.interactions
  FOR SELECT
  USING (user_id = auth.uid());

-- Allow users to insert their own interactions
DROP POLICY IF EXISTS "Users can insert their own interactions" ON public.interactions;

CREATE POLICY "Users can insert their own interactions"
  ON public.interactions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
