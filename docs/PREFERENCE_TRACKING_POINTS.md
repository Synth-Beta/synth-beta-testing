# Complete Preference Tracking Points Across Synth

## Overview
This document lists **every point** where user preferences should be tracked for the personalization engine. All interactions must insert signals into `user_preference_signals` table.

---

## 🎵 ARTIST PREFERENCES

### 1. Follow Artist
**Location:** `ArtistFollowButton.tsx`, `ArtistCard.tsx`, Artist profile pages
**Action:** User clicks "Follow" button
**Signal:** `artist_follow`
**Weight:** 7.0
**Implementation:**
```typescript
// After successful follow
await insert_artist_follow_signal(
  userId,
  artistId,
  artistName,
  artistGenres  // Extract from artist record
);
```

### 2. Unfollow Artist
**Location:** Same as above
**Action:** User clicks "Unfollow" button
**Signal:** `artist_unfollow`
**Weight:** -2.0 (negative signal)
**Implementation:**
```typescript
// After successful unfollow
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, signal_weight
) VALUES (
  userId, 'artist_unfollow', 'artist', artistId, artistName, -2.0
);
```

### 3. Search for Artist
**Location:** `ArtistSearchBox.tsx`, `RedesignedSearchPage.tsx`
**Action:** User searches for artist name
**Signal:** `artist_search`
**Weight:** 2.0
**Implementation:**
```typescript
// When search is performed
await insert_search_signal(
  userId,
  'artist',
  searchQuery,
  []  // Genres from search results if available
);
```

### 4. Review Artist
**Location:** Artist review forms (if implemented)
**Action:** User creates/updates review for artist
**Signal:** `artist_review`
**Weight:** 8.0
**Implementation:**
```typescript
// After review is saved
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, 
  signal_weight, genre, context
) VALUES (
  userId, 'artist_review', 'artist', artistId, artistName,
  8.0, artistGenres[0], jsonb_build_object('rating', rating)
);
```

---

## 🎪 EVENT PREFERENCES

### 5. Mark Event as Interested
**Location:** `EventDetailsModal.tsx`, `UnifiedFeed.tsx`, `EventMessageCard.tsx`
**Action:** User clicks "I'm Interested" or heart button
**Signal:** `event_interest`
**Weight:** 5.0
**Implementation:**
```typescript
// After interest is set
await insert_event_interest_signal(
  userId,
  eventId,
  eventName,
  eventGenres,  // Extract from event
  true  // is_interested
);
```

### 6. Remove Event Interest
**Location:** Same as above
**Action:** User removes interest
**Signal:** `event_interest_removed`
**Weight:** -2.0
**Implementation:**
```typescript
await insert_event_interest_signal(
  userId, eventId, eventName, eventGenres, false
);
```

### 7. Mark Event Attendance
**Location:** `EventDetailsModal.tsx`, `UserEventService.ts`
**Action:** User marks "I was there" / `was_there = true`
**Signal:** `event_attendance`
**Weight:** 10.0 (highest weight)
**Implementation:**
```typescript
// After attendance is marked
await insert_event_attendance_signal(
  userId,
  eventId,
  eventName,
  eventGenres,
  true  // was_there
);
```

### 8. Remove Event Attendance
**Location:** Same as above
**Action:** User unmarks attendance
**Signal:** `event_attendance_removed`
**Weight:** -3.0
**Implementation:**
```typescript
await insert_event_attendance_signal(
  userId, eventId, eventName, eventGenres, false
);
```

### 9. Create Event Review
**Location:** `EventReviewForm.tsx`, `ReviewService.ts`
**Action:** User submits event review
**Signal:** `event_review_created`
**Weight:** 8.0 (scaled by rating: weight * (rating/5))
**Implementation:**
```typescript
// After review is created
await insert_review_signal(
  userId,
  reviewId,
  eventId,
  eventName,
  rating,  // 1-5 stars
  eventGenres,
  'created'
);
```

### 10. Update Event Review
**Location:** Same as above
**Action:** User updates existing review
**Signal:** `event_review_updated`
**Weight:** 6.0
**Implementation:**
```typescript
await insert_review_signal(
  userId, reviewId, eventId, eventName, rating, eventGenres, 'updated'
);
```

### 11. Delete Event Review
**Location:** Same as above
**Action:** User deletes review
**Signal:** `event_review_deleted`
**Weight:** -4.0
**Implementation:**
```typescript
await insert_review_signal(
  userId, reviewId, eventId, eventName, null, eventGenres, 'deleted'
);
```

### 12. Search for Event
**Location:** `EventSearch.tsx`, `RedesignedSearchPage.tsx`
**Action:** User searches for events
**Signal:** `event_search`
**Weight:** 2.0
**Implementation:**
```typescript
await insert_search_signal(
  userId,
  'event',
  searchQuery,
  []  // Genres from search results
);
```

### 13. Click Ticket Link
**Location:** `EventDetailsModal.tsx`, Event cards
**Action:** User clicks ticket purchase link
**Signal:** `event_ticket_click`
**Weight:** 4.0
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, genre, context
) VALUES (
  userId, 'event_ticket_click', 'event', eventId, eventName,
  4.0, eventGenres[0], jsonb_build_object('ticket_url', ticketUrl)
);
```

---

## 🏢 VENUE PREFERENCES

### 14. Follow Venue
**Location:** `VenueFollowButton.tsx`, Venue profile pages
**Action:** User follows venue
**Signal:** `venue_follow`
**Weight:** 7.0
**Implementation:**
```typescript
// After follow
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, signal_weight
) VALUES (
  userId, 'venue_follow', 'venue', venueId, venueName, 7.0
);
```

### 15. Unfollow Venue
**Location:** Same as above
**Action:** User unfollows venue
**Signal:** `venue_unfollow`
**Weight:** -2.0
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, signal_weight
) VALUES (
  userId, 'venue_unfollow', 'venue', venueId, venueName, -2.0
);
```

### 16. Review Venue
**Location:** Venue review forms (if implemented)
**Action:** User creates venue review
**Signal:** `venue_review`
**Weight:** 8.0
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, context
) VALUES (
  userId, 'venue_review', 'venue', venueId, venueName,
  8.0, jsonb_build_object('rating', rating)
);
```

### 17. Search for Venue
**Location:** `VenueSearchBox.tsx`, `RedesignedSearchPage.tsx`
**Action:** User searches for venue
**Signal:** `venue_search`
**Weight:** 2.0
**Implementation:**
```typescript
await insert_search_signal(userId, 'venue', searchQuery, []);
```

---

## 🎧 STREAMING PREFERENCES

### 18. Connect Spotify Account
**Location:** `StreamingStatsPage.tsx`, `SpotifyCallback.tsx`
**Action:** User connects Spotify
**Signal:** `streaming_spotify_connected`
**Weight:** 3.0
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, signal_weight, context
) VALUES (
  userId, 'streaming_spotify_connected', 'genre', 3.0,
  jsonb_build_object('service', 'spotify')
);
```

### 19. Connect Apple Music Account
**Location:** `StreamingStatsPage.tsx`, `AppleMusicStats.tsx`
**Action:** User connects Apple Music
**Signal:** `streaming_apple_music_connected`
**Weight:** 3.0
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, signal_weight, context
) VALUES (
  userId, 'streaming_apple_music_connected', 'genre', 3.0,
  jsonb_build_object('service', 'apple-music')
);
```

### 20. Sync Streaming Profile
**Location:** `SpotifyService.syncUserMusicPreferences()`, `AppleMusicService`
**Action:** User syncs top artists/tracks
**Signal:** `streaming_profile_synced`
**Weight:** Varies by genre count
**Implementation:**
```typescript
// For each genre in top genres
await insert_streaming_signal(
  userId,
  'streaming_profile_synced',
  'genre',
  null,
  genreName,
  [genreName],
  null,
  LEAST(count / 10.0, 6.0)  // Weight based on count
);
```

### 21. Top Track (Short Term - 4 weeks)
**Location:** `SpotifyService.syncUserMusicPreferences()`
**Action:** Track appears in user's top tracks (short term)
**Signal:** `streaming_top_track_short`
**Weight:** 4.0
**Implementation:**
```typescript
await insert_streaming_signal(
  userId,
  'streaming_top_track_short',
  'song',
  trackId,
  trackName,
  trackGenres,
  'short_term',
  4.0
);
```

### 22. Top Track (Medium Term - 6 months)
**Location:** Same as above
**Action:** Track in top tracks (medium term)
**Signal:** `streaming_top_track_medium`
**Weight:** 5.0
**Implementation:**
```typescript
await insert_streaming_signal(
  userId, 'streaming_top_track_medium', 'song', trackId, trackName,
  trackGenres, 'medium_term', 5.0
);
```

### 23. Top Track (Long Term - All Time)
**Location:** Same as above
**Action:** Track in top tracks (all time)
**Signal:** `streaming_top_track_long`
**Weight:** 6.0
**Implementation:**
```typescript
await insert_streaming_signal(
  userId, 'streaming_top_track_long', 'song', trackId, trackName,
  trackGenres, 'long_term', 6.0
);
```

### 24. Top Artist (Short Term - 4 weeks)
**Location:** `SpotifyService.syncUserMusicPreferences()`
**Action:** Artist in top artists (short term)
**Signal:** `streaming_top_artist_short`
**Weight:** 4.0
**Implementation:**
```typescript
await insert_streaming_signal(
  userId,
  'streaming_top_artist_short',
  'artist',
  artistId,  // If we have it, else null
  artistName,
  artistGenres,
  'short_term',
  4.0
);
```

### 25. Top Artist (Medium Term - 6 months)
**Location:** Same as above
**Action:** Artist in top artists (medium term)
**Signal:** `streaming_top_artist_medium`
**Weight:** 5.0
**Implementation:**
```typescript
await insert_streaming_signal(
  userId, 'streaming_top_artist_medium', 'artist', artistId, artistName,
  artistGenres, 'medium_term', 5.0
);
```

### 26. Top Artist (Long Term - All Time)
**Location:** Same as above
**Action:** Artist in top artists (all time)
**Signal:** `streaming_top_artist_long`
**Weight:** 6.0
**Implementation:**
```typescript
await insert_streaming_signal(
  userId, 'streaming_top_artist_long', 'artist', artistId, artistName,
  artistGenres, 'long_term', 6.0
);
```

### 27. Recently Played Song
**Location:** `SpotifyService.syncUserMusicPreferences()`
**Action:** User recently streamed a song
**Signal:** `streaming_recent_play`
**Weight:** 3.0
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, genre, context, occurred_at
) VALUES (
  userId, 'streaming_recent_play', 'song', trackId, trackName,
  3.0, trackGenres[0], 
  jsonb_build_object('played_at', playedAt, 'service', 'spotify'),
  playedAt
);
```

### 28. Add Song to Custom Setlist
**Location:** Setlist creation/editing (if implemented)
**Action:** User adds song to custom setlist
**Signal:** `streaming_setlist_add`
**Weight:** 4.0
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, genre, context
) VALUES (
  userId, 'streaming_setlist_add', 'song', songId, songName,
  4.0, songGenres[0],
  jsonb_build_object('setlist_id', setlistId)
);
```

---

## 🎼 GENRE PREFERENCES

### 29. Search for Genre
**Location:** Search pages, genre filters
**Action:** User searches for genre
**Signal:** `genre_search`
**Weight:** 2.0
**Implementation:**
```typescript
await insert_search_signal(userId, 'genre', genreQuery, [genreQuery]);
```

### 30. Manual Genre Preference
**Location:** User settings, profile preferences
**Action:** User manually sets genre preference
**Signal:** `genre_manual_preference`
**Weight:** 9.0
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, genre, context
) VALUES (
  userId, 'genre_manual_preference', 'genre', NULL, genreName,
  9.0, genreName,
  jsonb_build_object('source', 'manual', 'weight', 9.0)
);
```

### 31. Manual Artist Preference
**Location:** User settings, profile preferences
**Action:** User manually sets artist preference
**Signal:** `artist_manual_preference`
**Weight:** 9.0
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, genre
) VALUES (
  userId, 'artist_manual_preference', 'artist', artistId, artistName,
  9.0, artistGenres[0]  // Extract first genre
);
```

### 32. Manual Venue Preference
**Location:** User settings, profile preferences
**Action:** User manually sets venue preference
**Signal:** `venue_manual_preference`
**Weight:** 9.0
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, signal_weight
) VALUES (
  userId, 'venue_manual_preference', 'venue', venueId, venueName, 9.0
);
```

---

## ⭐ REVIEW CONTENT PREFERENCES

### 33. Overall Rating (1-5 stars)
**Location:** `EventReviewForm.tsx`, `ReviewService.ts`
**Action:** User rates event overall
**Signal:** `review_rating_overall`
**Weight:** Rating value (1-5)
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, genre, context
) VALUES (
  userId, 'review_rating_overall', 'review', reviewId, eventName,
  rating, eventGenres[0],
  jsonb_build_object('review_id', reviewId, 'rating', rating)
);
```

### 34. Artist Performance Rating
**Location:** `EventReviewForm.tsx`
**Action:** User rates artist performance category
**Signal:** `review_rating_artist_performance`
**Weight:** Rating value (0.5-5.0)
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, genre, context
) VALUES (
  userId, 'review_rating_artist_performance', 'review', reviewId, eventName,
  artistPerformanceRating, eventGenres[0],
  jsonb_build_object('category', 'artist_performance', 'rating', artistPerformanceRating)
);
```

### 35. Production Rating
**Location:** `EventReviewForm.tsx`
**Action:** User rates production category
**Signal:** `review_rating_production`
**Weight:** Rating value (0.5-5.0)
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, genre, context
) VALUES (
  userId, 'review_rating_production', 'review', reviewId, eventName,
  productionRating, eventGenres[0],
  jsonb_build_object('category', 'production', 'rating', productionRating)
);
```

### 36. Venue Rating
**Location:** `EventReviewForm.tsx`
**Action:** User rates venue category
**Signal:** `review_rating_venue`
**Weight:** Rating value (0.5-5.0)
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, context
) VALUES (
  userId, 'review_rating_venue', 'review', reviewId, eventName,
  venueRating,
  jsonb_build_object('category', 'venue', 'rating', venueRating, 'venue_id', venueId)
);
```

### 37. Location Rating
**Location:** `EventReviewForm.tsx`
**Action:** User rates location category
**Signal:** `review_rating_location`
**Weight:** Rating value (0.5-5.0)
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, context
) VALUES (
  userId, 'review_rating_location', 'review', reviewId, eventName,
  locationRating,
  jsonb_build_object('category', 'location', 'rating', locationRating)
);
```

### 38. Value Rating
**Location:** `EventReviewForm.tsx`
**Action:** User rates value category
**Signal:** `review_rating_value`
**Weight:** Rating value (0.5-5.0)
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, genre, context
) VALUES (
  userId, 'review_rating_value', 'review', reviewId, eventName,
  valueRating, eventGenres[0],
  jsonb_build_object('category', 'value', 'rating', valueRating)
);
```

### 39. Reaction Emoji
**Location:** `EventReviewForm.tsx`
**Action:** User adds emoji reaction to review
**Signal:** `review_reaction_emoji`
**Weight:** 2.0
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, genre, context
) VALUES (
  userId, 'review_reaction_emoji', 'review', reviewId, eventName,
  2.0, eventGenres[0],
  jsonb_build_object('emoji', reactionEmoji)
);
```

### 40. Genre Tags Added to Review
**Location:** `EventReviewForm.tsx`
**Action:** User adds genre tags to review
**Signal:** `review_genre_tags`
**Weight:** 3.0 per tag
**Implementation:**
```typescript
-- One signal per genre tag
FOREACH genreTag IN ARRAY genreTags
LOOP
  INSERT INTO user_preference_signals (
    user_id, signal_type, entity_type, entity_id, entity_name,
    signal_weight, genre, context
  ) VALUES (
    userId, 'review_genre_tags', 'review', reviewId, eventName,
    3.0, genreTag,
    jsonb_build_object('tag', genreTag)
  );
END LOOP;
```

### 41. Mood Tags Added to Review
**Location:** `EventReviewForm.tsx`
**Action:** User adds mood tags (lit, chill, etc.)
**Signal:** `review_mood_tags`
**Weight:** 2.0 per tag
**Implementation:**
```typescript
FOREACH moodTag IN ARRAY moodTags
LOOP
  INSERT INTO user_preference_signals (
    user_id, signal_type, entity_type, entity_id, entity_name,
    signal_weight, genre, context
  ) VALUES (
    userId, 'review_mood_tags', 'review', reviewId, eventName,
    2.0, eventGenres[0],
    jsonb_build_object('mood_tag', moodTag)
  );
END LOOP;
```

### 42. Context Tags Added to Review
**Location:** `EventReviewForm.tsx`
**Action:** User adds context tags (first-time, anniversary, etc.)
**Signal:** `review_context_tags`
**Weight:** 2.0 per tag
**Implementation:**
```typescript
FOREACH contextTag IN ARRAY contextTags
LOOP
  INSERT INTO user_preference_signals (
    user_id, signal_type, entity_type, entity_id, entity_name,
    signal_weight, genre, context
  ) VALUES (
    userId, 'review_context_tags', 'review', reviewId, eventName,
    2.0, eventGenres[0],
    jsonb_build_object('context_tag', contextTag)
  );
END LOOP;
```

### 43. Review Photos Uploaded
**Location:** `EventReviewForm.tsx`
**Action:** User uploads photos to review
**Signal:** `review_photos`
**Weight:** 1.0 per photo (max 5.0)
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, genre, context
) VALUES (
  userId, 'review_photos', 'review', reviewId, eventName,
  LEAST(array_length(photos, 1), 5.0), eventGenres[0],
  jsonb_build_object('photo_count', array_length(photos, 1))
);
```

### 44. Review Videos Uploaded
**Location:** `EventReviewForm.tsx`
**Action:** User uploads videos to review
**Signal:** `review_videos`
**Weight:** 2.0 per video (max 6.0)
**Implementation:**
```typescript
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name,
  signal_weight, genre, context
) VALUES (
  userId, 'review_videos', 'review', reviewId, eventName,
  LEAST(array_length(videos, 1) * 2.0, 6.0), eventGenres[0],
  jsonb_build_object('video_count', array_length(videos, 1))
);
```

---

## 📍 IMPLEMENTATION LOCATIONS

### Frontend Components to Update:

1. **Artist Interactions:**
   - `src/components/artists/ArtistFollowButton.tsx` - Follow/unfollow
   - `src/components/ArtistCard.tsx` - Follow actions
   - `src/components/ArtistSearchBox.tsx` - Search tracking

2. **Event Interactions:**
   - `src/components/events/EventDetailsModal.tsx` - Interest, attendance, ticket clicks
   - `src/components/UnifiedFeed.tsx` - Interest toggles
   - `src/components/chat/EventMessageCard.tsx` - Interest actions
   - `src/services/userEventService.ts` - Interest/attendance service

3. **Review Interactions:**
   - `src/components/reviews/EventReviewForm.tsx` - All review signals
   - `src/services/reviewService.ts` - Review creation/updates

4. **Search Interactions:**
   - `src/components/search/RedesignedSearchPage.tsx` - All searches
   - `src/services/unifiedArtistSearchService.ts` - Artist searches
   - `src/services/unifiedEventSearchService.ts` - Event searches
   - `src/services/unifiedVenueSearchService.ts` - Venue searches

5. **Streaming Interactions:**
   - `src/services/spotifyService.ts` - All streaming signals
   - `src/services/appleMusicService.ts` - Apple Music signals
   - `src/pages/StreamingStatsPage.tsx` - Connection actions

6. **Venue Interactions:**
   - `src/components/venues/VenueFollowButton.tsx` - Follow/unfollow
   - `src/services/venueFollowService.ts` - Venue follow service

---

## 🔄 AUTO-COMPUTATION

All signals automatically trigger preference computation via trigger:
- `trigger_auto_compute_preferences` on `user_preference_signals`
- Calls `compute_user_preferences(user_id)` function
- Updates `user_preferences` table with aggregated scores

---

## 📊 SIGNAL WEIGHT SUMMARY

| Signal Type | Weight | Notes |
|------------|--------|-------|
| `event_attendance` | 10.0 | Strongest - user actually attended |
| `event_review_created` | 8.0 | Strong - user took time to review |
| `artist_follow` | 7.0 | Strong - explicit interest |
| `venue_follow` | 7.0 | Strong - explicit interest |
| `streaming_top_*_long` | 6.0 | Strong - long-term listening |
| `event_interest` | 5.0 | Medium - intent to attend |
| `streaming_top_*_medium` | 5.0 | Medium - 6 month listening |
| `streaming_top_*_short` | 4.0 | Medium - 4 week listening |
| `event_ticket_click` | 4.0 | Medium - purchase intent |
| `streaming_setlist_add` | 4.0 | Medium - curated preference |
| `streaming_recent_play` | 3.0 | Weak - recent activity |
| `review_genre_tags` | 3.0 | Weak - tag added |
| `artist_search` | 2.0 | Weak - exploratory |
| `event_search` | 2.0 | Weak - exploratory |
| `venue_search` | 2.0 | Weak - exploratory |
| `genre_search` | 2.0 | Weak - exploratory |
| `review_mood_tags` | 2.0 | Weak - tag added |
| `review_context_tags` | 2.0 | Weak - tag added |
| `review_reaction_emoji` | 2.0 | Weak - quick reaction |
| `review_photos` | 1.0 | Very weak - per photo |
| `artist_unfollow` | -2.0 | Negative signal |
| `venue_unfollow` | -2.0 | Negative signal |
| `event_interest_removed` | -2.0 | Negative signal |
| `event_attendance_removed` | -3.0 | Strong negative |
| `event_review_deleted` | -4.0 | Strong negative |

---

## ✅ VERIFICATION CHECKLIST

After implementing tracking, verify:
- [ ] All 44 signal types are being tracked
- [ ] Signals are inserted with correct weights
- [ ] Genres are extracted and normalized (one row per genre)
- [ ] Preferences are auto-computed after signal insertion
- [ ] Feed building queries use `user_preferences` table
- [ ] No data loss during migration

---

## 🚀 NEXT STEPS

1. Update each component/service listed above to insert signals
2. Test signal insertion with sample data
3. Verify preferences are computed correctly
4. Build personalized feed queries using `user_preferences` table
5. Monitor signal counts and preference scores

