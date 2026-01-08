# 🚀 APNs Quick Start Guide

Your APNs Auth Key is set up! Here's what to do next:

## ✅ What's Already Done

1. ✅ Auth Key secured: `~/.secrets/AuthKey_J764D4P5DU.p8`
2. ✅ Backend service created: `backend/push-notification-service.js`
3. ✅ Worker created: `backend/push-notification-worker.js`
4. ✅ Database trigger created: Migration ready to run
5. ✅ iOS app updated: `AppDelegate.swift` and `pushTokenService.ts`
6. ✅ `apn` package installed

## 📝 Next Steps (5 minutes)

### 1. Add Environment Variables

Add to your `.env.local` file (in project root):

```env
# Apple Push Notifications (APNs)
APNS_KEY_PATH=/Users/sloiterstein/.secrets/AuthKey_J764D4P5DU.p8
APNS_KEY_ID=J764D4P5DU
APNS_TEAM_ID=R6JXB945ND
NODE_ENV=development  # Change to 'production' for production
```

### 2. Run Database Migration

```bash
# Apply the push notification trigger
# Run this in Supabase dashboard SQL editor or via CLI
```

The migration file is: `supabase/migrations/20250202000001_trigger_push_notifications.sql`

### 3. Start Push Notification Worker

```bash
# From project root
npm run push:worker
```

Or run directly:
```bash
node backend/push-notification-worker.js
```

### 4. Test on Physical iOS Device

1. Build app on physical device (push doesn't work on simulator)
2. Log in
3. Check `device_tokens` table - should see your device token
4. Create a test notification - should receive push!

## 🎯 How It Works

```
User logs in
  ↓
iOS app registers for push
  ↓
Device token saved to database
  ↓
Notification created in database
  ↓
Trigger queues push notification
  ↓
Worker sends via APNs
  ↓
User receives push! 📱
```

## 🔍 Verify Setup

### Check Device Token Registration
```sql
SELECT * FROM device_tokens 
WHERE is_active = true;
```

### Check Push Queue
```sql
SELECT * FROM push_notification_queue 
WHERE status = 'pending';
```

## 📚 Full Documentation

See `docs/APPLE_PUSH_NOTIFICATIONS_SETUP.md` for complete details.

## 🆘 Troubleshooting

**Worker not starting?**
- Check environment variables are set
- Verify key file path is correct
- Check `apn` package is installed: `cd backend && npm list apn`

**No device tokens?**
- Must test on physical device (not simulator)
- Check notification permissions are granted
- Check app logs for errors

**Push not received?**
- Verify worker is running
- Check queue has pending items
- Verify `NODE_ENV` matches your APNs environment


