-- Add social media fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN instagram_handle text,
ADD COLUMN snapchat_handle text;

-- Update the profiles table to allow null values for new fields
-- (they're already nullable by default, but let's be explicit)
ALTER TABLE public.profiles 
ALTER COLUMN instagram_handle SET DEFAULT NULL,
ALTER COLUMN snapchat_handle SET DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.profiles.instagram_handle IS 'Instagram username without @ symbol';
COMMENT ON COLUMN public.profiles.snapchat_handle IS 'Snapchat username without @ symbol';
