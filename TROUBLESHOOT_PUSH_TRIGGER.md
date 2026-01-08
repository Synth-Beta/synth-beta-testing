# Troubleshooting Push Notification Trigger Timeout

If you're getting connection timeout errors when creating the trigger, try these solutions:

## Solution 1: Run Function and Trigger Separately

**Step 1: Create function only**
```sql
CREATE OR REPLACE FUNCTION public.queue_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_read THEN RETURN NEW; END IF;
  INSERT INTO public.push_notification_queue (
    user_id, device_token, notification_id, title, body, data, status
  )
  SELECT NEW.user_id, dt.device_token, NEW.id, NEW.title, NEW.message, 
         COALESCE(NEW.data, '{}'::jsonb), 'pending'
  FROM public.device_tokens dt
  WHERE dt.user_id = NEW.user_id AND dt.is_active AND dt.platform = 'ios'
  LIMIT 1;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;
```

**Step 2: Create trigger separately**
```sql
DROP TRIGGER IF EXISTS trigger_queue_push_notification ON public.notifications;
CREATE TRIGGER trigger_queue_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NOT NEW.is_read)
  EXECUTE FUNCTION public.queue_push_notification();
```

## Solution 2: Use Minimal Version

Use the file: `supabase/migrations/20250202000001_trigger_push_notifications_minimal.sql`

This version:
- Only queues for 1 device (not all devices)
- Minimal error handling
- No comments or extra code

## Solution 3: Skip Trigger, Use Scheduled Function Instead

If triggers keep timing out, you can skip the trigger and use a scheduled function instead:

```sql
-- Function to process notifications that need push
CREATE OR REPLACE FUNCTION public.queue_pending_push_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.push_notification_queue (
    user_id, device_token, notification_id, title, body, data, status
  )
  SELECT DISTINCT
    n.user_id,
    dt.device_token,
    n.id,
    n.title,
    n.message,
    COALESCE(n.data, '{}'::jsonb),
    'pending'
  FROM public.notifications n
  INNER JOIN public.device_tokens dt ON dt.user_id = n.user_id
  WHERE n.is_read = false
    AND dt.is_active = true
    AND dt.platform = 'ios'
    AND NOT EXISTS (
      SELECT 1 FROM public.push_notification_queue pq
      WHERE pq.notification_id = n.id AND pq.device_token = dt.device_token
    )
  LIMIT 100;
END;
$$;
```

Then call this function periodically from your backend worker instead of using a trigger.

## Solution 4: Check for Table Locks

Before running the migration, check if the notifications table is locked:

```sql
SELECT 
  pid,
  usename,
  query,
  state,
  wait_event_type,
  wait_event
FROM pg_stat_activity
WHERE relation = 'notifications'::regclass
  AND state != 'idle';
```

If there are active queries, wait for them to complete.

## Solution 5: Verify Table Exists

Make sure the queue table exists first:

```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'push_notification_queue'
);
```

If false, run `20250202000000_create_push_notification_system.sql` first.

## Solution 6: Increase Timeout (Supabase Dashboard)

If using Supabase dashboard:
1. Go to SQL Editor
2. Check for timeout settings
3. Try running in smaller chunks

## Recommended Approach

1. **First**: Verify queue table exists
2. **Second**: Create function only (without trigger)
3. **Third**: Create trigger separately
4. **If still fails**: Use Solution 3 (scheduled function instead of trigger)


