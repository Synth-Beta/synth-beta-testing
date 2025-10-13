-- Add error handling to email preferences trigger
-- This prevents signup failures if email_preferences has issues

CREATE OR REPLACE FUNCTION public.create_email_preferences_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO email_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the user signup
        RAISE WARNING 'Error creating email preferences for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the function was updated
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'create_email_preferences_for_new_user';

