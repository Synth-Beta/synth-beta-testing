# How User Preferences Stay Up-to-Date and Accurate

## Overview
The `user_preferences` table is **automatically updated in real-time** whenever any preference signal is inserted or updated. This happens through a **database trigger system** that ensures preferences are always current.

---

## 🔄 Automatic Update Flow

### 1. **Signal Insertion** (User Action)
When a user performs any action (follows artist, marks event interest, etc.):
```sql
INSERT INTO user_preference_signals (user_id, signal_type, entity_type, ...)
VALUES (...);
```

### 2. **Trigger Fires** (Automatic)
A database trigger automatically fires **AFTER INSERT OR UPDATE** on `user_preference_signals`:
```sql
CREATE TRIGGER trigger_auto_compute_preferences
  AFTER INSERT OR UPDATE ON public.user_preference_signals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_compute_preferences();
```

### 3. **Preference Computation** (Automatic)
The trigger function calls `compute_user_preferences()` which:
- Aggregates all signals for that user
- Calculates genre preference scores (sum of weights per genre)
- Calculates artist preference scores (sum of weights per artist)
- Calculates venue preference scores (sum of weights per venue)
- Determines top genres, artists, and venues
- Updates the `user_preferences` table

### 4. **Table Updated** (Automatic)
The `user_preferences` row is inserted or updated with the computed values.

---

## 📊 What Gets Computed

### Genre Preference Scores
```sql
-- Sums all signal weights grouped by genre
SELECT genre, SUM(signal_weight) as total_score
FROM user_preference_signals
WHERE user_id = ? AND genre IS NOT NULL
GROUP BY genre
```

**Result:** JSONB like `{"rock": 45.5, "jazz": 32.0, "pop": 18.5}`

### Artist Preference Scores
```sql
-- Sums all signal weights grouped by artist
SELECT entity_id, SUM(signal_weight) as total_score
FROM user_preference_signals
WHERE user_id = ? AND entity_type = 'artist' AND entity_id IS NOT NULL
GROUP BY entity_id
```

**Result:** JSONB like `{"uuid-1": 25.0, "uuid-2": 18.5}`

### Venue Preference Scores
```sql
-- Sums all signal weights grouped by venue
SELECT entity_id, SUM(signal_weight) as total_score
FROM user_preference_signals
WHERE user_id = ? AND entity_type = 'venue' AND entity_id IS NOT NULL
GROUP BY entity_id
```

**Result:** JSONB like `{"venue-uuid-1": 15.0, "venue-uuid-2": 12.0}`

### Top Lists
- **Top Genres:** Array of top 20 genres by score
- **Top Artists:** Array of top 50 artist UUIDs by score
- **Top Venues:** Array of top 30 venue UUIDs by score

---

## ⚡ Real-Time Updates

### Every Signal Insert = Instant Update
- ✅ User follows artist → Preferences updated immediately
- ✅ User marks event interest → Preferences updated immediately
- ✅ User creates review → Preferences updated immediately
- ✅ Streaming data synced → Preferences updated immediately
- ✅ User searches → Preferences updated immediately

### No Manual Refresh Needed
The system is **event-driven** - preferences are recalculated automatically whenever:
- A new signal is inserted
- An existing signal is updated
- The trigger fires for each row

---

## 🔍 How It Works (Technical Details)

### Trigger Function
```sql
CREATE OR REPLACE FUNCTION trigger_compute_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Automatically compute preferences for the user
  PERFORM compute_user_preferences(NEW.user_id);
  RETURN NEW;
END;
$$;
```

### Compute Function
```sql
CREATE OR REPLACE FUNCTION compute_user_preferences(p_user_id UUID)
RETURNS void
AS $$
BEGIN
  -- 1. Aggregate genre scores
  -- 2. Aggregate artist scores
  -- 3. Aggregate venue scores
  -- 4. Get top lists
  -- 5. Insert/Update user_preferences table
END;
$$;
```

### Upsert Logic
```sql
INSERT INTO user_preferences (
  user_id, genre_preference_scores, artist_preference_scores, ...
) VALUES (...)
ON CONFLICT (user_id) DO UPDATE SET
  genre_preference_scores = EXCLUDED.genre_preference_scores,
  artist_preference_scores = EXCLUDED.artist_preference_scores,
  ...
  last_computed_at = now();
```

---

## ✅ Accuracy Guarantees

### 1. **Always Current**
- Preferences are recalculated on every signal change
- No stale data - always reflects latest signals

### 2. **Complete Aggregation**
- All signals are included in calculations
- Weights are properly summed
- Top lists are correctly ordered

### 3. **Atomic Updates**
- Database transactions ensure consistency
- Either all updates succeed or none do

### 4. **Signal Count Tracking**
- `signal_count` tracks total number of signals
- `last_signal_at` tracks most recent signal time
- `last_computed_at` tracks when preferences were last computed

---

## 🎯 Performance Considerations

### Efficient Computation
- Aggregations use indexed columns (`user_id`, `entity_type`, `genre`)
- Top lists are limited (20 genres, 50 artists, 30 venues)
- Only processes signals for the specific user

### Trigger Performance
- Trigger fires per row (not per statement)
- Computation happens synchronously (ensures accuracy)
- Can be optimized with batching if needed

### Index Usage
- `user_id` index for fast user lookups
- `entity_type` + `entity_id` for entity filtering
- `genre` index for genre aggregations

---

## 🔧 Manual Refresh (If Needed)

If you ever need to manually recompute preferences:

```sql
-- For a specific user
SELECT compute_user_preferences('user-uuid');

-- For all users (batch)
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN SELECT DISTINCT user_id FROM user_preference_signals
  LOOP
    PERFORM compute_user_preferences(user_record.user_id);
  END LOOP;
END $$;
```

---

## 📈 Monitoring

### Check Last Computation Time
```sql
SELECT 
  user_id,
  signal_count,
  last_signal_at,
  last_computed_at,
  EXTRACT(EPOCH FROM (now() - last_computed_at)) as seconds_since_compute
FROM user_preferences
WHERE last_computed_at IS NOT NULL
ORDER BY last_computed_at DESC;
```

### Verify Accuracy
```sql
-- Compare signal count vs actual signals
SELECT 
  up.user_id,
  up.signal_count as stored_count,
  COUNT(ups.id) as actual_count,
  up.signal_count - COUNT(ups.id) as difference
FROM user_preferences up
LEFT JOIN user_preference_signals ups ON ups.user_id = up.user_id
GROUP BY up.user_id, up.signal_count
HAVING up.signal_count != COUNT(ups.id);
```

---

## 🎉 Summary

**The `user_preferences` table stays up-to-date automatically through:**

1. ✅ **Database triggers** that fire on every signal insert/update
2. ✅ **Automatic computation** that aggregates all signals
3. ✅ **Real-time updates** - no manual refresh needed
4. ✅ **Accurate aggregation** - all signals included with proper weights
5. ✅ **Atomic operations** - database ensures consistency

**You never need to manually update preferences - it happens automatically!**










