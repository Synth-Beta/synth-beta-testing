-- ============================================
-- VERIFY DEVICE TOKENS (Step 3)
-- ============================================
-- Run in Supabase SQL Editor to verify device tokens are registered.
-- Empty result = tokens not being registered (permissions, init flow, or RPC/RLS).
-- Rows present = tokens stored; delivery failure likely elsewhere.
-- ============================================

-- Active iOS device tokens (last 10)
SELECT 
  user_id,
  platform,
  is_active,
  app_version,
  created_at,
  updated_at
FROM device_tokens 
WHERE platform = 'ios' AND is_active = true 
ORDER BY created_at DESC 
LIMIT 10;

-- Count by platform
SELECT 
  platform,
  is_active,
  COUNT(*) as count
FROM device_tokens
GROUP BY platform, is_active
ORDER BY platform, is_active;
