-- =============================================================================
-- 02 — FIX the auto-push trigger  (THE reason automatic push never fires)
-- =============================================================================
-- DIAGNOSIS (verified 2026-07-18): the "Push-notifcations" AFTER INSERT trigger on
-- public.notifications calls the webhook, but it is MISCONFIGURED two ways:
--
--   Live (broken):
--     URL     https://synth-beta-testing.vercel.app/api/push-notification-webhook   <- 404s
--     headers {"Content-type":"application/json"}                                   <- NO secret
--
--   pg_net response log proved every fire returns HTTP 404 (wrong URL / stale
--   deployment). Even if the URL were right, the missing x-webhook-secret header
--   would make the webhook return 401. So NO automatic notification is ever
--   delivered. (Manual `npm run push:test-webhook` works because it hits the
--   correct URL — https://join.getsynth.app/... — WITH the secret.)
--
--   Correct (per scripts/setup-push-webhook.mjs):
--     URL     https://join.getsynth.app/api/push-notification-webhook
--     headers x-webhook-secret = <same PUSH_WEBHOOK_SECRET as Vercel / .env.local>
--
-- =============================================================================
-- >>> RECOMMENDED FIX = the Supabase DASHBOARD (keeps the secret out of any file):
--       Supabase → Database → Webhooks → open "Push-notifcations"
--         • URL      -> https://join.getsynth.app/api/push-notification-webhook
--         • Method   -> POST
--         • HTTP Headers: add   x-webhook-secret = <your PUSH_WEBHOOK_SECRET>
--         • (leave the Content-Type header as-is)
--       Save. Then:  npm run push:test-webhook   (expect HTTP 200 on valid secret)
--
-- If you prefer SQL, use the block below. IMPORTANT: replace the placeholder with
-- your real secret ONLY in the Supabase SQL editor — do NOT commit the filled-in
-- value. (The header is stored in plaintext in the trigger definition regardless,
-- so the Dashboard route is preferred.)
-- =============================================================================

-- ---- STEP 0 (diagnostic) — see the current broken definition -----------------
SELECT tgname, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname='notifications'
  AND t.tgname='Push-notifcations' AND NOT t.tgisinternal;

-- ---- STEP 1 — drop the misconfigured trigger --------------------------------
DROP TRIGGER IF EXISTS "Push-notifcations" ON public.notifications;

-- ---- STEP 2 — recreate it with the correct URL + secret header ---------------
-- Replace <<PUT_PUSH_WEBHOOK_SECRET_HERE>> with the exact PUSH_WEBHOOK_SECRET value
-- from Vercel / .env.local (same one the manual test uses). Keep the quotes.
CREATE TRIGGER "Push-notifcations"
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://join.getsynth.app/api/push-notification-webhook',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<<PUT_PUSH_WEBHOOK_SECRET_HERE>>"}',
    '{}',
    '5000'
  );

-- ---- STEP 3 — verify ---------------------------------------------------------
SELECT pg_get_triggerdef(t.oid) AS new_def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname='notifications'
  AND t.tgname='Push-notifcations' AND NOT t.tgisinternal;

-- After a real notification insert, confirm the call now succeeds (200, not 404/401):
--   SELECT status_code, count(*), max(created) AS last_seen
--   FROM net._http_response
--   WHERE created > now() - interval '1 hour'
--   GROUP BY status_code ORDER BY last_seen DESC;
--
-- And that the webhook logged the attempt (from push-reliability file 01):
--   SELECT created_at, channel, status, error FROM public.push_delivery_log
--   ORDER BY created_at DESC LIMIT 20;

-- ROLLBACK (restore the old broken definition — not recommended):
--   DROP TRIGGER IF EXISTS "Push-notifcations" ON public.notifications;
--   CREATE TRIGGER "Push-notifcations" AFTER INSERT ON public.notifications
--     FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(
--       'https://synth-beta-testing.vercel.app/api/push-notification-webhook',
--       'POST', '{"Content-type":"application/json"}', '{}', '5000');
