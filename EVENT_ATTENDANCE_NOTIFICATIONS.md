# Event Attendance Notification System

## Overview

The Event Attendance Notification System automatically sends notifications to users who expressed interest in events after those events have passed, asking them to confirm whether they attended. This helps track event attendance and encourages users to write reviews.

---

## 🎯 Features

### Core Functionality
- ✅ **Automatic Notifications**: Sends reminders to users who marked interest in events after the event date passes
- ✅ **Smart Filtering**: Only notifies users who haven't already marked attendance or written a review
- ✅ **Duplicate Prevention**: Tracks sent notifications to avoid sending multiple reminders for the same event
- ✅ **Interactive UI**: Provides action buttons to mark attendance directly from the notification
- ✅ **Configurable Timing**: Send notifications X days after an event (default: 1 day)
- ✅ **Batch & Individual**: Supports both bulk notification sending and single-event targeting

### User Experience
- **Simple Actions**: Users can respond with "Yes, I attended" or "No, I didn't go"
- **Attendance Tracking**: Attendance is automatically recorded when confirmed
- **Review Prompting**: If user attended, they're encouraged to add a review
- **Dismissible**: Users can dismiss notifications they don't want to act on

---

## 📊 Database Schema

### New Table: `event_attendance_notifications_sent`

Tracks which notifications have been sent to prevent duplicates.

```sql
CREATE TABLE public.event_attendance_notifications_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.jambase_events(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);
```

**Key Features:**
- `UNIQUE(user_id, event_id)`: Prevents duplicate notifications for the same user-event combination
- Foreign key to `notifications` table for tracking
- Cascading deletes for data integrity

### Updated Table: `notifications`

The notification type constraint has been updated to include:
```sql
'event_attendance_reminder'
```

---

## 🔧 Core Functions

### 1. `send_attendance_reminder_notifications(days_after_event INTEGER)`

**Purpose**: Sends attendance reminder notifications for all eligible events.

**Parameters:**
- `days_after_event` (default: 1) - How many days after the event to send notifications

**Returns:**
```sql
TABLE (
  notifications_sent INTEGER,
  users_notified UUID[]
)
```

**Logic:**
1. Finds events that happened `days_after_event` days ago (with 7-day window)
2. Checks for users who:
   - Expressed interest in the event (`user_jambase_events` table)
   - Haven't marked attendance or written a review
   - Haven't been sent a notification yet
3. Creates notification with event details
4. Records notification in tracking table

**Example Usage:**
```sql
-- Send for events that happened yesterday
SELECT * FROM send_attendance_reminder_notifications(1);

-- Send for events that happened 2 days ago
SELECT * FROM send_attendance_reminder_notifications(2);
```

**Expected Output:**
```
notifications_sent | users_notified
-------------------|----------------------------------------
5                  | {uuid1, uuid2, uuid3, uuid4, uuid5}
```

---

### 2. `send_attendance_reminder_for_event(p_event_id UUID)`

**Purpose**: Sends attendance reminders for a specific event to all eligible users.

**Parameters:**
- `p_event_id` - The UUID of the event

**Returns:**
- `INTEGER` - Number of notifications sent

**Logic:**
1. Validates event exists
2. Finds all interested users who haven't marked attendance
3. Sends notification to each user
4. Records in tracking table

**Example Usage:**
```sql
-- Send for specific event
SELECT send_attendance_reminder_for_event('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
```

**Expected Output:**
```
send_attendance_reminder_for_event
------------------------------------
3
```

---

## 📈 Monitoring & Analytics

### View: `attendance_notification_stats`

Monitor notification sending patterns over time.

```sql
SELECT * FROM attendance_notification_stats;
```

**Output:**
```
date         | notifications_sent | unique_users | unique_events
-------------|-------------------|--------------|---------------
2025-02-15   | 12                | 10           | 8
2025-02-14   | 8                 | 7            | 5
2025-02-13   | 15                | 12           | 9
```

**Columns:**
- `date`: Day notifications were sent
- `notifications_sent`: Total notifications sent that day
- `unique_users`: Number of unique users notified
- `unique_events`: Number of unique events covered

---

## 🚀 Implementation

### TypeScript Types

**File:** `src/types/notifications.ts`

```typescript
export type NotificationType = 
  | 'event_attendance_reminder'
  | // ... other types

export interface NotificationData {
  event_attendance_reminder: {
    event_id: string;
    event_title: string;
    event_venue: string;
    event_date: string;
    artist_name?: string;
  };
  // ... other types
}
```

### Notification Service

**File:** `src/services/notificationService.ts`

**Key Methods:**

1. **`handleAttendanceReminderAction(notificationId, eventId, attended)`**
   - Marks user's attendance
   - Marks notification as read
   - Updates the UI

2. **`requiresAction(type)`**
   - Returns `true` for `event_attendance_reminder`
   - Used to show action buttons

3. **`getNotificationActions(type)`**
   - Returns action button configuration
   - For attendance reminders: "Yes, I attended", "No, I didn't go", "Dismiss"

4. **`getNotificationIcon(type)`**
   - Returns 📍 (MapPin icon) for attendance reminders

5. **`getNotificationColor(type)`**
   - Returns teal color scheme for attendance reminders

### UI Component

**File:** `src/components/notifications/NotificationItem.tsx`

**Features:**
- Displays event details from notification data
- Shows three action buttons for attendance reminders
- Handles attendance marking with loading states
- Shows success/error toasts
- Auto-dismisses notification after action

**Action Flow:**
1. User clicks "Yes, I attended"
2. Component calls `NotificationService.handleAttendanceReminderAction()`
3. Service marks attendance via `UserEventService.markUserAttendance()`
4. Notification marked as read
5. Success toast shown
6. Notification dismissed from UI

---

## ⏰ Automated Scheduling (Recommended)

### Using Supabase Cron Jobs

Add to your Supabase project:

```sql
-- Run daily at 10 AM UTC
SELECT cron.schedule(
  'send-attendance-reminders',
  '0 10 * * *',
  $$
  SELECT send_attendance_reminder_notifications(1);
  $$
);
```

### Using Vercel Cron (API Route)

**File:** `pages/api/cron/send-attendance-notifications.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase.rpc(
    'send_attendance_reminder_notifications',
    { days_after_event: 1 }
  );

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json(data);
}
```

**Vercel Configuration (vercel.json):**

```json
{
  "crons": [
    {
      "path": "/api/cron/send-attendance-notifications",
      "schedule": "0 10 * * *"
    }
  ]
}
```

---

## 🧪 Testing

### Manual Testing

1. **Create Test Data:**
```sql
-- Mark interest in a past event
INSERT INTO user_jambase_events (user_id, jambase_event_id)
VALUES (
  auth.uid(),
  (SELECT id FROM jambase_events WHERE event_date < now() - INTERVAL '1 day' LIMIT 1)
);
```

2. **Send Notification:**
```sql
SELECT send_attendance_reminder_notifications(1);
```

3. **Verify Notification:**
```sql
SELECT * FROM notifications 
WHERE type = 'event_attendance_reminder' 
ORDER BY created_at DESC 
LIMIT 5;
```

4. **Check Tracking:**
```sql
SELECT * FROM event_attendance_notifications_sent 
ORDER BY sent_at DESC 
LIMIT 5;
```

### Testing UI Flow

1. Navigate to notifications page
2. Verify notification appears with event details
3. Click "Yes, I attended"
4. Verify:
   - Success toast appears
   - Notification disappears
   - Attendance recorded in `user_reviews` table

### Verify Duplicate Prevention

```sql
-- Try sending again for same event
SELECT send_attendance_reminder_for_event('your-event-uuid');

-- Should return 0 (no notifications sent)
```

---

## 🔍 Troubleshooting

### Issue: No notifications being sent

**Check:**
1. Are there events that passed 1-7 days ago?
```sql
SELECT COUNT(*) FROM jambase_events 
WHERE event_date < (now() - INTERVAL '1 day')
AND event_date > (now() - INTERVAL '8 days');
```

2. Are users interested in those events?
```sql
SELECT COUNT(*) FROM user_jambase_events uje
JOIN jambase_events je ON uje.jambase_event_id = je.id
WHERE je.event_date < (now() - INTERVAL '1 day');
```

3. Have notifications already been sent?
```sql
SELECT COUNT(*) FROM event_attendance_notifications_sent
WHERE sent_at > now() - INTERVAL '7 days';
```

### Issue: Duplicate notifications

**Check tracking table:**
```sql
SELECT user_id, event_id, COUNT(*) 
FROM event_attendance_notifications_sent
GROUP BY user_id, event_id
HAVING COUNT(*) > 1;
```

If duplicates exist, the UNIQUE constraint might not be enforced. Verify:
```sql
SELECT * FROM pg_constraint 
WHERE conrelid = 'event_attendance_notifications_sent'::regclass;
```

### Issue: Attendance not being marked

**Check logs:**
- Open browser console when clicking attendance button
- Look for errors in `handleAttendanceAction`

**Verify permissions:**
```sql
-- Check if user can update user_reviews
SELECT * FROM pg_policies 
WHERE tablename = 'user_reviews';
```

---

## 📋 Maintenance Tasks

### Weekly
- Review `attendance_notification_stats` for patterns
- Check for failed notifications (notifications with no tracking record)

### Monthly
- Clean up old tracking records (optional):
```sql
DELETE FROM event_attendance_notifications_sent
WHERE sent_at < now() - INTERVAL '90 days';
```

### Monitoring Queries

**Notification Success Rate:**
```sql
SELECT 
  COUNT(DISTINCT eans.notification_id) as sent,
  COUNT(DISTINCT n.id) FILTER (WHERE n.is_read) as read,
  ROUND(100.0 * COUNT(DISTINCT n.id) FILTER (WHERE n.is_read) / COUNT(DISTINCT eans.notification_id), 2) as read_rate
FROM event_attendance_notifications_sent eans
LEFT JOIN notifications n ON eans.notification_id = n.id
WHERE eans.sent_at > now() - INTERVAL '7 days';
```

**Average Time to Response:**
```sql
SELECT 
  AVG(EXTRACT(EPOCH FROM (ur.created_at - eans.sent_at))/3600) as avg_hours_to_response
FROM event_attendance_notifications_sent eans
JOIN user_reviews ur ON ur.user_id = eans.user_id AND ur.event_id = eans.event_id
WHERE ur.was_there = true;
```

---

## 🔄 Related Features

- **Event Interest System**: Users mark interest in upcoming events
- **Attendance Tracking**: Users mark if they attended events
- **Review System**: Users can write reviews after attending
- **Profile Stats**: Attendance counts shown on user profiles

---

## 🎓 Best Practices

1. **Timing**: Send notifications 1-2 days after events, not immediately (allows travel time)
2. **Frequency**: Don't send more than once per event per user
3. **Content**: Keep notification messages friendly and concise
4. **Actions**: Provide clear, simple action buttons
5. **Follow-up**: After marking attendance, guide users to write reviews

---

## 📝 Migration File

**Location:** `supabase/migrations/20250215000000_event_attendance_notifications.sql`

To apply the migration:
```bash
# Using Supabase CLI
supabase db push

# Or manually in Supabase Dashboard > SQL Editor
# Copy and paste the migration file contents
```

---

## 🚨 Important Notes

- Notifications are only sent to users who expressed interest via `user_jambase_events`
- Attendance tracking prevents the event from showing in "Interested Events" list
- Users can still write reviews without marking attendance first
- The system respects user email preferences (if implemented)
- Notifications can be dismissed without taking action

---

## 🎉 Success Metrics

Track these metrics to measure feature success:

1. **Notification Engagement Rate**: % of users who respond to notifications
2. **Attendance Confirmation Rate**: % who mark "Yes, I attended"
3. **Review Conversion Rate**: % who write reviews after marking attendance
4. **Response Time**: Average time from notification to response
5. **Dismissal Rate**: % who dismiss without taking action

---

## 📞 Support

For issues or questions:
- Check troubleshooting section above
- Review database logs for errors
- Check browser console for client-side errors
- Verify RLS policies are not blocking operations

---

**Version:** 1.0.0  
**Last Updated:** February 15, 2025  
**Migration File:** `20250215000000_event_attendance_notifications.sql`

