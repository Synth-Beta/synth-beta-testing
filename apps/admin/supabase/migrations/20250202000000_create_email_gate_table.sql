-- Create table for email gate tracking
CREATE TABLE IF NOT EXISTS public.email_gate_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Add index for faster lookups by IP
  CONSTRAINT email_gate_entries_ip_unique UNIQUE (ip_address)
);

-- Create index on email for analytics queries
CREATE INDEX IF NOT EXISTS idx_email_gate_entries_email ON public.email_gate_entries(email);

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_email_gate_entries_created_at ON public.email_gate_entries(created_at);

-- Add RLS policies
ALTER TABLE public.email_gate_entries ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (since they're not authenticated yet)
CREATE POLICY "Allow anonymous insert" ON public.email_gate_entries
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anyone to check if their IP exists
CREATE POLICY "Allow anonymous select by IP" ON public.email_gate_entries
  FOR SELECT
  TO anon
  USING (true);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_email_gate_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_email_gate_entries_updated_at
  BEFORE UPDATE ON public.email_gate_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_email_gate_entries_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.email_gate_entries IS 'Stores email addresses and IP addresses for users who have accessed the site, used for email gate functionality';

