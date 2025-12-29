# Required Tables for Preferences V4 Feed

## Overview
The `get_preferences_v4_feed()` function needs access to the following tables. Please provide the **actual CREATE TABLE statements** for each table so I can update the SQL function to match your schema.

---

## Required Tables

### 1. **`public.events`** ✅ (You provided this)
**Status:** ✅ Schema provided
**Purpose:** Main events table
**Key Columns Needed:**
- `id` (UUID) - Primary key
- `title` (TEXT)
- `artist_id` (UUID) - References artists table
- `venue_id` (UUID) - References venues table
- `event_date` (TIMESTAMPTZ)
- `doors_time` (TIMESTAMPTZ)
- `description` (TEXT)
- `genres` (TEXT[])
- `venue_address`, `venue_city`, `venue_state`, `venue_zip`
- `latitude`, `longitude`
- `ticket_available`, `price_range`, `ticket_urls`
- `setlist` (JSONB)
- `tour_name`
- `created_at`, `updated_at`

---

### 2. **`public.artists`** ❓ (Need schema)
**Purpose:** Artist information
**Key Columns Needed:**
- `id` (UUID) - Primary key
- `name` (TEXT) - Artist name
- `genres` (TEXT[]) - Artist genres (optional but helpful)

**Please provide:**
```sql
CREATE TABLE public.artists (...);
```

---

### 3. **`public.venues`** ❓ (Need schema)
**Purpose:** Venue information
**Key Columns Needed:**
- `id` (UUID) - Primary key
- `name` (TEXT) - Venue name

**Please provide:**
```sql
CREATE TABLE public.venues (...);
```

---

### 4. **`public.user_preferences`** ✅ (Already created)
**Status:** ✅ Already exists (BCNF schema)
**Purpose:** Aggregated user preferences
**Key Columns:**
- `user_id` (UUID)
- `genre_preference_scores` (JSONB)
- `artist_preference_scores` (JSONB)
- `venue_preference_scores` (JSONB)
- `top_genres` (TEXT[])
- `top_artists` (UUID[])
- `top_venues` (UUID[])

---

### 5. **`public.user_preference_signals`** ✅ (Already created)
**Status:** ✅ Already exists
**Purpose:** Individual preference signals
**Key Columns:**
- `user_id` (UUID)
- `signal_type` (enum)
- `entity_type` (enum)
- `entity_id` (UUID)
- `entity_name` (TEXT)
- `signal_weight` (NUMERIC)
- `genre` (TEXT)
- `context` (JSONB)

---

### 6. **User Event Interest Table** ❓ (CRITICAL - Need to identify)
**Purpose:** Track which users are interested in which events
**Possible Table Names:**
- `public.user_jambase_events` ❌ (Doesn't exist)
- `public.event_interests` ❓
- `public.user_event_relationships` ❓
- `public.relationships` ❓ (with `related_entity_type = 'event'`)

**Key Columns Needed:**
- `user_id` (UUID)
- `event_id` (UUID) - References events.id
- `is_interested` (BOOLEAN) OR presence-based (row exists = interested)

**Please provide the CREATE TABLE statement for whichever table tracks user event interests.**

---

### 7. **`public.friends`** ❓ (Need schema)
**Purpose:** User friendships for social proof scoring
**Key Columns Needed:**
- `user1_id` (UUID)
- `user2_id` (UUID)
- `status` (TEXT) - e.g., 'accepted', 'pending'

**Please provide:**
```sql
CREATE TABLE public.friends (...);
```

---

### 8. **`public.users`** ❓ (Need schema)
**Purpose:** User information
**Key Columns Needed:**
- `user_id` (UUID) - Primary key
- (Other columns not critical for feed)

**Please provide:**
```sql
CREATE TABLE public.users (...);
```

---

## Current Issues

1. ❌ **`public.user_jambase_events` does not exist**
   - Need to identify the correct table name
   - Need the CREATE TABLE statement

2. ❓ **Missing table schemas:**
   - `public.artists`
   - `public.venues`
   - `public.friends`
   - `public.users`
   - User event interest table (whatever it's called)

---

## What I Need From You

Please provide the **CREATE TABLE** statements for:

1. ✅ `public.events` - Already provided
2. ❓ `public.artists` - Need schema
3. ❓ `public.venues` - Need schema
4. ❓ **User event interest table** - Need table name + schema
5. ❓ `public.friends` - Need schema
6. ❓ `public.users` - Need schema (or confirm it's `auth.users`)

Once you provide these, I'll update the SQL function to use the correct table names and column references.

---

## Quick Check Query

Run this to see what tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'events', 'artists', 'venues', 'users', 'friends',
    'user_jambase_events', 'event_interests', 
    'user_event_relationships', 'relationships'
  )
ORDER BY table_name;
```










