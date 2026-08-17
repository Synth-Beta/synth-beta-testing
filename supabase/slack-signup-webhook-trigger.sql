-- Optional: real-time Slack signup alerts via Database Webhook trigger.
-- The app now also alerts from the client + PM digest catch-up, so this is
-- belt-and-suspenders, not required for alerts to work.
--
-- Run in Supabase SQL editor. Replace <<SLACK_SIGNUP_WEBHOOK_SECRET>> with
-- the same value as Vercel SLACK_SIGNUP_WEBHOOK_SECRET / .env.local.
-- Do not commit the filled-in secret.

DROP TRIGGER IF EXISTS "slack-signup-alert" ON public.users;

CREATE TRIGGER "slack-signup-alert"
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://join.getsynth.app/api/slack-signup-webhook',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<<SLACK_SIGNUP_WEBHOOK_SECRET>>"}',
    '{}',
    '5000'
  );
