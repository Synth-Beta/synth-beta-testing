# Artist Follow UUID Fix

## Problem

The application was throwing UUID validation errors when trying to follow artists:

```
Error: invalid input syntax for type uuid: "5483588"
Error: invalid input syntax for type uuid: "49281"
Error: invalid input syntax for type uuid: "45197"
```

## Root Cause

Multiple components were passing **JamBase artist IDs** (numeric strings like "5483588") directly to the `artistId` prop of `ArtistFollowButton`, which then passed them to database functions that expect UUIDs.

The issue occurred because:
1. The `Artist` type's `id` field can contain either:
   - A UUID (when the artist comes from the database)
   - A JamBase numeric ID (when the artist comes from the API)

2. Components were blindly passing `artist.id` or `event.artist_id` to the `ArtistFollowButton`

3. The database functions `is_following_artist` and `get_artist_follower_count` expect UUID inputs

## Solution

Removed the `artistId` prop from all `ArtistFollowButton` instances that might contain non-UUID values. Instead, rely on:
- `artistName` prop (always available)
- `jambaseArtistId` prop (when available)

The `ArtistFollowButton` component already has built-in logic to:
1. Resolve the internal UUID from `jambaseArtistId` using `ArtistFollowService.getArtistUuidByJambaseId()`
2. Resolve the internal UUID from `artistName` using `ArtistFollowService.getArtistUuidByName()`
3. Create a new artist entry if one doesn't exist

## Files Fixed

1. **src/components/ArtistCard.tsx**
   - Removed `artistId={artist.id !== 'manual' ? artist.id : undefined}`
   - Kept `artistName` and `jambaseArtistId` props

2. **src/components/UnifiedSearch.tsx**
   - Removed `artistId={artist.id}`
   - Kept `artistName` and `jambaseArtistId` props

3. **src/components/UnifiedFeed.tsx**
   - Removed `artistId={item.event_info.artist_id}`
   - Kept `artistName` prop

4. **src/components/reviews/ProfileReviewCard.tsx**
   - Removed `artistId={event.artist_id}`
   - Kept `artistName` prop

5. **src/components/events/JamBaseEventCard.tsx**
   - Removed `artistId={event.artist_id}`
   - Kept `artistName` prop

6. **src/components/reviews/ReviewCard.tsx**
   - Removed `artistId={(review as any).artist_uuid || review.artist_id}`
   - Kept `artistName` prop

## How It Works Now

When a user clicks a follow button:

1. `ArtistFollowButton` receives only `artistName` (and optionally `jambaseArtistId`)
2. The button's `useEffect` resolves the internal UUID:
   - First tries `getArtistUuidByJambaseId()` if `jambaseArtistId` is provided
   - Falls back to `getArtistUuidByName()` if needed
3. Once resolved, it uses the UUID for all database operations
4. If the artist doesn't exist in the database, it creates a new entry

## Testing

After this fix, the follow buttons should work without UUID errors across:
- Artist cards
- Search results
- Event cards
- Review cards
- Unified feed
- Profile pages

## Additional Notes

- The only time `artistId` should be passed directly is when you're **absolutely certain** it's a UUID (e.g., coming directly from the `artists` or `artist_profile` table's `id` column)
- For all external IDs (JamBase, Spotify, etc.), use the appropriate identifier prop and let the button resolve the UUID

