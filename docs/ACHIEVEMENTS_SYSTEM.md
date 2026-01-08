# Achievements System

## Overview

The achievements system consists of two main tables that track user achievements with bronze, silver, and gold tiers.

## Database Schema

### 1. `achievements` Table

Defines all available achievements with their tier requirements.

**Columns:**
- `id` (UUID, Primary Key)
- `achievement_key` (TEXT, Unique) - Identifier like 'genre_curator', 'genre_specialist'
- `name` (TEXT) - Display name, e.g., "Genre Curator"
- `description` (TEXT) - Full description
- `bronze_requirement` (TEXT) - Description of bronze requirement
- `bronze_goal` (INTEGER) - Numeric goal for bronze tier
- `silver_requirement` (TEXT) - Description of silver requirement
- `silver_goal` (INTEGER) - Numeric goal for silver tier
- `gold_requirement` (TEXT) - Description of gold requirement
- `gold_goal` (INTEGER) - Numeric goal for gold tier
- `category` (TEXT) - Optional grouping (e.g., 'exploration', 'specialization')
- `icon_name` (TEXT) - Icon identifier for UI
- `sort_order` (INTEGER) - Display order
- `is_active` (BOOLEAN) - Whether achievement is currently active
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### 2. `user_achievement_progress` Table

Tracks each user's progress toward each achievement.

**Columns:**
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key → auth.users)
- `achievement_id` (UUID, Foreign Key → achievements)
- `current_progress` (INTEGER) - Current count/value
- `highest_tier_achieved` (TEXT) - 'bronze', 'silver', or 'gold'
- `bronze_achieved_at` (TIMESTAMPTZ) - When bronze was first achieved
- `silver_achieved_at` (TIMESTAMPTZ) - When silver was first achieved
- `gold_achieved_at` (TIMESTAMPTZ) - When gold was first achieved
- `progress_metadata` (JSONB) - Detailed progress data (e.g., which genres, scenes)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Unique Constraint:** One progress record per user per achievement

## Achievement Definitions

### 1. Genre Curator
- **Bronze:** Attend shows in 3 genres
- **Silver:** Attend shows in 5 genres
- **Gold:** Attend shows in 8 genres

### 2. Genre Specialist
- **Bronze:** Attend 5 shows in one genre
- **Silver:** Attend 10 shows in one genre
- **Gold:** Attend 20 shows in one genre

### 3. Bucket List Starter
- **Bronze:** Attend 1 "bucket list" event
- **Silver:** Attend 3 "bucket list" events
- **Gold:** Attend 6 "bucket list" events

### 4. Intentional Explorer
- **Bronze:** Attend shows across 3 different scenes in one genre
- **Silver:** Attend shows across 5 different scenes in one genre
- **Gold:** Attend shows across 7 different scenes in one genre

### 5. Set Break Scholar
- **Bronze:** Review a show with set-level or performance detail 2 times
- **Silver:** Review a show with set-level or performance detail 5 times
- **Gold:** Review a show with set-level or performance detail 10 times

### 6. Album-to-Stage
- **Bronze:** Attend a live show after engaging with the studio release
- **Silver:** Do this with 3 releases
- **Gold:** Do this with 6 releases

### 7. Legacy Listener
- **Bronze:** Attend shows by artists active in 2 distinct decades
- **Silver:** Attend shows by artists active in 3 decades
- **Gold:** Attend shows by artists active in 4 decades

### 8. New Blood
- **Bronze:** Attend 2 debut or early-career performances
- **Silver:** Attend 5 debut or early-career performances
- **Gold:** Attend 10 debut or early-career performances

### 9. Full Spectrum
- **Bronze:** Attend both acoustic and high-energy performances
- **Silver:** Do this across 3 genres
- **Gold:** Do this across 5 genres

### 10. Return Engagement
- **Bronze:** Attend the same artist across 2 different tours or eras
- **Silver:** Attend across 3 tours or eras
- **Gold:** Attend across 5 tours or eras

## Implementation Notes

### Tracking Attendance
- Attendance is tracked via the `reviews` table where `was_there = true` or `review_text = 'ATTENDANCE_ONLY'`
- Events are linked to genres via the `events.genres` TEXT[] array

### Bucket List Events
- A "bucket list" event is one where the artist or venue is in the user's `bucket_list` table
- Check if `bucket_list.entity_type = 'artist'` or `'venue'` and `bucket_list.entity_id` matches the event

### Set-Level Detail Reviews
- Reviews with set-level detail have either:
  - `setlist` field populated (from Setlist.fm)
  - `custom_setlist` field populated (user-created)
  - `review_text` containing detailed performance information

### Scene Matching
- Events match scenes based on:
  - Genre overlap with `scenes.participating_genres`
  - Artist match with `scenes.participating_artists`
  - Venue match with `scenes.participating_venues`
  - City match with `scenes.participating_cities`

### Album-to-Stage Tracking
- Requires tracking user engagement with studio releases (may need additional table or metadata)
- Then matching attended events to those releases

### Artist Decades
- Requires artist metadata with active decades (may need to calculate from artist career start/end dates)

### Energy Level Classification
- "Acoustic" vs "high-energy" may need to be determined from:
  - Event metadata
  - Venue characteristics
  - Genre characteristics
  - User tags/feedback

## Next Steps

1. Create functions to calculate progress for each achievement type
2. Create triggers to update progress when relevant events occur (reviews created, attendance marked, etc.)
3. Create API endpoints to fetch user achievements
4. Create UI components to display achievements

## Migration

Run the migration file:
```bash
supabase/migrations/20250123000000_create_achievements_system.sql
```

This will:
- Create the `achievements` table
- Create the `user_achievement_progress` table
- Insert all 10 achievement definitions
- Set up indexes and RLS policies




