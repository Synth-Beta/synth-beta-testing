-- ============================================
-- MIGRATE MONETIZATION DATA
-- ============================================
-- Migrates account_upgrade_requests and event_promotions
-- into monetization_tracking table
-- user_id always represents the account owner

-- Migrate account_upgrade_requests
INSERT INTO public.monetization_tracking (
  id,
  user_id,                    -- Account owner (the user requesting upgrade)
  transaction_type,
  related_entity_type,
  related_entity_id,          -- Same as user_id for upgrades
  transaction_tier,           -- Maps from requested_account_type
  transaction_status,         -- Maps from status
  workflow_status,            -- Maps from status
  reviewed_by,
  reviewed_at,
  rejection_reason,
  business_info,
  metadata,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),          -- New UUID
  aur.user_id,                -- Account owner
  'account_upgrade',
  'user',                     -- Related entity is the user
  aur.user_id,                -- Related entity ID is the same as user_id
  CASE aur.requested_account_type
    WHEN 'creator' THEN 'professional'
    WHEN 'business' THEN 'enterprise'
    ELSE 'professional'
  END as transaction_tier,
  CASE aur.status
    WHEN 'approved' THEN 'active'
    WHEN 'denied' THEN 'rejected'
    ELSE 'pending'
  END as transaction_status,
  CASE aur.status
    WHEN 'approved' THEN 'approved'
    WHEN 'denied' THEN 'denied'
    ELSE 'pending'
  END as workflow_status,
  aur.reviewed_by,
  aur.reviewed_at,
  aur.denial_reason,
  aur.business_info,
  jsonb_build_object(
    'original_table', 'account_upgrade_requests',
    'original_id', aur.id,
    'requested_account_type', aur.requested_account_type
  ) as metadata,
  aur.created_at,
  aur.updated_at
FROM public.account_upgrade_requests aur
ON CONFLICT DO NOTHING;

-- Migrate event_promotions
INSERT INTO public.monetization_tracking (
  id,
  user_id,                    -- Account owner (promoted_by_user_id)
  transaction_type,
  related_entity_type,
  related_entity_id,          -- event_id
  amount,                     -- price_paid
  currency,
  payment_status,
  stripe_payment_intent_id,
  transaction_tier,           -- promotion_tier
  transaction_status,         -- promotion_status
  starts_at,
  expires_at,
  targeting_config,           -- Combine target fields into JSONB
  metrics,                    -- Combine performance metrics into JSONB
  workflow_status,            -- Maps from promotion_status
  reviewed_by,                -- reviewed_by_admin_id
  reviewed_at,
  review_notes,               -- admin_notes
  rejection_reason,
  metadata,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),          -- New UUID
  ep.promoted_by_user_id,     -- Account owner (who owns/promotes the event)
  'event_promotion',
  'event',                    -- Related entity is the event
  ep.event_id,                -- Related entity ID is the event_id
  ep.price_paid,
  COALESCE(ep.currency, 'USD'),
  COALESCE(ep.payment_status, 'pending'),
  ep.stripe_payment_intent_id,
  ep.promotion_tier,
  CASE ep.promotion_status
    WHEN 'active' THEN 'active'
    WHEN 'pending' THEN 'pending'
    WHEN 'paused' THEN 'paused'
    WHEN 'expired' THEN 'expired'
    WHEN 'rejected' THEN 'rejected'
    ELSE 'pending'
  END as transaction_status,
  ep.starts_at,
  ep.expires_at,
  jsonb_build_object(
    'target_cities', COALESCE(ep.target_cities, ARRAY[]::TEXT[]),
    'target_genres', COALESCE(ep.target_genres, ARRAY[]::TEXT[]),
    'target_age_min', ep.target_age_min,
    'target_age_max', ep.target_age_max
  ) as targeting_config,
  jsonb_build_object(
    'impressions', COALESCE(ep.impressions, 0),
    'clicks', COALESCE(ep.clicks, 0),
    'conversions', COALESCE(ep.conversions, 0)
  ) as metrics,
  CASE ep.promotion_status
    WHEN 'active' THEN 'approved'
    WHEN 'pending' THEN 'pending'
    WHEN 'rejected' THEN 'denied'
    ELSE 'pending'
  END as workflow_status,
  ep.reviewed_by_admin_id,
  ep.reviewed_at,
  ep.admin_notes,
  ep.rejection_reason,
  jsonb_build_object(
    'original_table', 'event_promotions',
    'original_id', ep.id
  ) as metadata,
  ep.created_at,
  ep.updated_at
FROM public.event_promotions ep
ON CONFLICT DO NOTHING;

-- VERIFICATION QUERY
SELECT 
  'account_upgrade' as transaction_type,
  COUNT(*) as migrated_count,
  (SELECT COUNT(*) FROM public.account_upgrade_requests) as source_count
FROM public.monetization_tracking
WHERE transaction_type = 'account_upgrade'

UNION ALL

SELECT 
  'event_promotion' as transaction_type,
  COUNT(*) as migrated_count,
  (SELECT COUNT(*) FROM public.event_promotions) as source_count
FROM public.monetization_tracking
WHERE transaction_type = 'event_promotion';

