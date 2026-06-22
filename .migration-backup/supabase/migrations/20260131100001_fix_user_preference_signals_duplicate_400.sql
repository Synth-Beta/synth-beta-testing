-- Fix 400 on user_preference_signals: duplicate inserts (same user/event/interest)
-- were failing due to UNIQUE(user_id, signal_type, entity_type, entity_id, occurred_at).
-- Dropping this constraint allows multiple writes for the same logical signal;
-- aggregation (refresh_user_preferences_v5) still works by summing weights.

ALTER TABLE public.user_preference_signals
  DROP CONSTRAINT IF EXISTS user_preference_signals_user_signal_entity_unique;
