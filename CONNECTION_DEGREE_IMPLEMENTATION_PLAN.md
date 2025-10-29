# Connection Degree Reviews System - Implementation Plan

## What You Want

You want the **Reviews tab** in the feed to show reviews from:
1. **First connections** (direct friends) - Always shown
2. **Second connections** (friends of friends) - Always shown  
3. **Third connections** (friends of friends of friends) - **ONLY if relevant**
   - Relevant = They follow at least one common artist OR at least one common venue

Additionally, each review should display the **connection type badge** next to the reviewer's username:
- "1st" badge for first connections
- "2nd" badge for second connections  
- "3rd" badge for third connections

## How It Needs to Be Implemented

### 1. Database Layer (SQL)

**Prerequisites:** 
- Ensure `get_connection_degree()` function exists. If not, run `sql/archive/SIMPLIFIED_LINKEDIN_CONNECTIONS.sql` first.

Then run the SQL file `CREATE_CONNECTION_DEGREE_REVIEWS_SYSTEM.sql` which creates:

**Functions:**
- `has_relevant_music_connection(user1_id, user2_id)` - Checks if two users follow common artists/venues
- `get_connection_degree_reviews(user_id, limit, offset)` - RPC function to fetch reviews (optional)

**View:**
- `reviews_with_connection_degree` - View that includes:
  - All review fields
  - `connection_degree` (1, 2, or 3)
  - `connection_type_label` ('1st', '2nd', '3rd')

**Indexes:**
- Performance indexes on friends, artist_follows, venue_follows, and user_reviews tables

### 2. Service Layer (TypeScript)

Update `src/services/friendsReviewService.ts` or `src/services/unifiedFeedService.ts` to:

1. Query the `reviews_with_connection_degree` view instead of the current friends-only query
2. Include `connection_degree` and `connection_type_label` in the returned data
3. Update the `UnifiedFeedItem` interface to include:
   ```typescript
   connection_degree?: number;
   connection_type_label?: string; // '1st', '2nd', '3rd'
   ```

### 3. UI Components

Update review card components to display the connection badge:

**Files to update:**
- `src/components/reviews/BelliStyleReviewCard.tsx`
- `src/components/reviews/ProfileReviewCard.tsx`

**Badge placement:**
- Display next to the reviewer's username
- Example: "John Doe **1st**" or "Jane Smith **2nd**"

**Badge styling:**
- Small badge/pill component
- Different colors for each degree (e.g., 1st=green, 2nd=yellow, 3rd=orange)
- Positioned right after the username

### 4. Feed Integration

Update `src/components/UnifiedFeed.tsx` or wherever reviews are fetched:

1. Use the new service method that queries `reviews_with_connection_degree`
2. Ensure `connection_type_label` is passed through to review cards
3. Sort by `connection_degree` ASC, then `created_at` DESC (prioritize closer connections)

## SQL File Overview

The SQL file **uses existing connection degree functions** (`get_connection_degree`, `get_first_degree_connections`, etc.) and creates:

1. **Helper function** (`has_relevant_music_connection`) to check music relevance (shared artist/venue follows)
2. **Main view** (`reviews_with_connection_degree`) that:
   - Uses existing `get_connection_degree()` function to calculate connection degree
   - Filters reviews to include 1st, 2nd, and relevant 3rd degree connections
   - Filters 3rd degree to only include relevant ones (same artist/venue follows)
   - Includes `connection_degree` (1, 2, 3) and `connection_type_label` ('1st', '2nd', '3rd')
3. **Indexes** for performance
4. **Optional RPC function** (`get_connection_degree_reviews`) for programmatic access

## Testing

After running SQL, test with:

```sql
-- Check view works
SELECT * FROM public.reviews_with_connection_degree LIMIT 10;

-- Check connection distribution
SELECT connection_degree, COUNT(*) 
FROM public.reviews_with_connection_degree 
GROUP BY connection_degree;

-- Check 3rd degree relevance
SELECT * FROM public.reviews_with_connection_degree 
WHERE connection_degree = 3;
```

## Next Steps After SQL

1. Update TypeScript service to use the view
2. Update review card components to show badges
3. Test in the Reviews tab of the feed

