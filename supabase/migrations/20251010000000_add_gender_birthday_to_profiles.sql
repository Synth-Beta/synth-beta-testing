-- Add gender and birthday to profiles table for trust and safety
-- These fields will be displayed to users interested in events

-- IMPORTANT: This migration is SAFE to run multiple times (uses IF NOT EXISTS)
-- It will NOT break any existing functions or policies

-- Step 1: Add the new columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS gender TEXT,
ADD COLUMN IF NOT EXISTS birthday DATE;

-- Step 2: Add constraint for gender values (flexible but guided)
-- We allow NULL for users who don't want to specify
-- Common values: 'male', 'female', 'non-binary', 'prefer-not-to-say', 'other'
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'valid_gender_values'
  ) THEN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT valid_gender_values 
    CHECK (
      gender IS NULL OR 
      gender IN ('male', 'female', 'non-binary', 'prefer-not-to-say', 'other')
    );
  END IF;
END $$;

-- Step 3: Add constraint for birthday (must be in the past, reasonable age range)
-- Users must be at least 13 years old (COPPA compliance) and birthday can't be more than 120 years ago
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'valid_birthday_range'
  ) THEN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT valid_birthday_range 
    CHECK (
      birthday IS NULL OR 
      (
        birthday <= CURRENT_DATE - INTERVAL '13 years' AND 
        birthday >= CURRENT_DATE - INTERVAL '120 years'
      )
    );
  END IF;
END $$;

-- Step 4: Create indexes for efficient queries (useful for filtering/trust scoring)
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON public.profiles(gender);
CREATE INDEX IF NOT EXISTS idx_profiles_birthday ON public.profiles(birthday);

-- Step 5: Add helpful comments for documentation
COMMENT ON COLUMN public.profiles.gender IS 'User gender for trust and safety. Displayed to other users interested in the same events. Allowed values: male, female, non-binary, prefer-not-to-say, other';
COMMENT ON COLUMN public.profiles.birthday IS 'User date of birth for age verification and trust. Users must be at least 13 years old (COPPA compliance). Age (not exact date) displayed to other users interested in the same events.';

-- Step 6: Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND table_schema = 'public'
AND column_name IN ('gender', 'birthday')
ORDER BY column_name;

-- Note: The existing RLS policies will continue to work without modification
-- The "Users can update their own profile" policy already allows users to update all their fields
-- The SELECT policies will show these new fields just like other profile fields

