# 🎯 Phase 2: Account Types & Analytics Dashboards Specification

**Created:** January 11, 2025  
**Status:** Design Phase  
**Implementation Target:** Week 2

---

## 🏗️ ACCOUNT TYPE SYSTEM

### **9 Account Types**

| Type | Primary Use Case | Subscription Required | Verification Required |
|------|-----------------|----------------------|----------------------|
| `user` | Regular concert-goers | No (Free) | Email only |
| `artist` | Musicians & bands | Yes ($29-99/mo) | Business verification |
| `venue` | Concert venues & clubs | Yes ($49-199/mo) | Business verification |
| `promoter` | Event promoters | Yes ($99-299/mo) | Business verification |
| `ad_account` | Advertisers & sponsors | Yes (Custom pricing) | Business verification |
| `label` | Record labels | Yes ($199-499/mo) | Business verification |
| `media` | Press & journalists | No (Free w/ verification) | Media credentials |
| `venue_manager` | Multi-venue operators | Yes ($299-999/mo) | Business verification |
| `admin` | Platform administrators | N/A (Internal) | Internal only |

---

## 📊 ANALYTICS BY ACCOUNT TYPE

---

## 1️⃣ **USER ACCOUNT** (Regular Concert-Goer)

### **Dashboard: "My Concert Stats"**

#### **Access Level:** FREE (Basic Analytics)

#### **Sections:**

##### **A. Personal Activity**
```
┌─────────────────────────────────────────────┐
│        YOUR CONCERT STATS                    │
├─────────────────────────────────────────────┤
│  🎵 Events Viewed This Month: 45            │
│  ⭐ Reviews Written: 12                      │
│  ❤️  Events Liked: 23                        │
│  📅 Events Interested In: 8                  │
│  ✅ Events Attended: 15                      │
└─────────────────────────────────────────────┘
```

**Data Sources:**
- `user_interactions` (event_type = 'view', entity_type = 'event')
- `user_reviews` (review count)
- `event_likes` (like count)
- `user_jambase_events` (interested events)

**SQL Query:**
```sql
SELECT 
  COUNT(*) FILTER (WHERE event_type = 'view' AND entity_type = 'event') as events_viewed,
  (SELECT COUNT(*) FROM user_reviews WHERE user_id = auth.uid()) as reviews_written,
  (SELECT COUNT(*) FROM event_likes WHERE user_id = auth.uid()) as events_liked,
  (SELECT COUNT(*) FROM user_jambase_events WHERE user_id = auth.uid()) as events_interested,
  COUNT(*) FILTER (WHERE event_type = 'attend') as events_attended
FROM user_interactions
WHERE user_id = auth.uid()
AND DATE(occurred_at) >= DATE_TRUNC('month', CURRENT_DATE);
```

##### **B. Your Music Taste**
- Top 10 artists (by views, likes, reviews)
- Top 5 venues visited
- Favorite genres
- Concert frequency (events per month)
- Average review rating

##### **C. Social Stats**
- Friends made through concerts: X
- Reviews liked by others: X
- Comments on your reviews: X
- People you've influenced: X (people who attended events you recommended)

##### **D. Achievements** (Gamification)
- 🏆 Concert Enthusiast (10+ events attended)
- ⭐ Trusted Reviewer (5+ reviews with 20+ likes)
- 🎤 Genre Explorer (reviewed 5+ genres)
- 📍 Local Expert (attended 10+ venues in your city)

**Monetization:** Upsell to Premium ($4.99/mo) for:
- Unlimited review history
- Advanced stats & charts
- Export data
- Ad-free experience

---

## 2️⃣ **ARTIST ACCOUNT** (Musicians & Bands)

### **Dashboard: "Artist Analytics Pro"**

#### **Access Level:** PREMIUM ($29-99/mo subscription required)

#### **Sections:**

##### **A. Audience Overview** 📊
```
┌─────────────────────────────────────────────────────────────┐
│              TAYLOR SWIFT - ARTIST DASHBOARD                 │
├─────────────────────────────────────────────────────────────┤
│  👥 Total Followers: 12,450                                  │
│  📈 New Followers (30d): +342 (↑ 2.8%)                      │
│  👁️  Profile Views (30d): 8,234                             │
│  ⭐ Average Rating: 4.7/5.0 (from 234 reviews)               │
└─────────────────────────────────────────────────────────────┘
```

**Data Sources:**
- `artist_follows` (follower count)
- `user_interactions` (WHERE entity_type = 'artist')
- `user_reviews` (WHERE artist_name = 'Taylor Swift')

**SQL Query:**
```sql
WITH artist_data AS (
  SELECT id, name FROM artists WHERE name = 'Taylor Swift'
  UNION
  SELECT id, name FROM artist_profile WHERE name = 'Taylor Swift'
)
SELECT 
  (SELECT COUNT(*) FROM artist_follows WHERE artist_id = artist_data.id) as total_followers,
  (SELECT COUNT(*) FROM artist_follows 
   WHERE artist_id = artist_data.id 
   AND created_at >= CURRENT_DATE - INTERVAL '30 days') as new_followers_30d,
  COUNT(*) FILTER (WHERE event_type = 'view' AND entity_type = 'artist') as profile_views_30d,
  (SELECT ROUND(AVG(rating), 2) FROM user_reviews ur
   JOIN jambase_events je ON ur.event_id = je.id
   WHERE je.artist_name = artist_data.name) as avg_rating,
  (SELECT COUNT(*) FROM user_reviews ur
   JOIN jambase_events je ON ur.event_id = je.id
   WHERE je.artist_name = artist_data.name) as review_count
FROM user_interactions, artist_data
WHERE entity_id = artist_data.name
AND occurred_at >= CURRENT_DATE - INTERVAL '30 days';
```

##### **B. Event Performance**
- **Upcoming Events Table:**
  - Event name, venue, date
  - Impressions, clicks, CTR
  - Interested users count
  - Ticket clicks
  - Expected attendance
  - **Promote Event** button (upsell)

- **Past Events Performance:**
  - Attendance numbers
  - Average review rating
  - Best/worst reviewed shows
  - Fan photos count

**Chart:** Event engagement trend over time

##### **C. Fan Engagement**
- **Geographic Distribution:**
  - Map showing where your fans are
  - Top 10 cities by follower count
  - Event demand by location

- **Fan Demographics:**
  - Age ranges (18-24: 35%, 25-34: 40%, etc.)
  - Gender distribution (if shared)
  - Active vs casual fans (engagement score)

- **Engagement Metrics:**
  - Reviews per event average
  - Fan photos/videos shared
  - Social media shares
  - Average review rating trend

##### **D. Discovery & Growth**
- **How Fans Find You:**
  - Search queries leading to your profile
  - Most common search terms
  - Referral sources

- **Follower Growth:**
  - Chart: Followers over time
  - Spike analysis (correlate with events, news)
  - Retention rate (active followers)

- **Competitor Insights:** (Premium tier)
  - Similar artists ranking
  - Cross-follower analysis
  - Genre popularity trends

##### **E. Revenue Insights** 💰 (Premium Plus $99/mo)
- **Ticket Sales Intelligence:**
  - Events by ticket clicks
  - Estimated ticket sales (based on CTR)
  - Revenue per event estimate
  - Ticket provider breakdown

- **Partnership Opportunities:**
  - High-engagement cities for touring
  - Optimal event timing (day/time analysis)
  - Venue recommendations (best performing)

**Monetization Features:**
- ✅ Verified badge ($29/mo base)
- ✅ Basic analytics ($29/mo)
- ✅ Advanced analytics ($69/mo)
- ✅ Revenue insights ($99/mo)
- ✅ Promoted profile placement ($199/mo)

---

## 3️⃣ **VENUE ACCOUNT** (Concert Venues)

### **Dashboard: "Venue Performance Hub"**

#### **Access Level:** PREMIUM ($49-199/mo subscription required)

#### **Sections:**

##### **A. Venue Overview**
```
┌─────────────────────────────────────────────────────────────┐
│           MADISON SQUARE GARDEN - VENUE DASHBOARD            │
├─────────────────────────────────────────────────────────────┤
│  📍 Location: New York, NY                                   │
│  👥 Total Followers: 5,678                                   │
│  📈 New Followers (30d): +156 (↑ 2.8%)                      │
│  🎵 Events This Month: 24                                    │
│  ⭐ Average Venue Rating: 4.5/5.0                            │
│  💺 Capacity: 20,789                                         │
└─────────────────────────────────────────────────────────────┘
```

##### **B. Event Calendar Performance**
- **Upcoming Events:**
  - Event name, artist, date
  - Impressions, clicks, interest count
  - Ticket clicks
  - Estimated attendance vs capacity
  - **Promote Event** button (CPC ads)

- **Historical Performance:**
  - Events by month/quarter
  - Average attendance
  - Sellout rate
  - Revenue per event (estimated)

##### **C. Audience Insights**
- **Visitor Demographics:**
  - Age distribution
  - Gender split
  - Distance traveled (avg miles)
  - Local vs tourist ratio

- **Fan Base:**
  - Venue followers
  - Repeat visitors (users who attended 2+ events)
  - VIP identification (top 10% most engaged)

##### **D. Venue Rating Analysis**
- **Overall Venue Rating:** 4.5/5.0
- **Rating Breakdown:**
  - Sound quality: 4.7
  - Atmosphere: 4.6
  - Location/access: 4.3
  - Staff/service: 4.4
  
- **Review Sentiment:**
  - Positive mentions: "great sound", "amazing venue"
  - Areas for improvement: "parking", "lines"

##### **E. Competitive Analysis** (Premium tier)
- Compare your venue vs similar venues in area
- Market share by genre
- Pricing comparison
- Artist booking recommendations

##### **F. Revenue Optimization** 💰
- **Ticket Performance:**
  - Total ticket clicks by event
  - Conversion rate by event type
  - Optimal pricing analysis
  - Best-selling events

- **Ad Campaign Performance:**
  - If running promoted events
  - CPC, CTR, conversion rates
  - ROI per campaign
  - Audience targeting effectiveness

**Monetization Features:**
- ✅ Basic venue analytics ($49/mo)
- ✅ Advanced analytics + CRM ($99/mo)
- ✅ Promoted events (CPC model)
- ✅ Multi-venue management ($199/mo)

---

## 4️⃣ **PROMOTER ACCOUNT** (Event Promoters)

### **Dashboard: "Promoter Command Center"**

#### **Access Level:** PREMIUM ($99-299/mo subscription required)

#### **Sections:**

##### **A. Portfolio Overview**
- Total events managed: X
- Active events: X
- Total impressions (30d): X
- Total ticket clicks (30d): X 💰
- Estimated revenue: $X

##### **B. Event Management**
- **Active Campaigns:**
  - Event cards with real-time metrics
  - Budget spent / remaining
  - ROI calculator
  - Pause/adjust campaign buttons

##### **C. Performance Metrics**
- **By Event:**
  - Impressions, clicks, CTR
  - Interested users
  - Ticket conversions
  - Revenue attribution

- **By Artist:**
  - Which artists drive most engagement
  - Artist draw power by market
  - Optimal artist pairings

- **By Venue:**
  - Best performing venues
  - Capacity utilization
  - Venue ROI

##### **D. Audience Targeting**
- **Current Audience:**
  - Demographics breakdown
  - Geographic heatmap
  - Interest overlap analysis

- **Lookalike Audiences:**
  - Find similar users to your best converters
  - Expansion opportunities
  - Market penetration by segment

##### **E. Campaign Optimization**
- **A/B Test Results:**
  - Compare event descriptions, images, pricing
  - Statistical significance indicators
  - Recommendations

- **Budget Allocation:**
  - Spend by event/artist/venue
  - Cost per ticket click
  - Recommended budget distribution

##### **F. Competitive Intelligence**
- Similar events in market
- Market saturation analysis
- Optimal event timing
- Pricing benchmarks

**Monetization Features:**
- ✅ Event management tools ($99/mo)
- ✅ Advanced targeting ($199/mo)
- ✅ Multi-event campaigns ($299/mo)
- ✅ White-label reporting ($499/mo)

---

## 5️⃣ **AD ACCOUNT** (Advertisers & Sponsors)

### **Dashboard: "Ad Campaign Manager"**

#### **Access Level:** CUSTOM PRICING (Based on spend)

#### **Sections:**

##### **A. Campaign Overview**
```
┌─────────────────────────────────────────────────────────────┐
│              RED BULL - CAMPAIGN DASHBOARD                   │
├─────────────────────────────────────────────────────────────┤
│  📢 Active Campaigns: 3                                      │
│  💰 Budget Spent (MTD): $2,450 / $5,000                     │
│  👁️  Total Impressions: 125,430                             │
│  🖱️  Total Clicks: 3,762 (3.0% CTR)                         │
│  💵 Cost Per Click: $0.65                                    │
│  🎯 Conversions: 234 (6.2% conversion rate)                 │
└─────────────────────────────────────────────────────────────┘
```

##### **B. Active Campaigns**
- **Campaign Cards:**
  - Campaign name & creative preview
  - Target audience size
  - Budget & pacing
  - Performance metrics (impressions, clicks, CTR, CPC)
  - Edit/pause/stop buttons

##### **C. Audience Targeting**
- **Target Segments:**
  - Age: 18-24, 25-34, 35-44, etc.
  - Gender: All, Male, Female, Non-binary
  - Location: Cities, states, radius
  - Interests: Genres, artists, venues
  - Behavior: Active users, ticket buyers, reviewers

- **Audience Insights:**
  - Segment size
  - Estimated reach
  - CPM estimates
  - Competition level

##### **D. Performance Analytics**
- **Campaign Performance:**
  - Impressions by day/hour
  - CTR trends
  - Conversion funnel
  - Best performing creatives

- **Audience Breakdown:**
  - Demographics of engagers
  - Geographic distribution
  - Device breakdown
  - Time of day optimization

##### **E. Creative Performance**
- **A/B Test Results:**
  - Creative variants comparison
  - Statistical significance
  - Winner declaration
  - Auto-optimize option

##### **F. Conversion Tracking**
- **Pixel Integration:**
  - Conversion pixel setup
  - Event tracking (button clicks, form submits)
  - Custom conversion goals
  - Attribution windows

- **ROI Calculator:**
  - Cost per acquisition
  - Customer lifetime value
  - ROAS (Return on Ad Spend)
  - Break-even analysis

**Monetization Features:**
- ✅ Minimum ad spend: $500/mo
- ✅ Platform fee: 20% of spend
- ✅ CPM: $10-30 (based on targeting)
- ✅ CPC: $0.50-$2.00
- ✅ Self-serve platform ($500-$5K/mo)
- ✅ Managed campaigns ($5K+/mo, +15% fee)

---

## 6️⃣ **LABEL ACCOUNT** (Record Labels)

### **Dashboard: "Label Roster Hub"**

#### **Access Level:** PREMIUM ($199-499/mo subscription required)

#### **Sections:**

##### **A. Roster Overview**
```
┌─────────────────────────────────────────────────────────────┐
│            ATLANTIC RECORDS - LABEL DASHBOARD                │
├─────────────────────────────────────────────────────────────┤
│  🎤 Artists Managed: 15                                      │
│  🎵 Total Events (30d): 87                                   │
│  👥 Combined Followers: 234,567                              │
│  ⭐ Average Rating: 4.6/5.0                                  │
│  💰 Estimated Ticket Revenue: $1.2M                          │
└─────────────────────────────────────────────────────────────┘
```

##### **B. Artist Portfolio Performance**
- **Artist Comparison Table:**
  - Artist name
  - Followers
  - Events (30d)
  - Avg attendance
  - Avg rating
  - Ticket click conversion
  - Est. revenue
  - Growth rate

- **Sort by:** Followers, engagement, revenue, growth

##### **C. Market Intelligence**
- **Genre Trends:**
  - Which genres are growing
  - Emerging markets
  - Seasonal patterns
  - Competition density

- **Geographic Opportunities:**
  - Untapped markets for your artists
  - Tour routing optimization
  - Venue recommendations

##### **D. Cross-Promotion Insights**
- **Fan Overlap:**
  - Which artists share fans
  - Optimal pairing for tours
  - Bundle ticket opportunities

- **Discovery Patterns:**
  - How fans discover your artists
  - Playlist influence
  - Social media impact

##### **E. A&R Intelligence** 🎯
- **Emerging Artists:**
  - Fast-growing artists in your genres
  - High engagement, low follower count
  - Signing opportunities

- **Trend Analysis:**
  - Rising genres
  - Geographic hotspots
  - Demographic shifts

##### **F. Revenue Attribution**
- Tour revenue by artist
- Streaming correlation (Spotify data)
- Marketing campaign ROI
- Partnership opportunities

**Monetization Features:**
- ✅ Multi-artist management ($199/mo for 5 artists)
- ✅ Unlimited artists ($499/mo)
- ✅ API access ($999/mo)
- ✅ White-label reports ($1,499/mo)
- ✅ Custom integrations (Enterprise pricing)

---

## 7️⃣ **VENUE MANAGER ACCOUNT** (Multi-Venue Operators)

### **Dashboard: "Multi-Venue Operations"**

#### **Access Level:** PREMIUM ($299-999/mo subscription required)

#### **Sections:**

##### **A. Portfolio Overview**
- Total venues: X
- Total events (30d): X
- Combined followers: X
- Total capacity: X
- Avg utilization: X%

##### **B. Venue Comparison**
- Side-by-side venue performance
- Capacity utilization by venue
- Revenue per venue
- Best performing venue by metric

##### **C. Operations Analytics**
- **Scheduling Optimization:**
  - Best days for events
  - Optimal event frequency
  - Artist/genre performance by venue

- **Resource Allocation:**
  - Staff requirements by event size
  - Equipment usage patterns
  - Maintenance scheduling

##### **D. Cross-Venue Insights**
- Artist draw power across venues
- Fan travel patterns
- Bundle ticketing opportunities
- Circuit tour planning

**Monetization Features:**
- ✅ Up to 5 venues ($299/mo)
- ✅ Unlimited venues ($999/mo)
- ✅ White-label booking platform (Custom)

---

## 8️⃣ **MEDIA ACCOUNT** (Press & Journalists)

### **Dashboard: "Press Hub"**

#### **Access Level:** FREE (with verification)

#### **Sections:**

##### **A. Story Discovery**
- **Trending Events:**
  - Events with highest engagement
  - Viral moments (high share rate)
  - Controversial reviews (wide rating variance)

- **Emerging Artists:**
  - Fast-growing follower counts
  - High engagement rates
  - Local success stories

##### **B. Press Resources**
- Artist press kits (if provided)
- Venue contact information
- Event photos (user-generated)
- Review highlights

##### **C. Coverage Tracking**
- Articles written (linked to events/artists)
- Article engagement (clicks from platform)
- Influence score

**Monetization:** Free for verified media, builds platform credibility

---

## 9️⃣ **ADMIN ACCOUNT** (Platform Administrators)

### **Dashboard: "Platform Command Center"**

#### **Access Level:** FULL ACCESS (Internal only)

#### **Sections:**

##### **A. Platform Health**
```
┌─────────────────────────────────────────────────────────────┐
│                  SYNTH PLATFORM METRICS                      │
├─────────────────────────────────────────────────────────────┤
│  👥 Daily Active Users: 1,234                                │
│  📊 Interactions (24h): 45,678                               │
│  🎵 Events in Database: 12,456                               │
│  ⭐ Reviews (30d): 567                                       │
│  💰 Revenue (MTD): $12,450                                   │
│  🎯 Ticket Click Rate: 3.2%                                  │
└─────────────────────────────────────────────────────────────┘
```

##### **B. User Analytics**
- **Growth Metrics:**
  - New signups (daily/weekly/monthly)
  - Activation rate (% who complete profile)
  - Retention cohorts
  - Churn analysis

- **Engagement Metrics:**
  - DAU/MAU ratio
  - Session duration
  - Actions per session
  - Feature usage breakdown

- **User Segmentation:**
  - Power users (top 10%)
  - Active users (weekly)
  - At-risk users (declining engagement)
  - Churned users

##### **C. Content Analytics**
- **Event Performance:**
  - Total events
  - Events with tickets vs without
  - Avg impressions per event
  - Top events by engagement

- **Review Quality:**
  - Review count trend
  - Review length analysis
  - Photo/video attachment rate
  - Rating distribution

- **Artist/Venue Performance:**
  - Top artists by followers
  - Top venues by engagement
  - Growth leaders
  - At-risk accounts

##### **D. Revenue Analytics** 💰
- **Ticket Commissions:**
  - Total ticket clicks
  - Estimated conversions (based on industry avg)
  - Revenue by ticket provider
  - Commission earned
  - Top revenue-generating events

- **Subscription Revenue:**
  - MRR (Monthly Recurring Revenue)
  - Churn rate
  - Expansion revenue
  - Downgrades

- **Advertising Revenue:**
  - Ad impressions served
  - Ad clicks
  - Revenue by advertiser
  - Fill rate

##### **E. Technical Metrics**
- **Tracking Health:**
  - Interactions logged per minute
  - Failed tracking attempts
  - Batch flush frequency
  - Data quality score

- **Performance:**
  - API response times
  - Database query performance
  - Error rates
  - Uptime

##### **F. Moderation Dashboard**
- Flagged reviews
- Reported users
- Content moderation queue
- Automated moderation alerts

##### **G. Business Intelligence**
- **Market Trends:**
  - Genre popularity over time
  - Geographic growth areas
  - Seasonal patterns
  - Emerging opportunities

- **Partnership Pipeline:**
  - Potential artist partnerships
  - Venue partnership opportunities
  - Advertiser prospects
  - API integration candidates

**Features:**
- ✅ Full platform analytics
- ✅ User management
- ✅ Content moderation
- ✅ Revenue tracking
- ✅ A/B test management
- ✅ Feature flags
- ✅ Data export (all tables)

---

## 📊 ANALYTICS ARCHITECTURE

### **Data Flow**

```
User Actions (UI)
    ↓
trackInteraction.X() calls
    ↓
interactionTrackingService (queue)
    ↓
Batch flush (every 30s)
    ↓
user_interactions table (raw data)
    ↓
Nightly aggregation (cron job)
    ↓
analytics_*_daily tables
    ↓
Dashboard queries
    ↓
Account-specific analytics UI
```

### **Database Schema** (New Tables)

```sql
-- Daily user analytics
analytics_user_daily (user_id, date, events_viewed, reviews_written, etc.)

-- Daily event analytics  
analytics_event_daily (event_id, date, impressions, clicks, ticket_clicks, etc.)

-- Daily artist analytics
analytics_artist_daily (artist_id, date, profile_views, new_followers, etc.)

-- Daily venue analytics
analytics_venue_daily (venue_id, date, events_hosted, avg_attendance, etc.)

-- Campaign performance (for ads)
analytics_campaign_daily (campaign_id, date, impressions, clicks, conversions, spend, etc.)
```

### **Real-Time vs Batch**

**Real-Time (Direct queries on user_interactions):**
- Current day metrics
- Live tracking dashboard
- Recent interactions

**Batch/Aggregated (analytics_*_daily tables):**
- Historical trends
- Cross-period comparisons
- Heavy analytics (complex queries)

---

## 🎨 DASHBOARD UI COMPONENTS

### **Shared Components** (All Account Types)

1. **`<MetricCard>`** - Single stat display
   ```tsx
   <MetricCard 
     title="Total Followers"
     value={12450}
     change={+342}
     changePercent={2.8}
     trend="up"
   />
   ```

2. **`<EngagementChart>`** - Line/bar charts
3. **`<EventTable>`** - Sortable event performance table
4. **`<GeographicMap>`** - Fan distribution map
5. **`<DemographicBreakdown>`** - Age/gender charts
6. **`<ComparisonTable>`** - Side-by-side comparisons

### **Account-Specific Components**

**Artist:**
- `<ArtistProfileStats>`
- `<FanGrowthChart>`
- `<EventPerformanceTable>`
- `<TourRoutePlanner>`

**Venue:**
- `<VenueCapacityUtilization>`
- `<EventCalendarHeatmap>`
- `<RevenueProjection>`
- `<CompetitorComparison>`

**Promoter:**
- `<CampaignManager>`
- `<AudienceTargeting>`
- `<BudgetOptimizer>`
- `<ABTestResults>`

**Admin:**
- `<PlatformHealthDashboard>`
- `<RevenueWaterfall>`
- `<UserCohortAnalysis>`
- `<ContentModerationQueue>`

---

## 💰 MONETIZATION TIERS

### **User Accounts**
- **Free:** Basic stats
- **Premium ($4.99/mo):** Advanced stats, export data, ad-free

### **Artist Accounts**
- **Basic ($29/mo):** Follower analytics, event performance
- **Pro ($69/mo):** + Fan demographics, revenue insights
- **Premium ($99/mo):** + Competitive analysis, A&R tools

### **Venue Accounts**
- **Basic ($49/mo):** Event analytics, follower stats
- **Pro ($99/mo):** + Audience insights, competitor analysis
- **Multi-Venue ($199/mo):** Manage unlimited venues

### **Promoter Accounts**
- **Starter ($99/mo):** Up to 5 events/mo
- **Professional ($199/mo):** Up to 20 events/mo
- **Enterprise ($299/mo):** Unlimited events, API access

### **Label Accounts**
- **Basic ($199/mo):** Up to 5 artists
- **Professional ($349/mo):** Up to 15 artists
- **Enterprise ($499/mo):** Unlimited artists, white-label

### **Ad Accounts**
- **Self-Serve:** $500+ monthly spend
- **Managed:** $5,000+ monthly spend (+15% fee)
- **Enterprise:** $25,000+ monthly spend (custom pricing)

---

## 🔐 PERMISSIONS MATRIX

| Feature | User | Artist | Venue | Promoter | Ad Account | Label | Media | Admin |
|---------|------|--------|-------|----------|------------|-------|-------|-------|
| **View own analytics** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **View event analytics** | ❌ | ✅ (own) | ✅ (own) | ✅ (managed) | ❌ | ✅ (roster) | ❌ | ✅ (all) |
| **View user demographics** | ❌ | ✅ (fans) | ✅ (visitors) | ✅ (audience) | ✅ (targets) | ✅ (fans) | ❌ | ✅ (all) |
| **Create events** | ❌ | ✅ (own) | ✅ (venue) | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Create ads** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Promote events** | ❌ | ✅ ($) | ✅ ($) | ✅ | ❌ | ✅ ($) | ❌ | ✅ |
| **Export data** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **API access** | ❌ | ❌ | ❌ | ✅ ($) | ✅ | ✅ ($) | ❌ | ✅ |
| **Moderate content** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **View platform metrics** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 📈 KEY METRICS BY ACCOUNT TYPE

### **USER**
- Events viewed, interested, attended
- Reviews written, likes received
- Friends made, social graph size
- Achievements unlocked

### **ARTIST**
- Follower growth rate
- Event attendance trends
- Review ratings (overall & by event)
- Fan engagement score
- Geographic distribution
- **Ticket conversion rate** 💰

### **VENUE**
- Event count & frequency
- Capacity utilization %
- Follower growth
- Venue rating (separate from events)
- Repeat visitor rate
- **Revenue per event** 💰

### **PROMOTER**
- Campaign impressions & clicks
- Cost per click (CPC)
- Ticket conversion rate
- ROI by event
- Audience targeting effectiveness
- **Revenue attributed** 💰

### **AD ACCOUNT**
- Campaign impressions & clicks
- CTR & CPC
- Conversion rate
- Cost per acquisition (CPA)
- ROAS (Return on Ad Spend)
- **Total ad spend & revenue** 💰

### **LABEL**
- Portfolio performance (all artists)
- Cross-artist fan overlap
- Market share by genre
- A&R opportunities
- Tour revenue attribution
- **Estimated total revenue** 💰

### **ADMIN**
- Platform DAU/MAU
- Revenue (all sources)
- User retention & churn
- Feature adoption rates
- System health metrics
- **Profit margins** 💰

---

## 🚀 IMPLEMENTATION ROADMAP

### **Phase 2.1: Database Schema** (Days 1-2)
- Create account types enum
- Add `account_type` to profiles
- Create permissions table
- Create analytics aggregation tables

### **Phase 2.2: Analytics Aggregation** (Day 3)
- Build daily aggregation function
- Set up cron job (nightly at 2am)
- Create materialized views
- Build helper functions

### **Phase 2.3: Dashboard UI** (Days 4-7)
- Build shared components (MetricCard, charts)
- Build User dashboard
- Build Artist dashboard  
- Build Venue dashboard
- Build Admin dashboard

### **Phase 2.4: Permissions & Access Control** (Day 8)
- Implement permission checking
- Build subscription gating
- Add upgrade CTAs
- Test access restrictions

---

## 🎯 SUCCESS CRITERIA

After Phase 2, each account type should have:
- ✅ Role-appropriate analytics dashboard
- ✅ Real-time metrics visible
- ✅ Historical trend charts
- ✅ Actionable insights
- ✅ Monetization features (for paid tiers)
- ✅ Export functionality
- ✅ Mobile-responsive UI

---

## 💡 NEXT STEPS

I'll implement Phase 2 by creating:
1. Database migration for account types & permissions
2. Analytics aggregation tables
3. Aggregation functions (cron jobs)
4. Dashboard UI components for each account type
5. Permission system
6. Subscription gating

**Ready to proceed with Phase 2 implementation?** 🚀

---

**END OF PHASE 2 SPECIFICATION**  
**Total Account Types:** 9  
**Total Analytics Dashboards:** 9  
**Estimated Revenue from Subscriptions:** $50K-$200K annually

