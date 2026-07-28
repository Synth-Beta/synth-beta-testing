-- Add user moderation fields and warnings table
-- This migration adds support for warning, suspending, and banning users

-- Add account_status column to users table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'account_status'
  ) THEN
    ALTER TABLE public.users 
    ADD COLUMN account_status TEXT DEFAULT 'active' 
    CHECK (account_status IN ('active', 'warned', 'suspended', 'banned'));
  END IF;
END $$;

-- Create index for account_status
CREATE INDEX IF NOT EXISTS idx_users_account_status ON public.users(account_status);

-- Create user_warnings table to track warnings given to users
CREATE TABLE IF NOT EXISTS public.user_warnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  warned_by_user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  moderation_flag_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
) TABLESPACE pg_default;

-- Add foreign key constraints if they don't exist
DO $$
BEGIN
  -- Add user_id foreign key
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_warnings_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_warnings
    ADD CONSTRAINT user_warnings_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
  END IF;

  -- Add warned_by_user_id foreign key
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_warnings_warned_by_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_warnings
    ADD CONSTRAINT user_warnings_warned_by_user_id_fkey 
    FOREIGN KEY (warned_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL;
  END IF;

  -- Add moderation_flag_id foreign key
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_warnings_moderation_flag_id_fkey'
  ) THEN
    ALTER TABLE public.user_warnings
    ADD CONSTRAINT user_warnings_moderation_flag_id_fkey 
    FOREIGN KEY (moderation_flag_id) REFERENCES moderation_flags(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for user_warnings
CREATE INDEX IF NOT EXISTS idx_user_warnings_user_id ON public.user_warnings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_warnings_warned_by ON public.user_warnings(warned_by_user_id);
CREATE INDEX IF NOT EXISTS idx_user_warnings_moderation_flag_id ON public.user_warnings(moderation_flag_id);
CREATE INDEX IF NOT EXISTS idx_user_warnings_created_at ON public.user_warnings(created_at DESC);

-- Enable RLS
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_warnings
-- Drop policies if they exist, then create them
DROP POLICY IF EXISTS "Users can view their own warnings" ON public.user_warnings;
CREATE POLICY "Users can view their own warnings"
  ON public.user_warnings
  FOR SELECT
  USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Admins can view all warnings" ON public.user_warnings;
CREATE POLICY "Admins can view all warnings"
  ON public.user_warnings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.user_id::text = auth.uid()::text
      AND users.account_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert warnings" ON public.user_warnings;
CREATE POLICY "Admins can insert warnings"
  ON public.user_warnings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.user_id::text = auth.uid()::text
      AND users.account_type = 'admin'
    )
  );

