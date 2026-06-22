-- ============================================
-- ADD AGE VERIFICATION AND PARENTAL CONTROLS
-- ============================================
-- This migration adds age verification and parental control features
-- to meet Apple App Store requirements for apps with In-App Controls.
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: ADD COLUMNS TO USERS TABLE
-- ============================================

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS age_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_minor BOOLEAN,
ADD COLUMN IF NOT EXISTS parental_controls_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS dm_restricted BOOLEAN DEFAULT FALSE;

-- ============================================
-- STEP 2: CREATE AGE CALCULATION FUNCTIONS
-- ============================================

-- Function to calculate age from birthday
CREATE OR REPLACE FUNCTION public.calculate_user_age(user_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  user_birthday DATE;
  calculated_age INTEGER;
BEGIN
  SELECT birthday INTO user_birthday
  FROM public.users
  WHERE user_id = user_uuid;
  
  IF user_birthday IS NULL THEN
    RETURN NULL;
  END IF;
  
  calculated_age := EXTRACT(YEAR FROM AGE(CURRENT_DATE, user_birthday));
  RETURN calculated_age;
END;
$$;

-- Function to check if user is minor (under 18)
CREATE OR REPLACE FUNCTION public.is_user_minor(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  user_age INTEGER;
BEGIN
  user_age := public.calculate_user_age(user_uuid);
  RETURN user_age IS NOT NULL AND user_age < 18;
END;
$$;

-- ============================================
-- STEP 3: UPDATE EXISTING USERS
-- ============================================
-- Set age_verified and is_minor based on existing birthday data

UPDATE public.users
SET 
  age_verified = CASE WHEN birthday IS NOT NULL THEN TRUE ELSE FALSE END,
  is_minor = CASE 
    WHEN birthday IS NOT NULL THEN 
      EXTRACT(YEAR FROM AGE(CURRENT_DATE, birthday)) < 18
    ELSE NULL
  END,
  parental_controls_enabled = CASE 
    WHEN birthday IS NOT NULL AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, birthday)) < 18 
    THEN TRUE 
    ELSE FALSE 
  END
WHERE birthday IS NOT NULL;

-- ============================================
-- STEP 4: CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_age_verified ON public.users(age_verified) WHERE age_verified = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_is_minor ON public.users(is_minor) WHERE is_minor = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_parental_controls ON public.users(parental_controls_enabled) WHERE parental_controls_enabled = TRUE;

-- ============================================
-- STEP 5: ADD COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN public.users.age_verified IS 'Indicates if the user has verified their age by providing a birthday. Required for Apple App Store compliance.';
COMMENT ON COLUMN public.users.is_minor IS 'Indicates if the user is under 18 years old. Automatically calculated from birthday.';
COMMENT ON COLUMN public.users.parental_controls_enabled IS 'Indicates if parental controls are enabled for this account. Automatically enabled for users under 18.';
COMMENT ON COLUMN public.users.dm_restricted IS 'If true, restricts direct messages to only mutual followers. Used for minor account safety.';

COMMENT ON FUNCTION public.calculate_user_age(UUID) IS 'Calculates the age of a user in years based on their birthday. Returns NULL if birthday is not set.';
COMMENT ON FUNCTION public.is_user_minor(UUID) IS 'Returns TRUE if the user is under 18 years old, FALSE otherwise. Returns NULL if birthday is not set.';

COMMIT;
