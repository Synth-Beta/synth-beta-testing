-- Disable DB trigger push queue path; delivery is handled by Vercel webhook
-- (api/push-notification-webhook.ts) on notifications INSERT.
-- Prevents duplicate iOS pushes when both webhook and queue worker are active.

BEGIN;

DROP TRIGGER IF EXISTS trigger_queue_push_notification ON public.notifications;

COMMENT ON FUNCTION public.queue_push_notification() IS
  'Legacy queue function — trigger disabled 2026-06-24; use Vercel push webhook instead.';

COMMIT;
