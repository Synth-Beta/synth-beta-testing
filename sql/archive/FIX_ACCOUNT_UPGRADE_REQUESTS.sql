-- Quick fix: Add missing columns to account_upgrade_requests table
-- Run this if you just need to fix the immediate error

ALTER TABLE public.account_upgrade_requests 
ADD COLUMN IF NOT EXISTS admin_notes TEXT,
ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Verify it worked
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'account_upgrade_requests'
ORDER BY column_name;

