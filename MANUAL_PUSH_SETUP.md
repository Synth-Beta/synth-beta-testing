# Manual Push Notification Setup (No Triggers)

Since database triggers are timing out, here's how to set up push notifications **without triggers**.

## Step 1: Verify Tables Exist

Run this first to make sure the tables exist:

```sql
-- Check if device_tokens table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'device_tokens'
);

-- Check if push_notification_queue table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'push_notification_queue'
);
```

If either returns `false`, run `20250202000000_create_push_notification_system.sql` first.

## Step 2: Create Simple Function (Run This)

Copy and paste this into Supabase SQL editor **one line at a time** if needed:

```sql
CREATE OR REPLACE FUNCTION queue_pending_push_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO push_notification_queue (
    user_id, device_token, notification_id, title, body, data, status
  )
  SELECT 
    n.user_id, dt.device_token, n.id, n.title, n.message, 
    COALESCE(n.data, '{}'), 'pending'
  FROM notifications n
  JOIN device_tokens dt ON dt.user_id = n.user_id
  WHERE n.is_read = false
    AND dt.is_active = true
    AND dt.platform = 'ios'
    AND NOT EXISTS (
      SELECT 1 FROM push_notification_queue pq
      WHERE pq.notification_id = n.id AND pq.device_token = dt.device_token
    )
  LIMIT 50;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 0;
END;
$$;
```

## Step 3: Update Backend Worker

The worker already has code for this. Just make sure this line is uncommented in `backend/push-notification-worker.js`:

```javascript
await queuePendingNotifications();
```

## Step 4: Test the Function

Test it manually:

```sql
SELECT queue_pending_push_notifications();
```

This should return the number of notifications queued.

## How It Works

1. **No trigger needed** - avoids timeout issues
2. **Backend worker calls function** - every 30 seconds
3. **Function queues notifications** - for unread notifications with active devices
4. **Worker sends pushes** - processes the queue

## Benefits

- ✅ No trigger timeout issues
- ✅ More control over when queueing happens
- ✅ Easier to debug
- ✅ Can be called on-demand

## Next Steps

1. Run the function creation SQL above
2. Start your backend worker: `npm run push:worker`
3. Create a test notification in your app
4. Check the queue: `SELECT * FROM push_notification_queue WHERE status = 'pending'`

That's it! No triggers needed.


