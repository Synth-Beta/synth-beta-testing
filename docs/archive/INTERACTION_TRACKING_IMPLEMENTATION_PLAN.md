# 🎯 Complete Interaction Tracking & Monetization Implementation Plan

**Created:** January 11, 2025  
**Status:** Planning Phase  
**Database Audit Date:** January 11, 2025

---

## 📊 DATABASE AUDIT SUMMARY

### Current Database Schema (89 Tables)

#### **Core User Tables**
| Table | Purpose | Key Columns | Monetization Value |
|-------|---------|-------------|-------------------|
| `profiles` | User profiles | user_id, name, avatar_url, bio, instagram_handle, gender, birthday, last_active_at, is_public_profile | **HIGH** - Demographics, activity patterns |
| `streaming_profiles` | Spotify/Apple Music data | user_id, service_type, profile_data (JSONB), sync_status | **VERY HIGH** - Music preferences, artist affinity |
| `user_interactions` | ✅ **ALREADY EXISTS** | user_id, event_type, entity_type, entity_id, metadata (JSONB), session_id, occurred_at | **CRITICAL** - Primary tracking table |

#### **Event Tables**
| Table | Purpose | Key Columns | Monetization Value |
|-------|---------|-------------|-------------------|
| `jambase_events` | Concert event data | id, jambase_event_id, title, artist_name, venue_name, event_date, price_range, ticket_urls, setlist | **VERY HIGH** - Core inventory for ads/commissions |
| `user_jambase_events` | User event interests | user_id, jambase_event_id | **HIGH** - Intent signals |
| `event_likes` | Event like tracking | user_id, event_id | **HIGH** - Engagement metric |
| `event_comments` | Event comments | user_id, event_id, comment_text, parent_comment_id | **MEDIUM** - Social engagement |

#### **Review Tables**
| Table | Purpose | Key Columns | Monetization Value |
|-------|---------|-------------|-------------------|
| `user_reviews` | Concert reviews | user_id, event_id, rating, review_text, photos, likes_count, is_public | **VERY HIGH** - Quality content, influencer identification |
| `review_likes` | Review likes | user_id, review_id | **MEDIUM** - Social proof |
| `review_comments` | Review comments | user_id, review_id, comment_text | **MEDIUM** - Engagement depth |
| `review_shares` | Review shares | user_id, review_id, share_platform | **HIGH** - Viral potential |

#### **Artist & Venue Tables**
| Table | Purpose | Key Columns | Monetization Value |
|-------|---------|-------------|-------------------|
| `artists` | Artist entities | jambase_artist_id, name, image_url | **HIGH** - Partnership data |
| `artist_profile` | Detailed artist data | jambase_artist_id, genres, num_upcoming_events, external_identifiers (JSONB) | **VERY HIGH** - Targeting data |
| `artist_follows` | User-artist follows | user_id, artist_id | **VERY HIGH** - Preference signals |
| `venues` | Venue entities | jambase_venue_id, name, city, state, latitude, longitude | **HIGH** - Geographic targeting |
| `venue_profile` | Detailed venue data | jambase_venue_id, address (JSONB), geo (JSONB), maximum_attendee_capacity | **HIGH** - Venue partnerships |
| `venue_follows` | User-venue follows | user_id, venue_id | **HIGH** - Location intent |

#### **Social Tables**
| Table | Purpose | Key Columns | Monetization Value |
|-------|---------|-------------|-------------------|
| `friends` | Friend connections | user1_id, user2_id | **MEDIUM** - Social graph |
| `friend_requests` | Pending friend requests | sender_id, receiver_id, status | **LOW** - Growth metric |
| `chats` | Chat conversations | users (uuid[]), is_group_chat, latest_message_id | **MEDIUM** - Engagement depth |
| `messages` | Chat messages | chat_id, sender_id, message | **LOW** - Virality potential |

#### **Notification Tables**
| Table | Purpose | Key Columns | Monetization Value |
|-------|---------|-------------|-------------------|
| `notifications` | User notifications | user_id, type (friend_request, review_liked, event_interest, artist_new_event), data (JSONB), is_read | **MEDIUM** - Re-engagement channel |

---

## 🔍 EXISTING TRACKING INFRASTRUCTURE

### ✅ What's Already Built

1. **`user_interactions` Table** (Created: 2025-01-25)
   - Unified tracking table following 3NF principles
   - Captures: `event_type`, `entity_type`, `entity_id`, `metadata`, `session_id`
   - Indexed on: user_id, event_type, entity_type, entity_id, occurred_at
   - RLS enabled with proper policies
   
2. **`interactionTrackingService.ts`** (Service Layer)
   - Singleton service with batch processing queue
   - Auto-flush every 30 seconds or on page unload
   - Convenience functions for: search, click, like, share, comment, review, interest, swipe, view, navigate
   
3. **Database Functions**
   - `log_user_interaction()` - Single event logging
   - `log_user_interactions_batch()` - Batch event logging
   - Both are SECURITY DEFINER and extract JWT identity anchors

### ❌ What's NOT Implemented Yet

- **No tracking calls in UI components** - Service exists but isn't being called
- **No impression tracking** - Events/reviews shown but not logged
- **No view duration tracking** - Modal open/close times not captured
- **No ticket link click tracking** - Critical monetization miss
- **No search tracking** - Query patterns not captured
- **No scroll depth tracking** - Engagement depth unknown

---

## 🎯 IMPLEMENTATION PLAN

---

## **PHASE 1: HIGH-VALUE TRACKING** (Immediate Revenue Impact)
**Estimated Time:** 3-4 days  
**Priority:** CRITICAL

### 1.1 Event Click Tracking

<br>**Files to Modify:**
- `src/components/UnifiedFeed.tsx` (Lines 747-762 - Event card onClick)
- `src/components/events/EventDetailsModal.tsx` (Line 47 - Modal open)
- `src/components/search/RedesignedSearchPage.tsx` (Event results)
- `src/pages/ArtistEvents.tsx` (Artist page events)
- `src/pages/VenueEvents.tsx` (Venue page events)

**Implementation:**
```typescript
// Add to event card onClick:
trackInteraction.click('event', eventId, {
  source: 'feed', // or 'search', 'artist_page', 'venue_page'
  position: index,
  feed_tab: activeTab,
  distance_miles: item.distance_miles,
  relevance_score: item.relevance_score
});
```

**Metadata to Capture:**
- `source`: Where click originated (feed/search/profile/artist_page/venue_page)
- `position`: Position in list
- `feed_tab`: Active tab when clicked (events/reviews/news)
- `distance_miles`: User proximity to event
- `relevance_score`: Algorithm confidence
- `artist_name`, `venue_name`, `event_date`, `price_range`

---

### 1.2 Event Impression Tracking (Feed Visibility)

**Files to Modify:**
- `src/components/UnifiedFeed.tsx` (Lines 741-992 - Event render)
- Use `IntersectionObserver` API

**Implementation:**
```typescript
// Add Intersection Observer hook
const eventObserver = useRef(null);

useEffect(() => {
  eventObserver.current = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          const eventId = entry.target.getAttribute('data-event-id');
          const position = entry.target.getAttribute('data-position');
          
          trackInteraction.view('event', eventId, undefined, {
            source: 'feed',
            position: parseInt(position),
            viewport_time: Date.now() // Track when it entered viewport
          });
        }
      });
    },
    { threshold: 0.5 } // Fire when 50% visible
  );

  return () => eventObserver.current?.disconnect();
}, []);

// Add to event card render:
<Card 
  data-event-id={item.event_data.id}
  data-position={index}
  ref={(el) => el && eventObserver.current?.observe(el)}
>
```

**Metadata to Capture:**
- `source`: 'feed'
- `position`: Position in feed
- `feed_type`: 'personalized' vs 'following'
- `scroll_depth`: How far user scrolled
- `viewport_time`: When entered viewport

---

### 1.3 Ticket Link Click Tracking

**Files to Modify:**
- `src/components/events/EventDetailsModal.tsx` (Ticket button clicks)
- `src/components/JamBaseEventCard.tsx` (If has ticket links)

**Implementation:**
```typescript
// Add to ticket link onClick:
const handleTicketClick = (ticketUrl: string, provider: string) => {
  trackInteraction.click('ticket_link', event.id, {
    ticket_url: ticketUrl,
    ticket_provider: provider,
    price_range: event.price_range,
    event_date: event.event_date,
    artist_name: event.artist_name,
    venue_name: event.venue_name,
    source: 'event_modal' // or 'event_card'
  });
  
  // Open ticket link
  window.open(ticketUrl, '_blank');
};
```

**Metadata to Capture:**
- `ticket_url`: Full URL
- `ticket_provider`: e.g., "ticketmaster", "stubhub"
- `price_range`: Event pricing
- `days_until_event`: Urgency factor
- `user_interested`: Boolean if user marked interest

---

### 1.4 Event Detail View Duration

**Files to Modify:**
- `src/components/events/EventDetailsModal.tsx`

**Implementation:**
```typescript
const EventDetailsModal = ({ event, isOpen, onClose, ...props }) => {
  const viewStartTime = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      viewStartTime.current = Date.now();
      
      trackInteraction.view('event', event.id, undefined, {
        source: 'event_modal',
        artist_name: event.artist_name,
        venue_name: event.venue_name,
        has_ticket_urls: event.ticket_urls?.length > 0,
        has_setlist: !!event.setlist
      });
    }
  }, [isOpen]);

  const handleClose = () => {
    if (viewStartTime.current) {
      const duration = Math.floor((Date.now() - viewStartTime.current) / 1000);
      
      trackInteraction.view('event', event.id, duration, {
        source: 'event_modal_close',
        duration_seconds: duration,
        interacted: hasInteracted // Track if user liked/commented/shared
      });
      
      viewStartTime.current = null;
    }
    
    onClose();
  };

  return <Dialog open={isOpen} onOpenChange={handleClose}>...</Dialog>;
};
```

**Metadata to Capture:**
- `duration_seconds`: Time modal was open
- `scrolled_to_bottom`: Boolean
- `interacted`: If user took any action
- `viewed_setlist`: If user viewed setlist
- `viewed_reviews`: If user scrolled to reviews

---

### 1.5 Search Query Tracking

**Files to Modify:**
- `src/components/search/RedesignedSearchPage.tsx` (Lines 591-668 - handleSearch)
- `src/components/search/CompactSearchBar.tsx`

**Implementation:**
```typescript
const handleSearch = async (query: string, type: SearchType) => {
  const searchStartTime = Date.now();
  
  // Track search initiation
  trackInteraction.search(type, query, {
    query,
    search_type: type,
    query_length: query.length,
    from_view: currentView
  });

  // ... perform search ...

  const searchDuration = Date.now() - searchStartTime;

  // Track search results
  trackInteraction.search('search_results', query, {
    query,
    search_type: type,
    result_count: results.length,
    artist_count: artistResults.length,
    event_count: eventResults.length,
    load_time_ms: searchDuration,
    has_results: results.length > 0
  });
};
```

**Metadata to Capture:**
- `query`: Actual search text
- `search_type`: 'artists'/'events'/'all'
- `query_length`: Character count
- `result_count`: Total results
- `load_time_ms`: Search performance
- `has_results`: Success/failure
- `filters_applied`: Any filters used

---

### 1.6 Artist & Venue Click Tracking

**Files to Modify:**
- `src/components/events/EventDetailsModal.tsx` (Lines 316-340 - Artist/venue name clicks)
- `src/components/UnifiedFeed.tsx` (Artist names in event cards)

**Implementation:**
```typescript
const handleArtistClick = (artistName: string, eventId: string) => {
  trackInteraction.click('artist', artistName, {
    source: 'event_modal', // or 'feed_event_card', 'search'
    event_id: eventId,
    artist_name: artistName,
    from_view: window.location.pathname
  });
  
  navigate(`/artist/${encodeURIComponent(artistName)}`);
};

const handleVenueClick = (venueName: string, eventId: string) => {
  trackInteraction.click('venue', venueName, {
    source: 'event_modal',
    event_id: eventId,
    venue_name: venueName,
    venue_city: event.venue_city,
    venue_state: event.venue_state
  });
  
  navigate(`/venue/${encodeURIComponent(venueName)}`);
};
```

---

## **PHASE 2: USER PROFILE TYPES & ANALYTICS DASHBOARD**
**Estimated Time:** 5-7 days  
**Priority:** HIGH

### 2.1 Create Profile Types System

**New Database Migration:** `20250112000000_create_profile_types_system.sql`

```sql
-- Create account_types enum
CREATE TYPE account_type AS ENUM (
  'user',           -- Regular concert-goer
  'artist',         -- Artist/band account
  'venue',          -- Venue/promoter account
  'admin',          -- Platform admin
  'promoter',       -- Event promoter
  'ad_account',     -- Advertising account
  'venue_manager',  -- Venue management
  'label',          -- Record label
  'media'           -- Media/press
);

-- Add account_type to profiles
ALTER TABLE public.profiles
ADD COLUMN account_type account_type DEFAULT 'user' NOT NULL,
ADD COLUMN verified BOOLEAN DEFAULT false,
ADD COLUMN verification_level TEXT CHECK (verification_level IN ('none', 'email', 'phone', 'identity', 'business')),
ADD COLUMN business_info JSONB DEFAULT '{}', -- For artist/venue/promoter accounts
ADD COLUMN subscription_tier TEXT CHECK (subscription_tier IN ('free', 'premium', 'professional', 'enterprise')),
ADD COLUMN subscription_expires_at TIMESTAMPTZ;

-- Create account_permissions table (flexible role-based permissions)
CREATE TABLE IF NOT EXISTS public.account_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_type account_type NOT NULL,
  permission_key TEXT NOT NULL, -- e.g., 'create_events', 'manage_ads', 'view_analytics'
  granted BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_type, permission_key)
);

-- Insert default permissions
INSERT INTO public.account_permissions (account_type, permission_key, granted) VALUES
-- User permissions
('user', 'view_events', true),
('user', 'create_reviews', true),
('user', 'like_events', true),
('user', 'comment', true),
('user', 'follow_artists', true),

-- Artist permissions
('artist', 'view_events', true),
('artist', 'create_reviews', true),
('artist', 'manage_artist_profile', true),
('artist', 'view_artist_analytics', true),
('artist', 'claim_events', true),

-- Venue permissions
('venue', 'view_events', true),
('venue', 'create_events', true),
('venue', 'manage_venue_profile', true),
('venue', 'view_venue_analytics', true),

-- Promoter permissions
('promoter', 'view_events', true),
('promoter', 'create_events', true),
('promoter', 'manage_promotions', true),
('promoter', 'view_event_analytics', true),

-- Ad Account permissions
('ad_account', 'create_campaigns', true),
('ad_account', 'manage_ads', true),
('ad_account', 'view_ad_analytics', true),
('ad_account', 'target_users', true),

-- Admin permissions (all)
('admin', 'manage_users', true),
('admin', 'manage_events', true),
('admin', 'manage_reviews', true),
('admin', 'view_all_analytics', true),
('admin', 'moderate_content', true);

-- Create indexes
CREATE INDEX idx_profiles_account_type ON public.profiles(account_type);
CREATE INDEX idx_profiles_verified ON public.profiles(verified);
CREATE INDEX idx_profiles_subscription_tier ON public.profiles(subscription_tier);

-- Create function to check permission
CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_type account_type;
  v_has_permission BOOLEAN;
BEGIN
  -- Get user's account type
  SELECT account_type INTO v_account_type
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  -- Check if permission exists and is granted
  SELECT COALESCE(granted, false) INTO v_has_permission
  FROM public.account_permissions
  WHERE account_type = v_account_type
  AND permission_key = p_permission;
  
  RETURN COALESCE(v_has_permission, false);
END;
$$;

-- Create view for user profiles with permissions
CREATE OR REPLACE VIEW public.profiles_with_permissions AS
SELECT 
  p.*,
  ARRAY_AGG(ap.permission_key) FILTER (WHERE ap.granted = true) as permissions
FROM public.profiles p
LEFT JOIN public.account_permissions ap ON ap.account_type = p.account_type
GROUP BY p.id;

-- Add RLS policy for account type restrictions
CREATE POLICY "Users can only upgrade account type with verification"
ON public.profiles
FOR UPDATE
USING (
  auth.uid() = user_id AND (
    -- Allow user to change to artist/venue if they have business_info
    (account_type = 'user' AND business_info IS NOT NULL) OR
    -- Admins can change any account type
    (SELECT account_type FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
  )
);
```

---

### 2.2 Analytics Dashboard Schema

**New Database Migration:** `20250112000001_create_analytics_tables.sql`

```sql
-- Create analytics aggregation tables for performance

-- Daily user engagement metrics
CREATE TABLE IF NOT EXISTS public.analytics_user_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Engagement metrics
  events_viewed INTEGER DEFAULT 0,
  events_clicked INTEGER DEFAULT 0,
  events_interested INTEGER DEFAULT 0,
  ticket_links_clicked INTEGER DEFAULT 0,
  
  -- Review metrics
  reviews_written INTEGER DEFAULT 0,
  reviews_liked INTEGER DEFAULT 0,
  reviews_commented INTEGER DEFAULT 0,
  
  -- Social metrics
  friends_added INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  shares_sent INTEGER DEFAULT 0,
  
  -- Session metrics
  sessions_count INTEGER DEFAULT 0,
  total_time_seconds INTEGER DEFAULT 0,
  avg_session_duration_seconds INTEGER,
  
  -- Search metrics
  searches_performed INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, date)
);

-- Event performance metrics (for ad targeting)
CREATE TABLE IF NOT EXISTS public.analytics_event_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.jambase_events(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Visibility metrics
  impressions INTEGER DEFAULT 0,
  unique_viewers INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  click_through_rate DECIMAL(5,4),
  
  -- Engagement metrics
  interested_count INTEGER DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2),
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  
  -- Conversion metrics
  ticket_link_clicks INTEGER DEFAULT 0,
  ticket_conversion_rate DECIMAL(5,4),
  
  -- Demographics (aggregated)
  viewer_demographics JSONB DEFAULT '{}', -- Age ranges, gender distribution
  viewer_locations JSONB DEFAULT '{}', -- City/state distribution
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(event_id, date)
);

-- Artist performance metrics
CREATE TABLE IF NOT EXISTS public.analytics_artist_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Profile metrics
  profile_views INTEGER DEFAULT 0,
  new_followers INTEGER DEFAULT 0,
  total_followers INTEGER DEFAULT 0,
  
  -- Event metrics
  active_events INTEGER DEFAULT 0,
  event_impressions INTEGER DEFAULT 0,
  event_clicks INTEGER DEFAULT 0,
  
  -- Review metrics
  reviews_received INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2),
  
  -- Engagement metrics
  total_engagement INTEGER DEFAULT 0, -- likes + comments + shares
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(artist_id, date)
);

-- Venue performance metrics
CREATE TABLE IF NOT EXISTS public.analytics_venue_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Profile metrics
  profile_views INTEGER DEFAULT 0,
  new_followers INTEGER DEFAULT 0,
  total_followers INTEGER DEFAULT 0,
  
  -- Event metrics
  events_hosted INTEGER DEFAULT 0,
  event_impressions INTEGER DEFAULT 0,
  event_attendance INTEGER DEFAULT 0,
  
  -- Review metrics
  reviews_received INTEGER DEFAULT 0,
  avg_venue_rating DECIMAL(3,2),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(venue_id, date)
);

-- Create aggregation function (run nightly)
CREATE OR REPLACE FUNCTION public.aggregate_daily_analytics(target_date DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Aggregate user daily metrics
  INSERT INTO public.analytics_user_daily (
    user_id, date, events_viewed, events_clicked, events_interested,
    ticket_links_clicked, reviews_written, searches_performed,
    sessions_count, total_time_seconds
  )
  SELECT 
    user_id,
    target_date,
    COUNT(*) FILTER (WHERE event_type = 'view' AND entity_type = 'event') as events_viewed,
    COUNT(*) FILTER (WHERE event_type = 'click' AND entity_type = 'event') as events_clicked,
    COUNT(*) FILTER (WHERE event_type = 'interest' AND entity_type = 'event') as events_interested,
    COUNT(*) FILTER (WHERE event_type = 'click_ticket') as ticket_links_clicked,
    COUNT(*) FILTER (WHERE event_type = 'review') as reviews_written,
    COUNT(*) FILTER (WHERE event_type = 'search') as searches_performed,
    COUNT(DISTINCT session_id) as sessions_count,
    EXTRACT(EPOCH FROM (MAX(occurred_at) - MIN(occurred_at)))::INTEGER as total_time_seconds
  FROM public.user_interactions
  WHERE DATE(occurred_at) = target_date
  GROUP BY user_id
  ON CONFLICT (user_id, date) 
  DO UPDATE SET
    events_viewed = EXCLUDED.events_viewed,
    events_clicked = EXCLUDED.events_clicked,
    events_interested = EXCLUDED.events_interested,
    ticket_links_clicked = EXCLUDED.ticket_links_clicked,
    reviews_written = EXCLUDED.reviews_written,
    searches_performed = EXCLUDED.searches_performed,
    sessions_count = EXCLUDED.sessions_count,
    total_time_seconds = EXCLUDED.total_time_seconds;

  -- Aggregate event daily metrics
  INSERT INTO public.analytics_event_daily (
    event_id, date, impressions, unique_viewers, clicks,
    interested_count, ticket_link_clicks
  )
  SELECT 
    entity_id::UUID,
    target_date,
    COUNT(*) FILTER (WHERE event_type = 'impression') as impressions,
    COUNT(DISTINCT user_id) FILTER (WHERE event_type IN ('view', 'click')) as unique_viewers,
    COUNT(*) FILTER (WHERE event_type = 'click') as clicks,
    COUNT(*) FILTER (WHERE event_type = 'interest') as interested_count,
    COUNT(*) FILTER (WHERE event_type = 'click_ticket') as ticket_link_clicks
  FROM public.user_interactions
  WHERE DATE(occurred_at) = target_date
  AND entity_type = 'event'
  GROUP BY entity_id
  ON CONFLICT (event_id, date)
  DO UPDATE SET
    impressions = EXCLUDED.impressions,
    unique_viewers = EXCLUDED.unique_viewers,
    clicks = EXCLUDED.clicks,
    interested_count = EXCLUDED.interested_count,
    ticket_link_clicks = EXCLUDED.ticket_link_clicks;
END;
$$;

-- Create indexes for analytics tables
CREATE INDEX idx_analytics_user_daily_user_date ON public.analytics_user_daily(user_id, date DESC);
CREATE INDEX idx_analytics_event_daily_event_date ON public.analytics_event_daily(event_id, date DESC);
CREATE INDEX idx_analytics_artist_daily_artist_date ON public.analytics_artist_daily(artist_id, date DESC);
CREATE INDEX idx_analytics_venue_daily_venue_date ON public.analytics_venue_daily(venue_id, date DESC);

-- Enable RLS
ALTER TABLE public.analytics_user_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_event_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_artist_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_venue_daily ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own analytics"
ON public.analytics_user_daily FOR SELECT
USING (auth.uid() = user_id OR public.user_has_permission(auth.uid(), 'view_all_analytics'));

CREATE POLICY "Event creators can view event analytics"
ON public.analytics_event_daily FOR SELECT
USING (public.user_has_permission(auth.uid(), 'view_event_analytics'));

CREATE POLICY "Artists can view their analytics"
ON public.analytics_artist_daily FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.account_type = 'artist'
  ) OR public.user_has_permission(auth.uid(), 'view_all_analytics')
);

CREATE POLICY "Venues can view their analytics"
ON public.analytics_venue_daily FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.account_type = 'venue'
  ) OR public.user_has_permission(auth.uid(), 'view_all_analytics')
);
```

---

### 2.3 Dashboard UI Components

**New Files to Create:**

1. **`src/pages/Analytics/UserAnalyticsDashboard.tsx`** - User engagement dashboard
2. **`src/pages/Analytics/ArtistAnalyticsDashboard.tsx`** - Artist performance dashboard
3. **`src/pages/Analytics/VenueAnalyticsDashboard.tsx`** - Venue performance dashboard
4. **`src/pages/Analytics/AdminAnalyticsDashboard.tsx`** - Admin/monetization dashboard
5. **`src/services/analyticsService.ts`** - Analytics API service

---

## **PHASE 3: ENGAGEMENT & RETENTION TRACKING**
**Estimated Time:** 4-5 days  
**Priority:** MEDIUM-HIGH

### 3.1 Review Interaction Tracking

**Files to Modify:**
- `src/components/UnifiedFeed.tsx` (Lines 1043-1283 - Review cards)
- `src/components/reviews/ReviewCard.tsx`
- `src/components/EventReviewModal.tsx`

**Implementation:**
```typescript
// Review impression tracking (same as events)
// Review click tracking
const handleReviewClick = (reviewId: string) => {
  trackInteraction.click('review', reviewId, {
    source: 'feed',
    position: index,
    rating: item.rating,
    has_photos: item.photos?.length > 0,
    review_age_days: daysSince(item.created_at)
  });
};

// Review creation tracking
const handleReviewSubmit = async (reviewData) => {
  const startTime = Date.now();
  
  // ... submit review ...
  
  const duration = Math.floor((Date.now() - startTime) / 1000);
  
  trackInteraction.review('event', eventId, reviewData.rating, {
    rating: reviewData.rating,
    review_length: reviewData.review_text?.length || 0,
    has_photos: reviewData.photos?.length > 0,
    photo_count: reviewData.photos?.length || 0,
    has_setlist: !!reviewData.setlist,
    mood_tags: reviewData.mood_tags,
    privacy: reviewData.is_public ? 'public' : 'private',
    time_to_complete_seconds: duration
  });
};

// Review like tracking (already exists, just enhance metadata)
const handleReviewLike = (reviewId: string, isLiked: boolean) => {
  trackInteraction.like('review', reviewId, isLiked, {
    review_rating: review.rating,
    source: 'feed', // or 'event_modal', 'profile'
    had_photos: review.photos?.length > 0
  });
};
```

---

### 3.2 Social Interaction Tracking

**Files to Modify:**
- `src/components/UnifiedChatView.tsx` (Message sending)
- `src/components/events/EventShareModal.tsx` (In-app sharing)

**Implementation:**
```typescript
// Message tracking
const handleSendMessage = (recipientId: string, message: string, eventId?: string) => {
  trackInteraction.comment('chat', recipientId, message.length, {
    has_event_share: !!eventId,
    event_id: eventId,
    message_length: message.length
  });
};

// In-app event sharing
const handleShareEvent = (eventId: string, recipientIds: string[]) => {
  trackInteraction.share('event', eventId, 'synth', {
    recipient_count: recipientIds.length,
    has_message: hasCustomMessage
  });
};
```

---

### 3.3 Feed & Navigation Tracking

**Files to Modify:**
- `src/components/UnifiedFeed.tsx` (Tab changes, scroll, load more)
- `src/components/MainApp.tsx` (View navigation)

**Implementation:**
```typescript
// Tab change tracking
const handleTabChange = (newTab: string) => {
  trackInteraction.navigate('feed_tab', newTab, {
    from_tab: activeTab,
    to_tab: newTab,
    items_viewed: feedItems.length
  });
  setActiveTab(newTab);
};

// Scroll depth tracking
useEffect(() => {
  let maxScroll = 0;
  
  const handleScroll = () => {
    const scrollPercent = (window.scrollY / document.documentElement.scrollHeight) * 100;
    if (scrollPercent > maxScroll) {
      maxScroll = scrollPercent;
    }
  };
  
  window.addEventListener('scroll', handleScroll);
  
  return () => {
    window.removeEventListener('scroll', handleScroll);
    
    // Log scroll depth on unmount
    if (maxScroll > 10) {
      trackInteraction.scroll('feed', 'max_scroll', {
        max_scroll_percent: Math.floor(maxScroll),
        active_tab: activeTab
      });
    }
  };
}, [activeTab]);

// Load more tracking
const handleLoadMore = () => {
  trackInteraction.click('load_more', 'feed', {
    active_tab: activeTab,
    current_items: feedItems.length,
    offset: feedItems.length
  });
  
  loadFeedData(feedItems.length);
};
```

---

## **PHASE 4: CONVERSION FUNNEL & ADVANCED TRACKING**
**Estimated Time:** 3-4 days  
**Priority:** MEDIUM

### 4.1 Conversion Funnel Tracking

**New Service:** `src/services/conversionFunnelService.ts`

```typescript
/**
 * Conversion Funnel Tracking Service
 * Tracks user journey from impression → click → interest → ticket purchase
 */

export class ConversionFunnelService {
  private static funnelState = new Map<string, FunnelStep[]>();

  static startFunnel(eventId: string, userId: string) {
    const funnelKey = `${userId}:${eventId}`;
    this.funnelState.set(funnelKey, [{
      step: 'impression',
      timestamp: Date.now()
    }]);
  }

  static trackFunnelStep(
    eventId: string,
    userId: string,
    step: 'click' | 'view_details' | 'interest' | 'ticket_click'
  ) {
    const funnelKey = `${userId}:${eventId}`;
    const steps = this.funnelState.get(funnelKey) || [];
    
    steps.push({
      step,
      timestamp: Date.now(),
      time_from_start: Date.now() - steps[0].timestamp
    });
    
    this.funnelState.set(funnelKey, steps);
    
    // Track in user_interactions
    trackInteraction.formSubmit('conversion_funnel', eventId, true, {
      funnel_step: step,
      funnel_position: steps.length,
      time_from_start_ms: steps[steps.length - 1].time_from_start,
      previous_step: steps[steps.length - 2]?.step
    });
  }

  static completeFunnel(eventId: string, userId: string) {
    const funnelKey = `${userId}:${eventId}`;
    const steps = this.funnelState.get(funnelKey);
    
    if (steps) {
      const totalTime = Date.now() - steps[0].timestamp;
      const stepsDuration = steps.map(s => s.time_from_start);
      
      trackInteraction.formSubmit('conversion_funnel_complete', eventId, true, {
        total_steps: steps.length,
        total_time_ms: totalTime,
        steps: steps.map(s => s.step),
        step_durations: stepsDuration
      });
      
      this.funnelState.delete(funnelKey);
    }
  }
}
```

---

### 4.2 A/B Testing Framework

**New Database Migration:** `20250112000002_create_ab_testing_system.sql`

```sql
-- Create experiments table
CREATE TABLE IF NOT EXISTS public.ab_experiments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  variants JSONB NOT NULL, -- Array of variant configs
  traffic_allocation JSONB NOT NULL, -- Percentage per variant
  success_metrics TEXT[] NOT NULL, -- e.g., ['click_through_rate', 'conversion_rate']
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create user experiment assignments table
CREATE TABLE IF NOT EXISTS public.user_experiment_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experiment_id UUID NOT NULL REFERENCES public.ab_experiments(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, experiment_id)
);

-- Create experiment events table
CREATE TABLE IF NOT EXISTS public.experiment_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  experiment_id UUID NOT NULL REFERENCES public.ab_experiments(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_value JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ DEFAULT now()
);

-- Function to assign user to experiment
CREATE OR REPLACE FUNCTION public.assign_user_to_experiment(
  p_user_id UUID,
  p_experiment_name TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_experiment_id UUID;
  v_variant_name TEXT;
  v_existing_variant TEXT;
BEGIN
  -- Check if already assigned
  SELECT variant_name INTO v_existing_variant
  FROM public.user_experiment_assignments uea
  JOIN public.ab_experiments e ON e.id = uea.experiment_id
  WHERE uea.user_id = p_user_id
  AND e.name = p_experiment_name
  AND e.is_active = true;
  
  IF v_existing_variant IS NOT NULL THEN
    RETURN v_existing_variant;
  END IF;
  
  -- Get experiment and assign variant
  SELECT id INTO v_experiment_id
  FROM public.ab_experiments
  WHERE name = p_experiment_name
  AND is_active = true;
  
  IF v_experiment_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Randomly assign variant based on traffic allocation
  -- (Simplified - production would use consistent hashing)
  v_variant_name := 'control'; -- Default
  
  INSERT INTO public.user_experiment_assignments (user_id, experiment_id, variant_name)
  VALUES (p_user_id, v_experiment_id, v_variant_name);
  
  RETURN v_variant_name;
END;
$$;
```

---

## **MONETIZATION USE CASES & REVENUE OPPORTUNITIES**

### 1. **Promoted Events (Cost-Per-Click)**
- **Data Used:** Event impressions, click-through rates, user demographics
- **Target:** Venues, promoters, artists
- **Revenue Model:** CPC ($0.50 - $2.00 per click)
- **Implementation:** Flag events as `is_promoted` with `promotion_budget`

### 2. **Artist & Venue Verification**
- **Data Used:** Account type, follower counts, engagement metrics
- **Target:** Artists, venues, labels
- **Revenue Model:** Subscription ($29-$99/month)
- **Implementation:** `verified` flag + `subscription_tier`

### 3. **Premium Analytics Dashboard**
- **Data Used:** All analytics tables
- **Target:** Artists, venues, promoters
- **Revenue Model:** Subscription ($49-$199/month)
- **Implementation:** Gated dashboard access by `account_type` + `subscription_tier`

### 4. **Ticket Commission Tracking**
- **Data Used:** `ticket_link_clicks` with UTM parameters
- **Target:** Ticketmaster, StubHub, SeatGeek partnerships
- **Revenue Model:** 3-5% commission per sale
- **Implementation:** UTM parameters in ticket URLs, conversion pixel

### 5. **Targeted Advertising**
- **Data Used:** User interests, genre preferences, location, engagement patterns
- **Target:** Brands, venues, festivals
- **Revenue Model:** CPM ($10-$30 per 1,000 impressions)
- **Implementation:** Ad units in feed, `ad_account` profile type

### 6. **Event Recommendations API**
- **Data Used:** Aggregated user interaction patterns
- **Target:** Other platforms, tourism boards
- **Revenue Model:** API calls ($0.01-$0.05 per call)
- **Implementation:** Public API endpoint with authentication

### 7. **Influencer Marketplace**
- **Data Used:** Review engagement, follower counts, conversion influence
- **Target:** Artists, labels, PR agencies
- **Revenue Model:** Platform fee (10-15% of deal)
- **Implementation:** Influencer ranking system + marketplace UI

---

## **IMPLEMENTATION TIMELINE**

### **Week 1: Foundation**
- ✅ Database audit (Complete)
- Day 1-2: Phase 1.1-1.2 (Event clicks + impressions)
- Day 3: Phase 1.3 (Ticket link tracking)
- Day 4: Phase 1.4 (View duration)
- Day 5: Phase 1.5-1.6 (Search + Artist/Venue clicks)

### **Week 2: Profile Types & Analytics**
- Day 1-2: Phase 2.1 (Profile types migration)
- Day 3-4: Phase 2.2 (Analytics schema)
- Day 5: Phase 2.3 (Dashboard UI scaffolding)

### **Week 3: Engagement & Retention**
- Day 1-2: Phase 3.1 (Review tracking)
- Day 3: Phase 3.2 (Social tracking)
- Day 4-5: Phase 3.3 (Feed & navigation)

### **Week 4: Advanced Features**
- Day 1-2: Phase 4.1 (Conversion funnels)
- Day 3-4: Phase 4.2 (A/B testing)
- Day 5: Testing & QA

---

## **TESTING & VALIDATION**

### **Tracking Validation Script**
```typescript
// src/utils/trackingValidator.ts
export class TrackingValidator {
  private static requiredFields = {
    event_click: ['source', 'position', 'artist_name', 'venue_name'],
    event_impression: ['source', 'position', 'feed_type'],
    ticket_click: ['ticket_url', 'ticket_provider', 'price_range'],
    search: ['query', 'search_type', 'result_count'],
  };

  static validate(eventType: string, metadata: any): boolean {
    const required = this.requiredFields[eventType];
    if (!required) return true;
    
    return required.every(field => metadata[field] !== undefined);
  }

  static async testTracking() {
    console.log('🧪 Testing interaction tracking...');
    
    // Test event click
    await trackInteraction.click('event', 'test-event-id', {
      source: 'test',
      position: 0,
      artist_name: 'Test Artist',
      venue_name: 'Test Venue'
    });
    
    // Verify data was written
    const { data, error } = await supabase
      .from('user_interactions')
      .select('*')
      .eq('entity_id', 'test-event-id')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (data && data.length > 0) {
      console.log('✅ Tracking test passed:', data[0]);
      return true;
    } else {
      console.error('❌ Tracking test failed:', error);
      return false;
    }
  }
}
```

---

## **MONITORING & ALERTS**

### **Key Metrics to Monitor**

1. **Tracking Health**
   - Events logged per minute
   - Failed tracking attempts
   - Batch flush frequency

2. **Data Quality**
   - Null metadata percentages
   - Invalid entity_id errors
   - Duplicate events

3. **Performance**
   - Tracking service latency
   - Database write performance
   - Analytics query times

### **Alert Thresholds**
- ⚠️ Warning: Tracking failure rate > 5%
- 🚨 Critical: Tracking failure rate > 20%
- ⚠️ Warning: Analytics queries > 2 seconds
- 🚨 Critical: Database connections exhausted

---

## **MAINTENANCE & OPTIMIZATION**

### **Data Retention Policy**
- **Raw `user_interactions`**: Keep 90 days, then archive to cold storage
- **Aggregated analytics**: Keep 2 years
- **Archive to S3**: Monthly exports for long-term analysis

### **Query Optimization**
- Create materialized views for common analytics queries
- Partition `user_interactions` table by month
- Regular VACUUM and ANALYZE on analytics tables

### **Privacy & GDPR Compliance**
- Implement user data export functionality
- Implement right-to-deletion (cascade deletes already configured)
- Anonymize interaction data after 90 days (hash user_id)

---

## **SUCCESS METRICS**

### **Technical KPIs**
- ✅ 95%+ tracking reliability
- ✅ < 100ms tracking latency (async)
- ✅ < 2s analytics query time
- ✅ Zero data loss

### **Business KPIs**
- 💰 Ticket click-through rate tracked
- 💰 Event promotion ROI measurable
- 💰 Artist/venue engagement quantified
- 💰 User LTV calculable

---

## **NEXT STEPS**

1. ✅ Review this plan with team
2. 📝 Get approval for database migrations
3. 🚀 Begin Phase 1 implementation
4. 📊 Set up monitoring dashboard
5. 🧪 Deploy tracking validation tests
6. 📈 Start capturing data!

---

**End of Implementation Plan**  
**Last Updated:** January 11, 2025

