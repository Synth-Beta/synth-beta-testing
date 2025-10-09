# Codebase Organization Summary

## ✅ Organization Completed

### SQL Files - Now Properly Organized
**All SQL files have been moved to the `sql/` folder structure:**

- **sql/analysis/** - Debug and analysis queries
  - `debug_attendance_reviews.sql`
  - `debug_review_attendance.sql`
  - `debug_setlist_storage.sql`
  - (+ existing analysis scripts)

- **sql/fixes/** - Data fix scripts
  - `cleanup_duplicate_draft_reviews.sql`
  - `fix_existing_reviews_attendance.sql`
  - `fix_interaction_tracking.sql`
  - (+ existing fix scripts)

- **supabase/migrations/** - Production database migrations (72 files)
  - Use these for actual Supabase database changes
  - Run with `supabase db push` or migration commands

**⚠️ REMINDER: Always put SQL testing scripts in `sql/analysis/` or `sql/fixes/`, and Supabase changes in `supabase/migrations/`**

---

### Shell Scripts - Now in scripts/ Folder
**All `.sh` files moved to `scripts/` folder:**

- ✅ **`deploy_production_ready.sh`** - NECESSARY
  - Production deployment verification
  - Runs build, tests, and creates deployment summary
  - **Keep this** - useful for pre-deployment checks

- ✅ **`apply_migration.sh`** - NECESSARY
  - Applies Supabase migrations
  - Verifies migration success
  - **Keep this** - useful for database updates

- ✅ **`apply_event_interest_notifications.sh`** - SEMI-NECESSARY
  - Specific migration for event interest feature
  - Can be deleted if already applied
  - **Consider archiving after migration is complete**

- ✅ **`apply_interested_events_fix.sh`** - SEMI-NECESSARY
  - Specific fix for interested events
  - Can be deleted if already applied
  - **Consider archiving after fix is complete**

**Recommendation:** Keep `deploy_production_ready.sh` and `apply_migration.sh`. Archive the others after their migrations are confirmed applied.

---

### Documentation Files - Cleaned Up

**✅ KEPT - Important Documentation (Root Level):**
- `README.md` - Main project overview and quick start
- `FEATURES.md` - Comprehensive feature documentation
- `DEV_SETUP.md` - Development environment setup
- `DEPLOYMENT.md` - Production deployment guide
- `BRAND_GUIDE.md` - Design system and brand guidelines
- `INTEGRATIONS.md` - External API integrations

**✅ MOVED - Specialized Documentation (docs/ folder):**
- `docs/PHOTO_INTEGRATION_GUIDE.md`
- `docs/SETLIST_INTEGRATION.md`
- `docs/TESTING_INSTRUCTIONS.md`

**✅ ARCHIVED - Historical Fix Documentation (docs/fixes-archive/):**
All the old fix/debug documents that cluttered the root:
- ARTIST_TABLE_FIX.md
- ATTENDANCE_DUPLICATE_FIX.md
- ATTENDANCE_FIX_SUMMARY.md
- ATTENDANCE_STATE_FIX.md
- DRAFT_1_STAR_REVIEW_FIX.md
- DUPLICATE_REVIEW_FIX.md
- ISSUE_FIXES_SUMMARY.md
- PERMANENT_1_STAR_FIX.md
- REVIEW_ATTENDANCE_FIX.md
- REVIEW_FEED_FIX.md
- REVIEW_MODAL_FIX.md
- SETLIST_CORS_FIX.md
- VENUE_DEBUG_SUMMARY.md
- VENUE_TABLE_AUDIT_FIX.md

These are kept for historical reference but out of the way.

---

### eslint.config.js - VERY IMPORTANT ✅

**YES, keep `eslint.config.js`!** It's essential for:
- Code quality enforcement
- TypeScript linting
- React hooks rules
- CI/CD pipeline checks
- Team code consistency

It's properly configured with:
- TypeScript ESLint
- React Hooks plugin
- React Refresh plugin
- Relaxed rules for your development style

---

## 🎵 What This Codebase Is For

**PlusOne** - A social music event platform to connect concert-goers

### The Problem It Solves
People want to go to concerts but don't want to go alone. PlusOne helps you:
1. Discover local concerts and events
2. Find like-minded people to attend with
3. Connect with friends who share your music taste
4. Review and rate concerts and venues

### The Vision
"Never go to shows, concerts, or activities alone again!"

---

## 🚀 Main Features (Fully Implemented)

### 1. **Event Discovery & Search** 🔍
- Real-time concert search via JamBase API
- Location-based event discovery (radius search)
- Artist, venue, and city filtering
- Event details with ticket links
- User interest tracking ("I'm interested" button)

### 2. **Review System** ⭐
- **Event Reviews** - Rate both artist performance AND venue experience separately
- **Venue Reviews** - Rate just the venue
- **Artist Reviews** - Rate just the artist
- **Post-Submit Ranking** - Rank reviews with same ratings (e.g., order your 4-star reviews)
- **Social Engagement** - Likes, comments, shares on reviews
- **Tags System** - Tag performances and venues (high-energy, great-sound, etc.)
- **Photo/Video Support** - Add media to reviews
- **Draft System** - Save reviews as drafts

### 3. **Music Integration** 🎧
- **Spotify Integration** - Connect Spotify, sync top tracks/artists/genres
- **Apple Music Integration** - Connect Apple Music, sync library and listening history
- **Unified Stats Display** - Auto-detects and displays your streaming service
- **Music Preferences** - Uses listening data for recommendations
- **Genre Analysis** - Identifies your music taste patterns

### 4. **Social Features** 👥
- **User Profiles** - Custom profiles with music preferences
- **Friends System** - Send/accept friend requests
- **Friend Requests & Notifications** - Real-time notifications
- **Chat System** - Direct messages between users
- **Event Matching** - Find others interested in same events
- **Social Feed** - See friends' reviews and activity

### 5. **Venue & Artist Profiles** 🏛️
- **Venue Profiles** - Detailed venue information with reviews
- **Artist Profiles** - Auto-populated from JamBase API
- **Venue Analytics** - Average ratings, popular tags
- **Artist Event Listings** - See upcoming shows
- **Clickable Relationships** - Click artist/venue names to see related events

### 6. **Setlist Integration** 🎸
- **Setlist.fm Integration** - Fetch actual setlists from concerts
- **Custom Setlists** - Add your own setlist if not available
- **Setlist Display** - View songs played at shows
- **Review Enhancement** - Attach setlists to your reviews

### 7. **Location Services** 📍
- **Radius Search** - Find events within X miles
- **City/State Filtering** - Search by location
- **Zip Code Lookup** - Location autocomplete
- **Distance Calculations** - Show distances to venues
- **Venue Normalization** - Standardize venue city names

### 8. **Advanced Features** 🔥
- **Offline Support** - Service worker for offline access
- **Mobile-First Design** - Fully responsive, touch-optimized
- **Dark Mode Support** - Automatic theme detection
- **Real-time Updates** - Supabase real-time subscriptions
- **Optimistic Updates** - Instant UI feedback
- **Image Optimization** - Cached and optimized photos

---

## 🏗️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for blazing fast development
- **Tailwind CSS** + **shadcn/ui** for beautiful UI
- **React Router** for navigation

### Backend
- **Supabase** (PostgreSQL + Auth + Real-time + Storage)
- **Express.js** backend for proxies and custom endpoints
- **Row Level Security (RLS)** for data protection

### APIs & Integrations
- **JamBase API** - Concert and artist data
- **Setlist.fm API** - Concert setlists
- **Spotify API** - Music streaming integration
- **Apple Music API** - Music streaming integration
- **Cities API** - Location and geocoding

### Deployment
- **Vercel** for frontend hosting
- **Supabase Cloud** for database and backend services
- **Automatic deployments** from GitHub

---

## 📁 Clean Project Structure (After Organization)

```
synth-beta-testing-1/
├── README.md                    # Main docs - START HERE
├── FEATURES.md                  # Feature documentation
├── DEV_SETUP.md                 # Development setup guide
├── DEPLOYMENT.md                # Deployment instructions
├── BRAND_GUIDE.md               # Design system
├── INTEGRATIONS.md              # API integration guide
├── eslint.config.js             # Linting configuration (IMPORTANT!)
├── package.json                 # Dependencies
├── vite.config.ts               # Build configuration
├── tailwind.config.ts           # Styling configuration
│
├── src/                         # Frontend application
│   ├── components/              # React components (189 files)
│   ├── services/                # API services (39 files)
│   ├── hooks/                   # Custom React hooks
│   ├── pages/                   # Page components
│   ├── types/                   # TypeScript definitions
│   └── utils/                   # Utility functions
│
├── backend/                     # Express.js backend
│   ├── server.js                # Main server
│   ├── setlist-routes.js        # Setlist API proxy
│   ├── search-routes.js         # Search endpoints
│   └── streaming-profile-routes.js
│
├── supabase/                    # Database
│   ├── migrations/              # 72 migration files (PRODUCTION DB CHANGES)
│   └── config.toml              # Supabase config
│
├── sql/                         # SQL Scripts (TESTING & ANALYSIS)
│   ├── analysis/                # Debug queries
│   ├── fixes/                   # Data fix scripts
│   ├── scripts/                 # Utility scripts
│   └── seeds/                   # Seed data
│
├── scripts/                     # Shell scripts (NEW!)
│   ├── deploy_production_ready.sh
│   ├── apply_migration.sh
│   └── comprehensive-setlist-enrichment.js
│
├── docs/                        # Additional documentation (NEW!)
│   ├── PHOTO_INTEGRATION_GUIDE.md
│   ├── SETLIST_INTEGRATION.md
│   ├── TESTING_INSTRUCTIONS.md
│   └── fixes-archive/           # Historical fix docs (14 files)
│
└── public/                      # Static assets
    ├── Logos/                   # Brand logos
    └── founders/                # Team photos
```

---

## ✅ I Understand the Codebase!

Yes! Here's what I understand:

### Core Purpose
PlusOne is a **social concert discovery platform** that solves the "going to concerts alone" problem by:
1. Showing you concerts happening nearby
2. Connecting you with people who like the same music
3. Letting you review and rate concerts
4. Building a music-loving community

### Key Differentiators
1. **Split Ratings** - Rate artist performance AND venue separately
2. **Post-Submit Ranking** - Nuanced preferences within same star rating
3. **Music Streaming Integration** - Use your actual listening data
4. **Setlist Integration** - See what songs were played
5. **Social Matching** - Find concert buddies based on music taste

### Main User Flows
1. **Discover** → Search for concerts by artist/location
2. **Connect** → Find friends who like same music
3. **Plan** → Mark events as interested, chat with potential attendees
4. **Attend** → Go to concert with new friends
5. **Review** → Rate the artist, venue, and overall experience
6. **Share** → Post review, get likes/comments, build profile

---

## 🎯 Next Steps & Reminders

### Development Workflow
1. ✅ Always put SQL testing in `sql/analysis/` or `sql/fixes/`
2. ✅ Always put Supabase schema changes in `supabase/migrations/`
3. ✅ Use `scripts/deploy_production_ready.sh` before deploying
4. ✅ Keep `eslint.config.js` - it's important!
5. ✅ Main docs in root, specialized docs in `docs/`

### Clean Code Practices
- Historical fix docs are archived in `docs/fixes-archive/`
- Shell scripts are in `scripts/`
- All SQL organized in `sql/` folder
- Only essential README files in root

---

**Generated:** October 9, 2025
**Status:** ✅ Codebase Organized and Documented

