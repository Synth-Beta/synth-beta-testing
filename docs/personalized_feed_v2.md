## Personalized Feed v2

This document describes how the next version of the personalized event feed will score and return events using the new Postgres schema (`events`, `relationships`, `user_preferences`, etc.). The goal is to replace the legacy JamBase-only function with one that combines follows, preferences, social signals, and geo filters in a single RPC.

---

### Inputs
```
get_personalized_feed_v2(
  p_user_id        UUID,
  p_limit          INT DEFAULT 50,
  p_offset         INT DEFAULT 0,
  p_include_past   BOOLEAN DEFAULT FALSE,
  p_city_lat       NUMERIC DEFAULT NULL,
  p_city_lng       NUMERIC DEFAULT NULL,
  p_radius_miles   NUMERIC DEFAULT 50,
  p_genres         TEXT[] DEFAULT NULL,
  p_following_only BOOLEAN DEFAULT FALSE
)
```

### Data sources
| Table / view              | Purpose                                                                                               |
|---------------------------|-------------------------------------------------------------------------------------------------------|
| `events`                  | Canonical event data (title, artists, venues, lat/lng, promos, pricing, etc.)                         |
| `relationships`           | Single source for friendships, artist follows, venue follows, event interests                         |
| `user_preferences`        | Preferred genres/artists/venues, plus JSON blobs (`genre_preferences`, `music_preference_signals`)     |
| `user_jambase_events`     | Optional legacy store for interests (used only if still populated)                                     |

### High-level flow
1. **Fetch preferences**: Load `user_preferences` for `p_user_id` (genres, artist UUIDs, venue names, music signals).
2. **Fetch follows & friends** (from `relationships`):
   - Artist follows → match on `events.artist_uuid` or `events.artist_id`.
   - Venue follows → match on `events.venue_uuid` / `events.venue_id`.
   - Friend list → `relationships` rows where `related_entity_type = 'user'`, `relationship_type = 'friend'`, `status = 'accepted'`.
   - Friend event interests → `relationships` rows where `related_entity_type = 'event'` and `relationship_type IN ('going','maybe')`.
3. **Candidate events**: Select upcoming events from `events` with filters:
   - `event_date >= NOW()` unless `p_include_past`.
   - `p_genres` filter via `events.genres && p_genres`.
   - Distance filter when `p_city_lat/lng` provided (Haversine ≤ `p_radius_miles`).
4. **Score each event** by combining:
   - Genre affinity (overlap with `preferred_genres` and `genre_preferences` JSON).
   - Artist follow affinity (preferred artists and `relationships` follow records).
   - Venue follow affinity (preferred venues + venue follows).
   - Social proof (count of friends interested in the event).
   - User interest flag (if user has already RSVP’d/followed the event).
   - Recency (boost near-term shows).
   - Promotion tiers from `events.promoted` / `promotion_tier`.
   - Distance penalty based on miles from `p_city_lat/lng`.
5. **Filtering logic**:
   - If `p_following_only = TRUE`, keep events where the user follows the artist/venue or has at least one friend interested.
6. **Output**:
   - Same shape the UI already expects (event data plus `relevance_score`, `friends_interested_count`, `user_is_interested`, `distance_miles`, etc.), ordered by score then date with pagination.

### Scoring blueprint
| Component                  | Calculation sketch                                                                                           |
|---------------------------|---------------------------------------------------------------------------------------------------------------|
| Base score                | Start at ~30                                                                                                   |
| Genre affinity            | + up to 25 based on `%` overlap between `events.genres` and user’s preferred/weighted genres                  |
| Artist follow affinity    | +20 if artist is followed / in preferred list                                                                  |
| Venue affinity            | +10 if venue is in preferred venues / followed                                                                |
| Friend interest           | + (friends_interested_count × 5), capped (e.g., +20)                                                           |
| User interest             | +10 if the user already marked interest                                                                       |
| Promotion tier            | +10 basic / +18 premium / +25 featured                                                                         |
| Recency                   | +10 for shows within 7 days, +6 within 30 days                                                                 |
| Distance penalty          | − min(distance / 5, 20)                                                                                        |

### Implementation notes
1. **New RPC**: Create `get_personalized_feed_v2` (or reuse `get_personalized_events_feed` after dropping old overloads) with the signature above. Use PL/pgSQL to assemble the scoring CTEs, similar to the prior migration but referencing `relationships` + `user_preferences`.
2. **Frontend**: `personalizedFeedService` already sends `p_city_lat/lng`, `p_radius`, genres, etc. Point it to the new RPC once deployed and remove the fallback call to legacy functions.
3. **Deployment**:
   - Drop legacy overloads to avoid PostgREST conflicts.
   - `GRANT EXECUTE` to `authenticated`.
   - `SELECT pg_notify('pgrst','reload schema');` after deployment.

This new feed uses the single unifying `relationships` table plus the richer `user_preferences` to produce relevant events even as the schema evolves away from JamBase-only sources.