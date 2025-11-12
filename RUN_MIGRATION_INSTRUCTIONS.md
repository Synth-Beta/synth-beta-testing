# How to Run the Streaming Stats Migration

## Quick Answer: YES, you need to run SQL

The table `user_streaming_stats_summary` doesn't exist in your database, which is causing the 404 errors.

## Option 1: Supabase Dashboard (Easiest) ⭐

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click on **SQL Editor** in the left sidebar
4. Copy the entire contents of `CREATE_USER_STREAMING_STATS_TABLE.sql`
5. Paste it into the SQL Editor
6. Click **Run** (or press Cmd/Ctrl+Enter)
7. You should see: "Table created successfully! | 1"

## Option 2: Supabase CLI

If you have Supabase CLI installed:

```bash
cd /Users/sloiterstein/Desktop/Synth/synth-beta-testing-main
supabase db push
```

This will apply all pending migrations including the streaming stats table.

## What This Creates

- ✅ Table: `user_streaming_stats_summary`
- ✅ RLS Policies (users can only see their own stats)
- ✅ Indexes for performance
- ✅ Trigger to update `last_updated` timestamp
- ✅ Function for getting top artists for recommendations

## Verify It Worked

After running the SQL, you can verify in Supabase Dashboard:

1. Go to **Table Editor**
2. Look for `user_streaming_stats_summary` in the list
3. It should appear with columns: id, user_id, service_type, top_artists, top_genres, etc.

## After Running

Once the table is created, the streaming stats page will work correctly:
- No more 404 errors
- Stats will be stored permanently
- Users can sync their streaming data

