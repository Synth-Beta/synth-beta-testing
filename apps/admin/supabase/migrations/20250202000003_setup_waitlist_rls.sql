-- Setup RLS policies and permissions for Waitlist table
-- Note: Table already exists, this migration only sets up policies and permissions

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON public."Waitlist" USING btree (email) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON public."Waitlist" USING btree (created_at) TABLESPACE pg_default;

-- Create trigger function for updated_at if it doesn't exist
CREATE OR REPLACE FUNCTION update_waitlist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS update_waitlist_updated_at ON public."Waitlist";
CREATE TRIGGER update_waitlist_updated_at 
  BEFORE UPDATE ON public."Waitlist" 
  FOR EACH ROW
  EXECUTE FUNCTION update_waitlist_updated_at();

-- Enable RLS
ALTER TABLE public."Waitlist" ENABLE ROW LEVEL SECURITY;

-- Grant permissions to anon role
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT, SELECT, UPDATE ON public."Waitlist" TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Enable insert for anonymous users" ON public."Waitlist";
DROP POLICY IF EXISTS "Enable select for anonymous users" ON public."Waitlist";
DROP POLICY IF EXISTS "Enable update for anonymous users" ON public."Waitlist";

-- Create RLS policies for anonymous users
CREATE POLICY "Enable insert for anonymous users"
ON public."Waitlist"
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Enable select for anonymous users"
ON public."Waitlist"
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Enable update for anonymous users"
ON public."Waitlist"
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public."Waitlist" IS 'Stores email addresses and IP addresses for users who have joined the waitlist';

