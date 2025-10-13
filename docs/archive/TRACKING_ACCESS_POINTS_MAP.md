# 🗺️ Synth App - Complete Tracking Access Points Map

**Visual Guide to All User Interaction Tracking Points**

---

## 📱 APP NAVIGATION STRUCTURE

```
┌─────────────────────────────────────────────────────────────┐
│                    SYNTH APP HIERARCHY                       │
└─────────────────────────────────────────────────────────────┘

MainApp (src/components/MainApp.tsx)
├── UnifiedFeed (src/components/UnifiedFeed.tsx)
│   ├── Events Tab
│   │   ├── Event Cards
│   │   │   ├── [TRACK] Event Impression (IntersectionObserver)
│   │   │   ├── [TRACK] Event Card Click → EventDetailsModal
│   │   │   ├── [TRACK] Artist Name Click → ArtistEvents page
│   │   │   ├── [TRACK] Venue Name Click → VenueEvents page
│   │   │   ├── [TRACK] Like Button
│   │   │   ├── [TRACK] Comment Button
│   │   │   ├── [TRACK] Share Dropdown
│   │   │   └── [TRACK] Follow Artist Button
│   │   └── EventDetailsModal (src/components/events/EventDetailsModal.tsx)
│   │       ├── [TRACK] Modal Open (view start)
│   │       ├── [TRACK] Modal Close (view duration)
│   │       ├── [TRACK] Ticket Link Click (!!!)
│   │       ├── [TRACK] Interest Toggle
│   │       ├── [TRACK] Review Button Click
│   │       ├── [TRACK] Setlist View
│   │       ├── [TRACK] Artist Name Click
│   │       ├── [TRACK] Venue Name Click
│   │       ├── [TRACK] Share Button
│   │       └── [TRACK] Comments Section
│   │
│   ├── Reviews Tab
│   │   ├── Review Cards
│   │   │   ├── [TRACK] Review Impression
│   │   │   ├── [TRACK] Review Card Click → ReviewModal
│   │   │   ├── [TRACK] Like Button
│   │   │   ├── [TRACK] Comment Button
│   │   │   ├── [TRACK] Share Button
│   │   │   └── [TRACK] Event Name Click (inside review)
│   │   └── ReviewModal (src/components/reviews/ProfileReviewCard.tsx)
│   │       ├── [TRACK] Modal Open (view start)
│   │       ├── [TRACK] Modal Close (view duration)
│   │       └── [TRACK] All social actions
│   │
│   ├── News Tab
│   │   └── News Cards
│   │       ├── [TRACK] News Article Impression
│   │       ├── [TRACK] News Article Click
│   │       └── [TRACK] News Source Filter Change
│   │
│   ├── Feed Controls
│   │   ├── [TRACK] Tab Change (Events/Reviews/News)
│   │   ├── [TRACK] Filter Change (All/Following)
│   │   ├── [TRACK] Sort Change (Relevance/Date/Price/etc)
│   │   ├── [TRACK] Load More Button
│   │   ├── [TRACK] Scroll Depth
│   │   └── [TRACK] Pull to Refresh
│   │
│   └── Event Review Modal (src/components/EventReviewModal.tsx)
│       ├── [TRACK] Review Start
│       ├── [TRACK] Review Submit (with full metadata)
│       ├── [TRACK] Review Cancel
│       ├── [TRACK] Photo Upload
│       └── [TRACK] Setlist Add
│
├── RedesignedSearchPage (src/components/search/RedesignedSearchPage.tsx)
│   ├── Search Bar
│   │   ├── [TRACK] Search Query Submit
│   │   ├── [TRACK] Search Type Change (Artists/Events/All)
│   │   └── [TRACK] Search Clear
│   │
│   ├── Search Results
│   │   ├── [TRACK] Results Displayed (with counts & load time)
│   │   ├── [TRACK] No Results (with query)
│   │   ├── Artist Results
│   │   │   ├── [TRACK] Artist Card Impression
│   │   │   ├── [TRACK] Artist Card Click → ArtistEvents page
│   │   │   └── [TRACK] Follow Button
│   │   └── Event Results
│   │       ├── [TRACK] Event Card Impression
│   │       ├── [TRACK] Event Card Click → EventDetailsModal
│   │       └── [Same as Feed Event interactions]
│   │
│   └── Search Filters
│       ├── [TRACK] Filter Apply
│       └── [TRACK] Sort Change
│
├── ProfileView (src/components/profile/ProfileView.tsx)
│   ├── [TRACK] View Own Profile
│   ├── [TRACK] View Other User Profile
│   ├── [TRACK] Profile Tab Change (Reviews/Interested/Attended/Friends)
│   ├── [TRACK] Edit Profile
│   ├── [TRACK] Upload Avatar
│   ├── [TRACK] Connect Spotify
│   ├── [TRACK] Disconnect Spotify
│   ├── [TRACK] Update Email Preferences
│   ├── [TRACK] Send Friend Request
│   ├── [TRACK] Accept Friend Request
│   ├── [TRACK] Reject Friend Request
│   └── Profile Content
│       ├── My Reviews List
│       │   └── [Same as Review Card interactions]
│       ├── Interested Events List
│       │   └── [Same as Event Card interactions]
│       └── Attended Events List
│           └── [Same as Event Card interactions]
│
├── ArtistEvents Page (src/pages/ArtistEvents.tsx)
│   ├── [TRACK] Artist Page View
│   ├── [TRACK] Artist Page Exit (with duration)
│   ├── Artist Header
│   │   ├── [TRACK] Follow Artist Button
│   │   └── [TRACK] Artist Info View
│   ├── Tabs
│   │   ├── [TRACK] Tab Change (Events/Reviews)
│   │   ├── Upcoming Events Tab
│   │   │   └── Event Cards → [Same as Feed Events]
│   │   └── Reviews Tab
│   │       └── Review Cards → [Same as Feed Reviews]
│   └── [TRACK] Scroll Depth
│
├── VenueEvents Page (src/pages/VenueEvents.tsx)
│   ├── [TRACK] Venue Page View
│   ├── [TRACK] Venue Page Exit (with duration)
│   ├── Venue Header
│   │   ├── [TRACK] Follow Venue Button
│   │   ├── [TRACK] View Map
│   │   └── [TRACK] Venue Info View
│   ├── Venue Events List
│   │   └── Event Cards → [Same as Feed Events]
│   └── [TRACK] Scroll Depth
│
└── UnifiedChatView (src/components/UnifiedChatView.tsx)
    ├── [TRACK] Open Chat List
    ├── [TRACK] Open Conversation
    ├── [TRACK] Send Message
    ├── [TRACK] Share Event via Message
    └── [TRACK] React to Message
```

---

## 🎯 TRACKING POINTS BY CATEGORY

### **1. EVENT TRACKING** (19 points)

#### **Discovery & Visibility**
| # | Location | Action | Track As | Priority |
|---|----------|--------|----------|----------|
| 1 | Feed Event Card | Card appears in viewport | `impression` → `event` | **CRITICAL** |
| 2 | Search Results | Event appears in results | `impression` → `event` | **CRITICAL** |
| 3 | Artist Page | Event shown on artist page | `impression` → `event` | HIGH |
| 4 | Venue Page | Event shown on venue page | `impression` → `event` | HIGH |
| 5 | Profile | Event in "Interested" list | `impression` → `event` | MEDIUM |

#### **Engagement**
| # | Location | Action | Track As | Priority |
|---|----------|--------|----------|----------|
| 6 | Feed/Search | Click event card | `click` → `event` | **CRITICAL** |
| 7 | Event Modal | Modal opens | `view` → `event` | **CRITICAL** |
| 8 | Event Modal | Modal closes | `view_end` → `event` | **CRITICAL** |
| 9 | Event Modal | Click ticket link | `click_ticket` → `event` | **CRITICAL** 💰 |
| 10 | Feed/Modal | Mark as interested | `interest` → `event` | HIGH |
| 11 | Feed/Modal | Remove interest | `interest` → `event` | HIGH |
| 12 | Feed/Modal | Like event | `like` → `event` | MEDIUM |
| 13 | Feed/Modal | Unlike event | `like` → `event` | MEDIUM |
| 14 | Feed/Modal | Comment on event | `comment` → `event` | MEDIUM |
| 15 | Feed/Modal | Share event (in-app) | `share` → `event` | MEDIUM |
| 16 | Feed/Modal | Share event (external) | `share` → `event` | HIGH |
| 17 | Event Modal | View event likers | `view_likers` → `event` | LOW |
| 18 | Event Modal | View event comments | `view_comments` → `event` | LOW |
| 19 | Event Modal | View setlist | `view_setlist` → `event` | MEDIUM |

**Estimated Revenue Impact:** VERY HIGH (Ticket commissions, promoted events)

---

### **2. REVIEW TRACKING** (13 points)

#### **Discovery**
| # | Location | Action | Track As | Priority |
|---|----------|--------|----------|----------|
| 20 | Feed Review Card | Card appears in viewport | `impression` → `review` | HIGH |
| 21 | Event Modal | Review shown | `impression` → `review` | MEDIUM |
| 22 | Profile | Review shown | `impression` → `review` | MEDIUM |
| 23 | Artist Page | Review shown | `impression` → `review` | MEDIUM |
| 24 | Venue Page | Review shown | `impression` → `review` | MEDIUM |

#### **Engagement**
| # | Location | Action | Track As | Priority |
|---|----------|--------|----------|----------|
| 25 | Feed | Click review card | `click` → `review` | HIGH |
| 26 | Review Modal | Modal opens | `view` → `review` | HIGH |
| 27 | Review Modal | Modal closes | `view_end` → `review` | HIGH |
| 28 | Feed/Modal | Like review | `like` → `review` | MEDIUM |
| 29 | Feed/Modal | Unlike review | `like` → `review` | MEDIUM |
| 30 | Feed/Modal | Comment on review | `comment` → `review` | MEDIUM |
| 31 | Feed/Modal | Share review | `share` → `review` | MEDIUM |

#### **Creation**
| # | Location | Action | Track As | Priority |
|---|----------|--------|----------|----------|
| 32 | Event Modal/Profile | Start writing review | `review_start` → `event` | HIGH |
| 33 | Review Modal | Complete review | `review` → `event` | **CRITICAL** |
| 34 | Review Modal | Cancel review | `review_cancel` → `event` | MEDIUM |
| 35 | Review Modal | Edit review | `review_edit` → `review` | MEDIUM |
| 36 | Review Modal | Delete review | `review_delete` → `review` | MEDIUM |
| 37 | Review Modal | Upload photo | `upload_photo` → `review` | MEDIUM |
| 38 | Review Modal | Add setlist | `add_setlist` → `review` | MEDIUM |

**Estimated Revenue Impact:** HIGH (Influencer identification, quality content)

---

### **3. ARTIST TRACKING** (9 points)

| # | Location | Action | Track As | Priority |
|---|----------|--------|----------|----------|
| 39 | Search Bar | Search for artist | `search` → `artist` | HIGH |
| 40 | Search Results | Artist appears | `impression` → `artist` | MEDIUM |
| 41 | Search Results | Click artist | `click` → `artist` | HIGH |
| 42 | Feed Event Card | Click artist name | `click` → `artist` | HIGH |
| 43 | Event Modal | Click artist name | `click` → `artist` | HIGH |
| 44 | Artist Page | Visit artist page | `view` → `artist` | HIGH |
| 45 | Artist Page | Leave artist page | `view_end` → `artist` | MEDIUM |
| 46 | Any Location | Follow artist | `follow` → `artist` | **CRITICAL** |
| 47 | Any Location | Unfollow artist | `unfollow` → `artist` | HIGH |
| 48 | Artist Page | View events tab | `view_tab` → `artist` | LOW |
| 49 | Artist Page | View reviews tab | `view_tab` → `artist` | LOW |
| 50 | Artist Page | Scroll page | `scroll` → `artist` | LOW |

**Estimated Revenue Impact:** VERY HIGH (Artist partnerships, targeted ads)

---

### **4. VENUE TRACKING** (9 points)

| # | Location | Action | Track As | Priority |
|---|----------|--------|----------|----------|
| 51 | Search Bar | Search for venue | `search` → `venue` | MEDIUM |
| 52 | Search Results | Venue appears | `impression` → `venue` | LOW |
| 53 | Search Results | Click venue | `click` → `venue` | MEDIUM |
| 54 | Feed Event Card | Click venue name | `click` → `venue` | MEDIUM |
| 55 | Event Modal | Click venue name | `click` → `venue` | MEDIUM |
| 56 | Venue Page | Visit venue page | `view` → `venue` | HIGH |
| 57 | Venue Page | Leave venue page | `view_end` → `venue` | MEDIUM |
| 58 | Any Location | Follow venue | `follow` → `venue` | HIGH |
| 59 | Any Location | Unfollow venue | `unfollow` → `venue` | MEDIUM |
| 60 | Venue Page | View map | `view_map` → `venue` | LOW |

**Estimated Revenue Impact:** HIGH (Venue partnerships, local ads)

---

### **5. SEARCH TRACKING** (7 points)

| # | Location | Action | Track As | Priority |
|---|----------|--------|----------|----------|
| 61 | Search Page | Submit search query | `search` → `search` | **CRITICAL** |
| 62 | Search Page | Results displayed | `search_results` → `search` | **CRITICAL** |
| 63 | Search Page | No results found | `search_no_results` → `search` | HIGH |
| 64 | Search Page | Clear search | `search_clear` → `search` | LOW |
| 65 | Search Page | Change search type | `search_type_change` → `search` | MEDIUM |
| 66 | Search Page | Apply filter | `search_filter` → `search` | MEDIUM |
| 67 | Search Page | Change sort | `search_sort` → `search` | LOW |

**Estimated Revenue Impact:** VERY HIGH (Intent signals, targeting)

---

### **6. FEED TRACKING** (8 points)

| # | Location | Action | Track As | Priority |
|---|----------|--------|----------|----------|
| 68 | UnifiedFeed | Load feed | `view_feed` → `feed` | MEDIUM |
| 69 | UnifiedFeed | Switch tab | `tab_change` → `feed` | MEDIUM |
| 70 | UnifiedFeed | Scroll feed | `scroll_feed` → `feed` | MEDIUM |
| 71 | UnifiedFeed | Load more button | `load_more` → `feed` | MEDIUM |
| 72 | UnifiedFeed | Apply filter | `filter` → `feed` | MEDIUM |
| 73 | UnifiedFeed | Change sort | `sort` → `feed` | MEDIUM |
| 74 | UnifiedFeed | Reach end of feed | `feed_end` → `feed` | LOW |
| 75 | UnifiedFeed | Pull to refresh | `refresh_feed` → `feed` | LOW |

**Estimated Revenue Impact:** MEDIUM (Engagement depth, retention)

---

### **7. PROFILE TRACKING** (13 points)

| # | Location | Action | Track As | Priority |
|---|----------|--------|----------|----------|
| 76 | Profile | View own profile | `view_profile` → `profile` | LOW |
| 77 | Profile | View other user | `view_profile` → `profile` | MEDIUM |
| 78 | Profile | Edit profile | `profile_update` → `profile` | MEDIUM |
| 79 | Profile | Upload photo | `upload_avatar` → `profile` | LOW |
| 80 | Profile | View profile tabs | `view_tab` → `profile` | LOW |
| 81 | Profile | Connect Spotify | `connect_spotify` → `profile` | HIGH |
| 82 | Profile | Disconnect Spotify | `disconnect_spotify` → `profile` | MEDIUM |
| 83 | Profile | Update email prefs | `email_preferences` → `profile` | LOW |
| 84 | Any Location | Send friend request | `friend_request` → `user` | MEDIUM |
| 85 | Notifications | Accept friend request | `friend_accept` → `user` | MEDIUM |
| 86 | Notifications | Reject friend request | `friend_reject` → `user` | LOW |
| 87 | Profile | View connections | `view_connections` → `profile` | LOW |
| 88 | Profile | View mutual friends | `view_mutual_friends` → `profile` | LOW |

**Estimated Revenue Impact:** LOW (But important for social graph)

---

### **8. MESSAGING/CHAT TRACKING** (5 points)

| # | Location | Action | Track As | Priority |
|---|----------|--------|----------|----------|
| 89 | Chat | Open chat list | `view_chat_list` → `chat` | LOW |
| 90 | Chat | Open conversation | `view_conversation` → `chat` | LOW |
| 91 | Chat | Send message | `send_message` → `chat` | MEDIUM |
| 92 | Chat | Share event via message | `share_event_message` → `event` | HIGH |
| 93 | Chat | React to message | `message_reaction` → `chat` | LOW |

**Estimated Revenue Impact:** MEDIUM (Virality, organic promotion)

---

### **9. NEWS TRACKING** (4 points)

| # | Location | Action | Track As | Priority |
|---|----------|--------|----------|----------|
| 94 | News Tab | View news tab | `view_news` → `news` | LOW |
| 95 | News Tab | Click article | `click` → `news_article` | MEDIUM |
| 96 | News Tab | Filter by source | `filter_news` → `news` | LOW |
| 97 | News Tab | Refresh news | `refresh_news` → `news` | LOW |

**Estimated Revenue Impact:** LOW (But good for engagement)

---

### **10. NAVIGATION & SESSION TRACKING** (5 points)

| # | Location | Action | Track As | Priority |
|---|----------|--------|----------|----------|
| 98 | App | Session start | `session_start` → `app` | HIGH |
| 99 | App | Session end | `session_end` → `app` | HIGH |
| 100 | Navigation | Navigate between views | `navigate` → `view` | MEDIUM |
| 101 | App | Background app | `app_background` → `app` | LOW |
| 102 | App | Return to app | `app_foreground` → `app` | MEDIUM |

**Estimated Revenue Impact:** HIGH (Session duration = user quality)

---

## 📊 TRACKING PRIORITY MATRIX

### **CRITICAL (Must Implement First)** 💰
- Event impressions (IntersectionObserver)
- Event clicks (all locations)
- Ticket link clicks ⭐ **DIRECT REVENUE**
- Event detail view duration
- Search queries & results
- Review creation
- Artist/Venue follows

**Revenue Impact:** $$$$$  
**Implementation Time:** 3-4 days  
**ROI:** IMMEDIATE

---

### **HIGH PRIORITY (Implement Second)**
- Review impressions & clicks
- Artist clicks & page views
- Venue clicks & page views
- Event engagement (likes, comments, shares)
- Search result clicks
- Spotify connection tracking

**Revenue Impact:** $$$$  
**Implementation Time:** 4-5 days  
**ROI:** HIGH

---

### **MEDIUM PRIORITY (Implement Third)**
- Feed navigation (tabs, sort, filter)
- Profile views & edits
- Social actions (friend requests)
- Chat/messaging tracking
- Scroll depth tracking

**Revenue Impact:** $$$  
**Implementation Time:** 3-4 days  
**ROI:** MEDIUM

---

### **LOW PRIORITY (Nice to Have)**
- Tab view counts
- Likers modal views
- News article tracking
- App background/foreground
- Pull to refresh

**Revenue Impact:** $$  
**Implementation Time:** 2-3 days  
**ROI:** LOW (But good for UX insights)

---

## 🎯 CONVERSION FUNNEL (Most Important!)

```
┌─────────────────────────────────────────────────────────┐
│              EVENT CONVERSION FUNNEL                     │
└─────────────────────────────────────────────────────────┘

Step 1: IMPRESSION
├── Event appears in feed/search
├── [TRACK] impression → event
└── Metadata: position, feed_type, relevance_score

        ↓ (10-30% proceed)

Step 2: CLICK
├── User clicks event card
├── [TRACK] click → event
└── Metadata: source, position

        ↓ (50-70% proceed)

Step 3: VIEW DETAILS
├── Event details modal opens
├── [TRACK] view → event
└── Metadata: has_tickets, price_range

        ↓ (20-40% proceed)

Step 4: INTEREST
├── User marks "interested"
├── [TRACK] interest → event
└── Metadata: days_until_event

        ↓ (30-50% proceed)

Step 5: TICKET CLICK 💰
├── User clicks ticket link
├── [TRACK] click_ticket → event
└── Metadata: ticket_url, provider

        ↓ (10-30% convert)

Step 6: PURCHASE (External - track via UTM)
├── User completes purchase on ticket site
├── [TRACK] conversion_pixel → event
└── Revenue!

┌─────────────────────────────────────────────────────────┐
│  TYPICAL FUNNEL:                                         │
│  1000 impressions → 200 clicks → 100 views →            │
│  30 interested → 10 ticket clicks → 3 purchases         │
│                                                          │
│  Conversion Rate: 0.3%                                   │
│  Revenue per 1000 impressions: ~$150 (at $50/ticket)   │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 TRACKING IMPLEMENTATION CHECKLIST

### **Phase 1: High-Value Tracking** (Week 1)
- [ ] 1. Event impressions (IntersectionObserver)
- [ ] 2. Event clicks (all locations)
- [ ] 3. Ticket link clicks with UTM
- [ ] 4. Event modal view duration
- [ ] 5. Search queries & results
- [ ] 6. Artist clicks & follows
- [ ] 7. Venue clicks & follows

### **Phase 2: Review & Social** (Week 2)
- [ ] 8. Review impressions
- [ ] 9. Review clicks & views
- [ ] 10. Review creation tracking
- [ ] 11. Review engagement (likes, comments)
- [ ] 12. Social shares (in-app & external)

### **Phase 3: Feed & Navigation** (Week 3)
- [ ] 13. Feed tab changes
- [ ] 14. Feed sort & filter
- [ ] 15. Scroll depth tracking
- [ ] 16. Load more tracking
- [ ] 17. Page navigation tracking

### **Phase 4: Advanced** (Week 4)
- [ ] 18. Conversion funnel tracking
- [ ] 19. A/B test tracking
- [ ] 20. Session metrics
- [ ] 21. Profile interactions

---

## 📈 DATA FLOWS

### **Event Impression Flow**
```
User scrolls feed
  ↓
IntersectionObserver fires (50% visible)
  ↓
trackInteraction.view('event', eventId, ...)
  ↓
interactionTrackingService.queueInteraction()
  ↓
Batch queue (flush every 30s)
  ↓
supabase.from('user_interactions').insert([...])
  ↓
user_interactions table
  ↓
Nightly aggregation (aggregate_daily_analytics())
  ↓
analytics_event_daily table
  ↓
Analytics dashboard queries
  ↓
💰 Monetization insights
```

### **Ticket Click Flow** (CRITICAL for revenue)
```
User clicks ticket link in EventDetailsModal
  ↓
handleTicketClick()
  ↓
trackInteraction.click('ticket_link', eventId, {
  ticket_url,
  ticket_provider,
  price_range
})
  ↓
Add UTM parameters to ticket URL:
  ?utm_source=synth
  &utm_medium=app
  &utm_campaign=event_modal
  &utm_content=event_{eventId}
  &user_id={userId}
  ↓
Open ticket URL with tracking
  ↓
User completes purchase on external site
  ↓
Ticket platform reports conversion via webhook/pixel
  ↓
💰 Commission earned!
```

---

## 🎨 UI INDICATORS FOR TRACKING

### **Visual Feedback (Optional)**
```typescript
// Show user that action was tracked (builds trust)
const handleEventClick = async (eventId) => {
  // Track click
  await trackInteraction.click('event', eventId, { ... });
  
  // Visual feedback (subtle)
  toast({
    title: "Event saved to your history",
    duration: 1000,
    className: "opacity-70"
  });
};
```

### **Privacy Notice**
Add to app footer:
> "We collect anonymized interaction data to improve recommendations and support artists. [Learn more](#privacy)"

---

**Total Tracking Points:** 102  
**Critical Points:** 10  
**High Priority:** 15  
**Medium Priority:** 35  
**Low Priority:** 42

**Estimated Implementation Time:** 3-4 weeks  
**Estimated Revenue Impact:** $50K-$200K annually (based on 10K MAU)

---

**End of Access Points Map**  
**Last Updated:** January 11, 2025

