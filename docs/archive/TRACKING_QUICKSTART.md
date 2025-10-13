# 🚀 Interaction Tracking - Quick Start Guide

**Get tracking up and running in 1 day**

---

## ✅ Pre-Flight Checklist

Before implementing tracking, verify:

1. ✅ **Database Table Exists**
   ```sql
   -- Run in Supabase SQL Editor
   SELECT COUNT(*) FROM user_interactions;
   ```
   If error → Run migration: `supabase/migrations/20250125000003_create_unified_interaction_tracking.sql`

2. ✅ **Service File Exists**
   ```bash
   ls -la src/services/interactionTrackingService.ts
   ```
   Should show file (~300 lines)

3. ✅ **Test Tracking Works**
   ```typescript
   import { trackInteraction } from '@/services/interactionTrackingService';
   
   // In browser console:
   trackInteraction.click('test', 'test-id', { test: true });
   
   // Check database:
   // SELECT * FROM user_interactions ORDER BY created_at DESC LIMIT 1;
   ```

---

## 🎯 DAY 1 IMPLEMENTATION (Critical Revenue Points)

### **Step 1: Event Click Tracking** (30 minutes)

**File:** `src/components/UnifiedFeed.tsx`

**Find:** Line 747 (Event card onClick)
```typescript
onClick={async (e) => {
  if (e.defaultPrevented) return;
  if (item.event_data) {
    setSelectedEventForDetails(item.event_data);
```

**Add BEFORE setSelectedEventForDetails:**
```typescript
import { trackInteraction } from '@/services/interactionTrackingService';

onClick={async (e) => {
  if (e.defaultPrevented) return;
  if (item.event_data) {
    // 🎯 TRACK EVENT CLICK
    trackInteraction.click('event', item.event_data.id, {
      source: 'feed',
      position: index,
      feed_tab: activeTab,
      artist_name: item.event_data.artist_name,
      venue_name: item.event_data.venue_name,
      distance_miles: item.distance_miles,
      relevance_score: item.relevance_score
    });
    
    setSelectedEventForDetails(item.event_data);
```

**Test:** Click any event in feed, check database:
```sql
SELECT * FROM user_interactions 
WHERE event_type = 'click' AND entity_type = 'event' 
ORDER BY created_at DESC LIMIT 1;
```

---

### **Step 2: Ticket Link Click Tracking** (30 minutes) 💰

**File:** `src/components/events/EventDetailsModal.tsx`

**Find:** Ticket button (search for "ticket_urls" or "Buy Tickets")

**Add onClick handler:**
```typescript
const handleTicketClick = (ticketUrl: string, provider?: string) => {
  // Extract provider from URL if not provided
  const ticketProvider = provider || new URL(ticketUrl).hostname.replace('www.', '');
  
  // 🎯 TRACK TICKET LINK CLICK (CRITICAL FOR REVENUE!)
  trackInteraction.click('ticket_link', actualEvent.id, {
    ticket_url: ticketUrl,
    ticket_provider: ticketProvider,
    price_range: actualEvent.price_range,
    event_date: actualEvent.event_date,
    artist_name: actualEvent.artist_name,
    venue_name: actualEvent.venue_name,
    days_until_event: Math.floor(
      (new Date(actualEvent.event_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    ),
    source: 'event_modal',
    user_interested: isInterested
  });
  
  // Add UTM parameters for commission tracking
  const urlWithUTM = new URL(ticketUrl);
  urlWithUTM.searchParams.set('utm_source', 'synth');
  urlWithUTM.searchParams.set('utm_medium', 'app');
  urlWithUTM.searchParams.set('utm_campaign', 'event_modal');
  urlWithUTM.searchParams.set('utm_content', `event_${actualEvent.id}`);
  
  // Open ticket link
  window.open(urlWithUTM.toString(), '_blank');
};

// Apply to ticket buttons:
<Button onClick={() => handleTicketClick(ticketUrl)}>
  Buy Tickets
</Button>
```

**Test:** Click any ticket link, check database:
```sql
SELECT * FROM user_interactions 
WHERE event_type = 'click_ticket' 
ORDER BY created_at DESC LIMIT 1;
```

---

### **Step 3: Search Query Tracking** (30 minutes)

**File:** `src/components/search/RedesignedSearchPage.tsx`

**Find:** Line 591 (handleSearch function)

**Add at START of function:**
```typescript
const handleSearch = async (query: string, type?: SearchType) => {
  // 🎯 TRACK SEARCH QUERY
  trackInteraction.search(type || searchType, query, {
    query,
    search_type: type || searchType,
    query_length: query.length,
    from_view: window.location.pathname
  });
  
  const searchStartTime = Date.now();
  
  // ... existing search logic ...
```

**Add at END of function (after results loaded):**
```typescript
  // ... after search completes ...
  
  // 🎯 TRACK SEARCH RESULTS
  const searchDuration = Date.now() - searchStartTime;
  trackInteraction.search('search_results', query, {
    query,
    search_type: type || searchType,
    result_count: (filteredArtists?.length || 0) + (filteredEvents?.length || 0),
    artist_count: filteredArtists?.length || 0,
    event_count: filteredEvents?.length || 0,
    load_time_ms: searchDuration,
    has_results: (filteredArtists?.length || 0) + (filteredEvents?.length || 0) > 0
  });
```

**Test:** Search for anything, check database:
```sql
SELECT * FROM user_interactions 
WHERE event_type = 'search' 
ORDER BY created_at DESC LIMIT 2;
```

---

### **Step 4: Event Modal View Duration** (30 minutes)

**File:** `src/components/events/EventDetailsModal.tsx`

**Add at top of component:**
```typescript
import { useRef } from 'react';
import { trackInteraction } from '@/services/interactionTrackingService';

export function EventDetailsModal({ event, isOpen, onClose, ...props }) {
  const viewStartTime = useRef<number | null>(null);
  const hasInteracted = useRef(false);
  
  // Track modal open
  useEffect(() => {
    if (isOpen && event) {
      viewStartTime.current = Date.now();
      hasInteracted.current = false;
      
      // 🎯 TRACK MODAL OPEN
      trackInteraction.view('event', event.id, undefined, {
        source: 'event_modal',
        artist_name: event.artist_name,
        venue_name: event.venue_name,
        has_ticket_urls: event.ticket_urls?.length > 0,
        has_setlist: !!event.setlist,
        price_range: event.price_range
      });
    }
  }, [isOpen, event]);
  
  // Track modal close
  const handleClose = () => {
    if (viewStartTime.current && event) {
      const duration = Math.floor((Date.now() - viewStartTime.current) / 1000);
      
      // 🎯 TRACK MODAL CLOSE
      trackInteraction.view('event', event.id, duration, {
        source: 'event_modal_close',
        duration_seconds: duration,
        interacted: hasInteracted.current
      });
      
      viewStartTime.current = null;
    }
    
    onClose();
  };
  
  // Mark interaction when user does anything
  const markInteraction = () => {
    hasInteracted.current = true;
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      {/* Existing modal content */}
      {/* Add markInteraction() to any buttons */}
      <Button onClick={() => { markInteraction(); /* existing logic */ }}>
        Like
      </Button>
    </Dialog>
  );
}
```

**Test:** Open and close event modal, check database:
```sql
SELECT * FROM user_interactions 
WHERE entity_type = 'event' AND event_type IN ('view', 'view_end')
ORDER BY created_at DESC LIMIT 2;
```

---

### **Step 5: Artist/Venue Click Tracking** (30 minutes)

**File:** `src/components/events/EventDetailsModal.tsx`

**Find:** handleArtistClick and handleVenueClick functions (around line 316)

**Modify:**
```typescript
const handleArtistClick = () => {
  if (actualEvent.artist_name) {
    // 🎯 TRACK ARTIST CLICK
    trackInteraction.click('artist', actualEvent.artist_name, {
      source: 'event_modal',
      event_id: actualEvent.id,
      artist_name: actualEvent.artist_name,
      from_view: window.location.pathname
    });
    
    // Close modal and navigate
    onClose();
    navigate(`/artist/${encodeURIComponent(actualEvent.artist_name)}`, {
      state: { 
        fromFeed: window.location.pathname,
        eventId: actualEvent.id
      }
    });
  }
};

const handleVenueClick = () => {
  if (actualEvent.venue_name) {
    // 🎯 TRACK VENUE CLICK
    trackInteraction.click('venue', actualEvent.venue_name, {
      source: 'event_modal',
      event_id: actualEvent.id,
      venue_name: actualEvent.venue_name,
      venue_city: actualEvent.venue_city,
      venue_state: actualEvent.venue_state
    });
    
    // Close modal and navigate
    onClose();
    navigate(`/venue/${encodeURIComponent(actualEvent.venue_name)}`, {
      state: { 
        fromFeed: window.location.pathname,
        eventId: actualEvent.id
      }
    });
  }
};
```

**Also add to Feed event cards** (Lines 815-829 in `UnifiedFeed.tsx`)

**Test:** Click artist or venue name, check database:
```sql
SELECT * FROM user_interactions 
WHERE event_type = 'click' AND entity_type IN ('artist', 'venue')
ORDER BY created_at DESC LIMIT 1;
```

---

## 🧪 TESTING YOUR IMPLEMENTATION

### **Test Script** (Run in browser console)

```typescript
// 1. Test event click
console.log('Testing event click...');
// Click any event in feed

// 2. Check database
setTimeout(async () => {
  const { data } = await supabase
    .from('user_interactions')
    .select('*')
    .eq('event_type', 'click')
    .eq('entity_type', 'event')
    .order('created_at', { ascending: false })
    .limit(1);
  
  console.log('Event click tracked:', data);
}, 2000);

// 3. Test ticket click
console.log('Testing ticket click...');
// Click "Buy Tickets" button

// 4. Check database
setTimeout(async () => {
  const { data } = await supabase
    .from('user_interactions')
    .select('*')
    .eq('event_type', 'click_ticket')
    .order('created_at', { ascending: false })
    .limit(1);
  
  console.log('Ticket click tracked:', data);
}, 2000);

// 5. Test search
console.log('Testing search...');
// Search for "Taylor Swift"

// 6. Check database
setTimeout(async () => {
  const { data } = await supabase
    .from('user_interactions')
    .select('*')
    .eq('event_type', 'search')
    .order('created_at', { ascending: false })
    .limit(2);
  
  console.log('Search tracked:', data);
}, 2000);
```

---

## 📊 VERIFY DATA COLLECTION

### **SQL Queries to Check Tracking**

```sql
-- 1. Check total interactions today
SELECT 
  event_type,
  entity_type,
  COUNT(*) as count
FROM user_interactions
WHERE DATE(occurred_at) = CURRENT_DATE
GROUP BY event_type, entity_type
ORDER BY count DESC;

-- 2. Check event clicks
SELECT 
  entity_id as event_id,
  COUNT(*) as clicks,
  COUNT(DISTINCT user_id) as unique_users,
  AVG((metadata->>'relevance_score')::FLOAT) as avg_relevance
FROM user_interactions
WHERE event_type = 'click' 
AND entity_type = 'event'
AND DATE(occurred_at) = CURRENT_DATE
GROUP BY entity_id
ORDER BY clicks DESC
LIMIT 10;

-- 3. Check ticket link clicks (💰 MONEY!)
SELECT 
  entity_id as event_id,
  metadata->>'artist_name' as artist,
  metadata->>'venue_name' as venue,
  metadata->>'ticket_provider' as provider,
  metadata->>'price_range' as price,
  COUNT(*) as ticket_clicks,
  COUNT(DISTINCT user_id) as unique_clickers
FROM user_interactions
WHERE event_type = 'click_ticket'
AND DATE(occurred_at) >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY entity_id, artist, venue, provider, price
ORDER BY ticket_clicks DESC
LIMIT 20;

-- 4. Check search queries
SELECT 
  metadata->>'query' as search_query,
  metadata->>'search_type' as type,
  COUNT(*) as search_count,
  COUNT(DISTINCT user_id) as unique_users,
  AVG((metadata->>'result_count')::INT) as avg_results
FROM user_interactions
WHERE event_type = 'search'
AND DATE(occurred_at) = CURRENT_DATE
GROUP BY search_query, type
ORDER BY search_count DESC
LIMIT 20;

-- 5. Check conversion funnel
SELECT 
  entity_id as event_id,
  COUNT(*) FILTER (WHERE event_type = 'impression') as impressions,
  COUNT(*) FILTER (WHERE event_type = 'click') as clicks,
  COUNT(*) FILTER (WHERE event_type = 'view') as views,
  COUNT(*) FILTER (WHERE event_type = 'interest') as interested,
  COUNT(*) FILTER (WHERE event_type = 'click_ticket') as ticket_clicks,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE event_type = 'click') / 
    NULLIF(COUNT(*) FILTER (WHERE event_type = 'impression'), 0),
    2
  ) as click_through_rate
FROM user_interactions
WHERE entity_type = 'event'
AND DATE(occurred_at) >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY entity_id
HAVING COUNT(*) FILTER (WHERE event_type = 'impression') > 0
ORDER BY impressions DESC
LIMIT 20;
```

---

## 🚨 TROUBLESHOOTING

### **Problem: No data appearing in database**

**Check 1:** Is user authenticated?
```typescript
const { data: { user } } = await supabase.auth.getUser();
console.log('Current user:', user);
```

**Check 2:** Is tracking service initialized?
```typescript
import { interactionTracker } from '@/services/interactionTrackingService';
console.log('Tracker session ID:', interactionTracker.sessionId);
```

**Check 3:** Check browser console for errors
```
Look for: "Failed to log interaction" or RLS policy errors
```

**Check 4:** Check RLS policies
```sql
-- Users must be authenticated
SELECT auth.uid(); -- Should return UUID

-- Check if policy allows inserts
SELECT * FROM user_interactions WHERE user_id = auth.uid();
```

---

### **Problem: Tracking is slow/laggy**

**Solution:** Tracking is queued and batched automatically!

The `interactionTrackingService` queues events and flushes every 30 seconds. This is intentional for performance.

**To force immediate flush (for testing):**
```typescript
import { interactionTracker } from '@/services/interactionTrackingService';
await interactionTracker.flush();
```

---

### **Problem: Metadata not showing up**

**Check:** Make sure metadata is a valid object
```typescript
// ✅ GOOD
trackInteraction.click('event', eventId, {
  source: 'feed',
  position: 0
});

// ❌ BAD
trackInteraction.click('event', eventId, 'feed'); // String not object
```

---

## 📈 NEXT STEPS (Day 2+)

After Day 1 implementation, continue with:

### **Day 2: Event Impressions** (IntersectionObserver)
See `INTERACTION_TRACKING_IMPLEMENTATION_PLAN.md` Phase 1.2

### **Day 3: Review Tracking**
Track review creation, likes, comments

### **Day 4: Feed Navigation**
Track tab changes, sort, filter, scroll depth

### **Day 5: Analytics Dashboard**
Build UI to visualize tracked data

---

## 💡 PRO TIPS

1. **Always include context in metadata**
   ```typescript
   // Good metadata
   {
     source: 'feed',
     position: 3,
     feed_tab: 'events',
     artist_name: 'Taylor Swift',
     relevance_score: 0.89
   }
   ```

2. **Use consistent entity_id formats**
   ```typescript
   // For events: UUID from database
   trackInteraction.click('event', eventData.id, { ... });
   
   // For artists: artist name (string)
   trackInteraction.click('artist', 'Taylor Swift', { ... });
   
   // For venues: venue name (string)
   trackInteraction.click('venue', 'Madison Square Garden', { ... });
   ```

3. **Track immediately, don't wait for API calls**
   ```typescript
   // ✅ GOOD
   trackInteraction.click('event', eventId, { ... });
   await someAPICall();
   
   // ❌ BAD
   await someAPICall();
   trackInteraction.click('event', eventId, { ... }); // Might not fire if user navigates away
   ```

4. **Don't track in development (optional)**
   ```typescript
   // Add to tracking service
   if (process.env.NODE_ENV === 'development') {
     console.log('TRACKING (dev):', eventType, entityType, metadata);
     return; // Don't actually track
   }
   ```

---

## 🎉 SUCCESS CRITERIA

After Day 1, you should see:

- ✅ Event clicks tracked with full metadata
- ✅ Ticket link clicks tracked (with UTM parameters)
- ✅ Search queries tracked with result counts
- ✅ Event modal view durations tracked
- ✅ Artist/venue clicks tracked

**Expected Data Volume:**
- 100+ interactions per day (per active user)
- Event clicks: 20-50% of events shown
- Ticket clicks: 1-5% of event views
- Search queries: 5-10 per user session

**Run this to verify:**
```sql
SELECT 
  DATE(occurred_at) as date,
  COUNT(*) as total_interactions,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE event_type = 'click' AND entity_type = 'event') as event_clicks,
  COUNT(*) FILTER (WHERE event_type = 'click_ticket') as ticket_clicks,
  COUNT(*) FILTER (WHERE event_type = 'search') as searches
FROM user_interactions
WHERE DATE(occurred_at) >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(occurred_at)
ORDER BY date DESC;
```

---

## 📚 ADDITIONAL RESOURCES

- **Full Implementation Plan:** `INTERACTION_TRACKING_IMPLEMENTATION_PLAN.md`
- **All Tracking Points:** `TRACKING_ACCESS_POINTS_MAP.md`
- **Database Schema:** `supabase/migrations/20250125000003_create_unified_interaction_tracking.sql`
- **Service Code:** `src/services/interactionTrackingService.ts`

---

**Ready to start tracking? Let's go! 🚀**

**Questions?** Check the full implementation plan or ping the team in Slack.

---

**End of Quick Start Guide**  
**Last Updated:** January 11, 2025

