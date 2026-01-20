# Interaction Tracking Implementation Status

## ✅ Completed Foundation

### 1. Core Infrastructure
- **Tracking Service Enabled**: `src/services/interactionTrackingService.ts`
  - ✅ Database inserts enabled (previously disabled)
  - ✅ Batch processing with 2-second delay or 10-event batches
  - ✅ Session tracking included automatically
  - ✅ Error handling to prevent UI failures

- **Utility Functions Created**: `src/utils/entityUuidResolver.ts`
  - ✅ `getEventUuid()` - Extract event UUID from various formats
  - ✅ `getArtistUuid()` - Extract artist UUID from various formats
  - ✅ `getVenueUuid()` - Extract venue UUID from various formats
  - ✅ `getEventMetadata()` - Extract event metadata for marketing
  - ✅ `getArtistMetadata()` - Extract artist metadata for marketing
  - ✅ `getVenueMetadata()` - Extract venue metadata for marketing

- **View Tracking Hook**: `src/hooks/useViewTracking.ts`
  - ✅ Automatic view tracking on component mount
  - ✅ Debouncing support
  - ✅ Entity UUID support

### 2. Updated Convenience Functions
All `trackInteraction` functions in `interactionTrackingService.ts` now support `entityUuid`:
- ✅ `click(entityType, entityId, metadata?, entityUuid?)`
- ✅ `view(entityType, entityId, duration?, metadata?, entityUuid?)`
- ✅ `like(entityType, entityId, isLiked, metadata?, entityUuid?)`
- ✅ `share(entityType, entityId, platform?, metadata?, entityUuid?)`
- ✅ `comment(entityType, entityId, commentLength?, metadata?, entityUuid?)`
- ✅ `review(entityType, entityId, rating?, metadata?, entityUuid?)`
- ✅ `interest(entityType, entityId, isInterested, metadata?, entityUuid?)`
- ✅ `swipe(entityType, entityId, direction, metadata?, entityUuid?)`
- ✅ `trackFeedImpression(eventId, metadata?, entityUuid?)`

### 3. Implemented Tracking

#### Page Views
- ✅ **HomeFeed** - Tracks when home feed is viewed
- ✅ **DiscoverView** - Tracks when discover/search page is viewed
- ✅ **ProfileView** - Tracks profile views (own and others) with metadata

#### Event Interactions (Partial)
- ✅ **EventDetailsModal** - View tracking with duration
- ✅ **EventDetailsModal** - Click tracking for artist/venue links with entityUuid
- ✅ **EventDetailsModal** - Ticket link clicks with entityUuid

---

## 🚧 Remaining Implementation Tasks

### High Priority

#### 1. Event Card Interactions
**Files to Update:**
- `src/components/events/EventCard.tsx`
- `src/components/events/SwiftUIEventCard.tsx`
- `src/components/home/CompactEventCard.tsx`
- `src/components/cards/FigmaEventCard.tsx`
- `src/components/home/UnifiedEventsFeed.tsx`

**Tracking Needed:**
- Click tracking on event cards (with event UUID and metadata)
- View tracking via intersection observer for impressions
- Interest toggle clicks

#### 2. Artist Interactions
**Files to Update:**
- `src/components/ArtistCard.tsx`
- `src/pages/ArtistEvents.tsx`
- `src/components/artists/ArtistFollowButton.tsx`
- `src/components/ArtistSearchBox.tsx`

**Tracking Needed:**
- Artist card clicks (with artist UUID)
- Artist card views
- Artist follow/unfollow actions
- Artist events page view
- Artist search result clicks

#### 3. Venue Interactions
**Files to Update:**
- `src/components/reviews/VenueCard.tsx`
- `src/pages/VenueEvents.tsx`
- `src/components/venues/VenueFollowButton.tsx`
- `src/components/VenueSearchBox.tsx`

**Tracking Needed:**
- Venue card clicks (with venue UUID)
- Venue card views
- Venue follow/unfollow actions
- Venue events page view
- Venue search result clicks

#### 4. Review Interactions
**Files to Update:**
- `src/components/reviews/ReviewCard.tsx`
- `src/components/reviews/BelliStyleReviewCard.tsx`
- `src/components/reviews/EventReviewForm.tsx`
- `src/components/reviews/ProfileReviewCard.tsx`

**Tracking Needed:**
- Review card clicks (with review UUID)
- Review likes/comments/shares
- Review form submissions
- Post-submit ranking interactions

#### 5. Feed Interactions
**Files to Update:**
- `src/components/home/UnifiedEventsFeed.tsx`
- `src/components/home/NetworkEventsSection.tsx`
- `src/components/home/EventListsCarousel.tsx`

**Tracking Needed:**
- Event impressions using intersection observer
- Feed section views
- Feed filter applications
- Load more / pagination clicks

#### 6. Navigation Interactions
**Files to Update:**
- `src/components/BottomNav/BottomNav.tsx`
- `src/components/SideMenu/SideMenu.tsx`
- `src/components/MainApp.tsx`

**Tracking Needed:**
- Bottom navigation tab clicks
- Side menu item clicks
- Tab switches within views
- Modal open/close events

#### 7. Search Interactions
**Files to Update:**
- `src/components/search/RedesignedSearchPage.tsx`
- `src/components/SearchBar/SearchBar.tsx`

**Tracking Needed:**
- Search queries
- Search result clicks
- Search filter usage
- Search tab switches

#### 8. Social Interactions
**Files to Update:**
- `src/components/UnifiedChatView.tsx`
- `src/components/matching/ConcertBuddySwiper.tsx`
- `src/components/groups/CreateEventGroupModal.tsx`

**Tracking Needed:**
- Chat/message interactions
- Match swipe interactions
- Group creation/joining
- Friend connection actions

#### 9. Additional Page Views
**Files to Update:**
- `src/components/NotificationsPage.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/onboarding/OnboardingFlow.tsx`
- Analytics dashboards

**Tracking Needed:**
- Notifications view
- Settings view
- Onboarding step views
- Analytics dashboard views

#### 10. Update Existing Tracking Calls
**Files Needing Updates:**
- `src/services/userEventService.ts` - Update interest tracking to use entityUuid
- `src/components/UnifiedFeed.tsx` - Update share tracking
- `src/components/reviews/EventReviewForm.tsx` - Update review tracking with entityUuid
- `src/components/events/JamBaseEventCard.tsx` - Update ticket click tracking

---

## 📋 Implementation Pattern

### For View Tracking
```typescript
import { useViewTracking } from '@/hooks/useViewTracking';

// In component body:
useViewTracking('view', 'entity_id', { metadata }, entityUuid);
```

### For Click Tracking
```typescript
import { trackInteraction } from '@/services/interactionTrackingService';
import { getEventUuid, getEventMetadata } from '@/utils/entityUuidResolver';

// In click handler:
const handleClick = () => {
  trackInteraction.click(
    'event',
    event.id,
    getEventMetadata(event),
    getEventUuid(event) // entityUuid
  );
  // ... rest of handler
};
```

### For Event Impressions (Intersection Observer)
```typescript
import { useIntersectionTracking } from '@/hooks/useIntersectionTracking';

// In component:
const trackRef = useIntersectionTracking(
  'event',
  event.id,
  getEventMetadata(event),
  { threshold: 0.5 }
);

// On element:
<div ref={trackRef}>...</div>
```

### For List Item Impressions
```typescript
import { useIntersectionTrackingList } from '@/hooks/useIntersectionTracking';

// In component:
const attachObserver = useIntersectionTrackingList(
  'event',
  events.map(e => ({ id: e.id, metadata: getEventMetadata(e) }))
);

// On items:
{events.map(event => (
  <div ref={(el) => attachObserver(el, event.id)}>
    ...
  </div>
))}
```

---

## 🔍 Testing Checklist

After implementing tracking:

- [ ] Verify interactions are being inserted into `interactions` table
- [ ] Check that entity_uuid is populated for events, artists, venues
- [ ] Verify metadata includes marketing-relevant fields (artist_name, venue_name, etc.)
- [ ] Test that tracking failures don't break UI
- [ ] Verify batch processing works (check for batching in network tab)
- [ ] Test session tracking (verify session_id is consistent)
- [ ] Verify view tracking fires on component mount
- [ ] Test click tracking on interactive elements
- [ ] Verify intersection observer tracking for feed impressions

---

## 📊 Database Query Examples

### Check tracking is working:
```sql
SELECT * FROM interactions 
ORDER BY occurred_at DESC 
LIMIT 10;
```

### Count interactions by type:
```sql
SELECT 
  event_type,
  entity_type,
  COUNT(*) as count
FROM interactions
WHERE occurred_at >= NOW() - INTERVAL '24 hours'
GROUP BY event_type, entity_type
ORDER BY count DESC;
```

### Most viewed events:
```sql
SELECT 
  entity_uuid,
  metadata->>'artist_name' as artist_name,
  COUNT(*) as view_count
FROM interactions
WHERE entity_type = 'event'
  AND event_type = 'view'
  AND occurred_at >= NOW() - INTERVAL '7 days'
GROUP BY entity_uuid, metadata->>'artist_name'
ORDER BY view_count DESC
LIMIT 10;
```

---

## 📝 Notes

- All tracking is non-blocking - failures won't break the UI
- Interactions are batched for performance
- Session IDs are automatically generated and tracked
- Entity UUIDs are required for events, artists, venues, users, reviews
- Metadata should always include marketing-relevant fields when available

---

*Last Updated: January 2025*
*Status: Foundation Complete - Comprehensive Implementation In Progress*