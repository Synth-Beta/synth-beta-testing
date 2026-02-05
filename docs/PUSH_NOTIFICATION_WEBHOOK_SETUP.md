# Push Notification Webhook Setup (No Worker Required)

This app sends Apple push notifications via a **Supabase Database Webhook** instead of a long-running worker. When a row is inserted into `notifications`, Supabase calls a Vercel serverless function, which sends to APNs.

## Architecture

```
notification inserted → Supabase webhook POST → /api/push-notification-webhook → APNs → iPhone
```

## Setup Steps

### 1. Configure Vercel Environment Variables

In [Vercel Dashboard](https://vercel.com) → Project → Settings → Environment Variables, add:

| Variable | Value | Required |
|----------|-------|----------|
| `SUPABASE_URL` | `https://glpiolbrafqikqhnseto.supabase.co` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | Yes |
| `APNS_KEY_CONTENT` | Base64-encoded contents of your .p8 key file | Yes* |
| `APNS_KEY_PATH` | Path to .p8 file (alternative to APNS_KEY_CONTENT) | Yes* |
| `APNS_KEY_ID` | `J764D4P5DU` (or your Key ID) | Yes |
| `APNS_TEAM_ID` | Your Apple Team ID | Yes |
| `APNS_BUNDLE_ID` | `com.tejpatel.synth` | Yes |
| `APNS_PRODUCTION` | `true` for App Store/TestFlight, `false` for dev builds | Yes |

*Use either `APNS_KEY_CONTENT` or `APNS_KEY_PATH`. For Vercel, `APNS_KEY_CONTENT` is recommended (no file upload).

**To get APNS_KEY_CONTENT (base64):**
```bash
# On Mac/Linux
base64 -i AuthKey_J764D4P5DU.p8 | tr -d '\n' > apns_key_base64.txt
# Copy the contents of apns_key_base64.txt into Vercel env var
```

### 2. Create Supabase Database Webhook

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Go to **Database** → **Webhooks**
3. Click **Create a new webhook**
4. Configure:
   - **Name:** `push-notification-webhook`
   - **Table:** `notifications`
   - **Events:** Check **Insert**
   - **Type:** `HTTP Request`
   - **Method:** `POST`
   - **URL:** `https://YOUR_VERCEL_URL/api/push-notification-webhook`
     - Replace `YOUR_VERCEL_URL` with your deployed Vercel URL (e.g. `synth-beta-testing.vercel.app`)

5. (Optional) Add **HTTP Headers** for verification:
   - `Authorization: Bearer YOUR_SECRET` — use a shared secret and validate it in the webhook handler if desired
6. Save the webhook

### 3. Redeploy Vercel

Redeploy the project so the new env vars and API route are applied.

## Verification

1. **Insert a test notification** in Supabase:
   ```sql
   INSERT INTO notifications (user_id, type, title, message, data)
   SELECT id, 'event_interest', 'Test', 'Test push notification', '{}'
   FROM users LIMIT 1;
   ```

2. **Check webhook logs** in Supabase Dashboard → Database → Webhooks → your webhook → Logs

3. **Check device** — if the user has push permissions and a registered device token, the notification should appear on the iPhone within seconds

## Requirements

- User must have push notification permission granted in the app
- Device token must be registered in `device_tokens` table (platform='ios', is_active=true)
- `user_settings_preferences.enable_push_notifications` must not be false for the user
- App must be built for production (TestFlight/App Store) when using `APNS_PRODUCTION=true`

## Troubleshooting

| Issue | Check |
|-------|-------|
| No push on device | `device_tokens` has row for user? Push permission granted? |
| Webhook returns 500 | Vercel logs; env vars set? APNS_KEY_CONTENT or APNS_KEY_PATH valid? |
| Webhook returns 200 but skipped | User has no device tokens, or push disabled in preferences |
| APNs errors | Key ID, Team ID, Bundle ID correct? Using production for App Store builds? |

For a full step-by-step verification runbook, see [PUSH_NOTIFICATION_VERIFICATION_RUNBOOK.md](PUSH_NOTIFICATION_VERIFICATION_RUNBOOK.md).

## Daily Event Summary Notifications

The app sends **summary** push notifications instead of individual "new event" notifications:

- **follows_new_events_summary**: "Artists and venues you follow announced X new events today"
- **friends_event_interest_summary**: "Your friends expressed interest in X new events today - don't let them go alone!"
- **bucket_list_new_events_summary**: "Your bucket list artist/venue has a new event!" (or "X new events")

To schedule daily runs (9:00 AM UTC):

1. Enable `pg_cron` in Supabase Dashboard → Database → Extensions
2. Run in SQL Editor:
   ```sql
   SELECT cron.schedule('daily-event-summary-notifications', '0 9 * * *', 'SELECT public.send_daily_event_summary_notifications();');
   ```

To test manually:
```sql
SELECT public.send_daily_event_summary_notifications();
```
