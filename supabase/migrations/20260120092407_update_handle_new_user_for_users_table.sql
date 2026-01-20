-- ============================================
-- UPDATE handle_new_user TRIGGER FOR USERS TABLE
-- ============================================
-- This migration updates the handle_new_user() trigger to:
-- 1. Insert into public.users (not profiles) 
-- 2. Generate username from name (required field)
-- 3. Handle Apple Sign In user metadata
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: CREATE HELPER FUNCTION FOR USERNAME GENERATION
-- ============================================
-- This function generates a base username from a name, similar to the backfill script

CREATE OR REPLACE FUNCTION public.generate_base_username_from_name(name_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  base_username TEXT;
BEGIN
  IF name_input IS NULL OR name_input = '' THEN
    RETURN 'user';
  END IF;
  
  -- Convert to lowercase and remove special characters
  base_username := LOWER(TRIM(name_input));
  base_username := REGEXP_REPLACE(base_username, '[^a-z0-9\s]', '', 'g');
  
  -- Split by spaces and join
  base_username := REGEXP_REPLACE(base_username, '\s+', '', 'g');
  
  -- Ensure minimum length
  IF LENGTH(base_username) < 3 THEN
    base_username := base_username || 'user';
  END IF;
  
  -- Truncate to max 25 chars (before adding numbers)
  IF LENGTH(base_username) > 25 THEN
    base_username := SUBSTRING(base_username, 1, 25);
  END IF;
  
  RETURN base_username;
END;
$$;

-- ============================================
-- STEP 2: CREATE HELPER FUNCTION FOR USERNAME SANITIZATION
-- ============================================

CREATE OR REPLACE FUNCTION public.sanitize_username(username_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  sanitized TEXT;
BEGIN
  IF username_input IS NULL OR username_input = '' THEN
    RETURN '';
  END IF;
  
  sanitized := LOWER(TRIM(username_input));
  -- Replace spaces with underscores
  sanitized := REGEXP_REPLACE(sanitized, '\s+', '_', 'g');
  -- Remove invalid characters (keep only alphanumeric, underscore, period)
  sanitized := REGEXP_REPLACE(sanitized, '[^a-z0-9_.]', '', 'g');
  -- Remove leading/trailing underscores/periods
  sanitized := REGEXP_REPLACE(sanitized, '^[_.]+|[_.]+$', '', 'g');
  -- Replace consecutive underscores/periods with single character
  sanitized := REGEXP_REPLACE(sanitized, '[_.]{2,}', SUBSTRING(sanitized, 1, 1), 'g');
  
  RETURN sanitized;
END;
$$;

-- ============================================
-- STEP 3: CREATE HELPER FUNCTION TO GENERATE AVAILABLE USERNAME
-- ============================================
-- This function generates a unique username by checking for conflicts

CREATE OR REPLACE FUNCTION public.generate_available_username(base_name TEXT, exclude_user_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  base_username TEXT;
  sanitized_base TEXT;
  candidate_username TEXT;
  attempt INTEGER := 0;
  username_exists BOOLEAN;
BEGIN
  -- Generate base username from name
  base_username := public.generate_base_username_from_name(base_name);
  sanitized_base := public.sanitize_username(base_username);
  
  -- Ensure sanitized base meets minimum length
  IF LENGTH(sanitized_base) < 3 THEN
    sanitized_base := sanitized_base || 'user';
  END IF;
  
  -- Try the base username first
  candidate_username := sanitized_base;
  
  -- Check if username exists (excluding current user if provided)
  SELECT EXISTS(
    SELECT 1 FROM public.users 
    WHERE username = candidate_username 
    AND (exclude_user_id IS NULL OR user_id != exclude_user_id)
  ) INTO username_exists;
  
  -- If available, return it
  IF NOT username_exists THEN
    RETURN candidate_username;
  END IF;
  
  -- Try appending numbers (1-100)
  WHILE attempt < 100 LOOP
    attempt := attempt + 1;
    candidate_username := sanitized_base || attempt::TEXT;
    
    -- Check length constraint (max 30 chars)
    IF LENGTH(candidate_username) > 30 THEN
      -- Truncate base if needed
      sanitized_base := SUBSTRING(sanitized_base, 1, 30 - LENGTH(attempt::TEXT));
      candidate_username := sanitized_base || attempt::TEXT;
    END IF;
    
    -- Check if available
    SELECT EXISTS(
      SELECT 1 FROM public.users 
      WHERE username = candidate_username 
      AND (exclude_user_id IS NULL OR user_id != exclude_user_id)
    ) INTO username_exists;
    
    IF NOT username_exists THEN
      RETURN candidate_username;
    END IF;
  END LOOP;
  
  -- Fallback: add random suffix if all attempts failed
  candidate_username := sanitized_base || SUBSTRING(MD5(RANDOM()::TEXT), 1, 3);
  IF LENGTH(candidate_username) > 30 THEN
    candidate_username := SUBSTRING(candidate_username, 1, 30);
  END IF;
  
  RETURN candidate_username;
END;
$$;

-- ============================================
-- STEP 4: UPDATE handle_new_user() FUNCTION
-- ============================================
-- Update to use users table and generate username

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_name TEXT;
  generated_username TEXT;
BEGIN
  -- Extract name from user metadata
  -- Apple Sign In provides name in raw_user_meta_data->>'full_name' or raw_user_meta_data->>'name'
  -- Regular signups use raw_user_meta_data->>'name'
  user_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    SPLIT_PART(NEW.email, '@', 1),  -- Fallback to email prefix
    'user'  -- Final fallback
  );
  
  -- Generate available username
  generated_username := public.generate_available_username(user_name, NEW.id);
  
  -- Insert into public.users (not profiles)
  INSERT INTO public.users (
    user_id,
    name,
    username,
    bio,
    moderation_status,
    is_public_profile,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    user_name,
    generated_username,
    'Music lover looking to connect at events!',
    'good_standing',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;  -- Prevent duplicate inserts if trigger fires multiple times
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail user signup
    RAISE WARNING 'Error creating user profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================
-- STEP 5: VERIFY TRIGGER EXISTS AND IS CORRECT
-- ============================================

-- Drop and recreate trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON FUNCTION public.handle_new_user() IS 
'Automatically creates a public.users record when a new auth.users record is created. Generates username from name and handles Apple Sign In metadata.';

COMMENT ON FUNCTION public.generate_base_username_from_name(TEXT) IS 
'Generates a base username from a display name by converting to lowercase, removing special characters, and joining words.';

COMMENT ON FUNCTION public.sanitize_username(TEXT) IS 
'Sanitizes a username to match format requirements: lowercase, alphanumeric + underscore/period, 3-30 characters.';

COMMENT ON FUNCTION public.generate_available_username(TEXT, UUID) IS 
'Generates a unique username by checking for conflicts and appending numbers if needed. Returns a username that meets format requirements and is available.';

COMMIT;

