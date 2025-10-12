# Event Attendance Notifications - Quick Start Guide

## 🚀 Quick Setup (5 Minutes)

### Step 1: Apply the Database Migration

Run the migration to set up the database schema:

```bash
# Using Supabase CLI
supabase db push

# OR manually in Supabase Dashboard
# 1. Go to SQL Editor
# 2. Open: supabase/migrations/20250215000000_event_attendance_notifications.sql
# 3. Click "Run"
```

### Step 2: Verify Installation

```sql
-- Check that the notification type is available
SELECT * FROM pg_constraint 
WHERE conname = 'notifications_type_check';

-- Check tracking table exists
SELECT COUNT(*) FROM event_attendance_notifications_sent;

-- Should return 0 (empty table)
```

---

## 🧪 Test the Feature

### Option A: Quick Manual Test

```sql
-- 1. Create a test past event (if you don't have one)
INSERT INTO jambase_events (
  id, title, artist_name, venue_name, event_date
) VALUES (
  gen_random_uuid(),
  'Test Concert',
  'Test Artist',
  'Test Venue',
  now() - INTERVAL '2 days'
) RETURNING id;

-- 2. Mark yourself as interested (replace YOUR_USER_ID and EVENT_ID)
INSERT INTO user_jambase_events (user_id, jambase_event_id)
VALUES ('YOUR_USER_ID', 'EVENT_ID_FROM_STEP_1');

-- 3. Send the notification
SELECT * FROM send_attendance_reminder_notifications(2);

-- 4. Check your notifications
SELECT * FROM notifications 
WHERE type = 'event_attendance_reminder' 
AND user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC;
```

### Option B: Test with Existing Event

```sql
-- Find a past event you're interested in
SELECT je.id, je.title, je.event_date
FROM jambase_events je
JOIN user_jambase_events uje ON je.id = uje.jambase_event_id
WHERE uje.user_id = auth.uid()
AND je.event_date < now() - INTERVAL '1 day'
AND je.event_date > now() - INTERVAL '7 days'
LIMIT 5;

-- Send notification for specific event (use ID from above)
SELECT send_attendance_reminder_for_event('EVENT_ID_HERE');

-- Check notification was created
SELECT * FROM notifications 
WHERE type = 'event_attendance_reminder' 
ORDER BY created_at DESC 
LIMIT 1;
```

---

## 📱 Test the UI

1. **Open the App**: Navigate to your notifications page
2. **Find the Notification**: Look for the attendance reminder (📍 icon, teal background)
3. **Test Actions**:
   - Click "Yes, I attended" → Should show success toast and mark attendance
   - OR Click "No, I didn't go" → Should show acknowledgment and mark notification read
   - OR Click "Dismiss" → Should just hide the notification

4. **Verify Attendance**:
```sql
-- Check attendance was recorded
SELECT * FROM user_reviews 
WHERE user_id = auth.uid() 
AND event_id = 'EVENT_ID_HERE'
AND was_there = true;
```

---

## ⚡ Quick Commands Reference

### Send Notifications

```sql
-- For events 1 day ago (default)
SELECT * FROM send_attendance_reminder_notifications();

-- For events 2 days ago
SELECT * FROM send_attendance_reminder_notifications(2);

-- For specific event
SELECT send_attendance_reminder_for_event('event-uuid');
```

### Monitor

```sql
-- View stats
SELECT * FROM attendance_notification_stats;

-- Check recent notifications
SELECT 
  n.created_at,
  n.user_id,
  n.title,
  n.is_read,
  n.data->>'event_title' as event
FROM notifications n
WHERE n.type = 'event_attendance_reminder'
ORDER BY n.created_at DESC
LIMIT 10;

-- Check notification success rate
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE is_read) as read,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_read) / COUNT(*), 2) as read_rate
FROM notifications
WHERE type = 'event_attendance_reminder'
AND created_at > now() - INTERVAL '7 days';
```

### Cleanup (Testing Only)

```sql
-- Delete test notifications
DELETE FROM notifications 
WHERE type = 'event_attendance_reminder'
AND user_id = auth.uid();

-- Reset tracking for testing
DELETE FROM event_attendance_notifications_sent
WHERE user_id = auth.uid();
```

---

## 🔄 Set Up Automation (Optional)

### Using Supabase Cron

```sql
-- Schedule daily at 10 AM UTC
SELECT cron.schedule(
  'attendance-reminders',
  '0 10 * * *',
  $$SELECT send_attendance_reminder_notifications(1);$$
);

-- Verify cron job
SELECT * FROM cron.job WHERE jobname = 'attendance-reminders';
```

### Using Vercel/Edge Functions

See full documentation in `EVENT_ATTENDANCE_NOTIFICATIONS.md`

---

## ✅ Verification Checklist

- [ ] Migration applied successfully
- [ ] Tracking table exists and is empty
- [ ] Can send notifications manually
- [ ] Notifications appear in UI with correct styling
- [ ] "Yes, I attended" marks attendance correctly
- [ ] "No, I didn't go" dismisses notification
- [ ] Duplicate notifications are prevented
- [ ] Stats view shows correct data

---

## 🐛 Common Issues

**Issue:** "Function does not exist"
```sql
-- Solution: Apply migration
supabase db push
```

**Issue:** No notifications sent
```sql
-- Check if you have eligible events
SELECT COUNT(*) FROM jambase_events 
WHERE event_date < now() - INTERVAL '1 day'
AND event_date > now() - INTERVAL '8 days';

-- Check if you're interested in any
SELECT COUNT(*) FROM user_jambase_events 
WHERE user_id = auth.uid();
```

**Issue:** UI not showing action buttons
- Clear browser cache
- Check that TypeScript files were rebuilt
- Verify notification type is exactly 'event_attendance_reminder'

---

## 📞 Need Help?

See full documentation: `EVENT_ATTENDANCE_NOTIFICATIONS.md`

Key sections:
- Troubleshooting
- Testing
- Monitoring & Analytics
- Implementation Details

---

**Ready to go!** 🎉

The system is now ready to use. For production, set up automated cron jobs to run daily.

