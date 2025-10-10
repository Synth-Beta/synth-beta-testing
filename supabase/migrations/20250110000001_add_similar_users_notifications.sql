-- Add similar_users_notifications column to profiles table
-- This column controls whether users get notified when similar users show interest in events

-- Add the column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'similar_users_notifications'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN similar_users_notifications BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

-- Add comment to document the column
COMMENT ON COLUMN public.profiles.similar_users_notifications IS 'Whether the user wants to be notified when similar users (age, gender, interests) show interest in events. Defaults to true.';

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_profiles_similar_users_notifications 
ON public.profiles(similar_users_notifications) 
WHERE similar_users_notifications = true;
