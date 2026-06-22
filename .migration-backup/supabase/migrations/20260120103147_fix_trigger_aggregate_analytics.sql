-- ============================================
-- FIX TRIGGER: Update trigger to handle missing function gracefully
-- ============================================
-- The trigger_aggregate_analytics_on_interaction trigger calls aggregate_daily_analytics()
-- which was dropped when analytics_daily was replaced with a materialized view.
-- Since analytics are now computed via materialized view (refreshed on schedule),
-- we update the trigger function to be a no-op instead of failing.
-- This ensures interactions can still be inserted without errors.
-- ============================================

BEGIN;

-- Update the trigger function to be a no-op (don't fail if function doesn't exist)
-- This prevents INSERT failures while maintaining trigger compatibility
CREATE OR REPLACE FUNCTION public.trigger_aggregate_analytics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- No-op: Analytics are now computed via materialized view (analytics_daily_mv)
  -- which should be refreshed on a schedule using: SELECT refresh_analytics_daily();
  -- The old aggregate_daily_analytics() function was removed.
  -- This trigger function remains to avoid breaking existing trigger definitions,
  -- but it no longer performs any aggregation.
  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists (in case it was dropped)
DROP TRIGGER IF EXISTS trigger_aggregate_analytics_on_interaction ON public.interactions;
CREATE TRIGGER trigger_aggregate_analytics_on_interaction
  AFTER INSERT ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_aggregate_analytics();

COMMENT ON FUNCTION public.trigger_aggregate_analytics() IS 
'No-op trigger function for interactions table. Analytics are computed via analytics_daily_mv materialized view (refresh with: SELECT refresh_analytics_daily();)';

COMMIT;
