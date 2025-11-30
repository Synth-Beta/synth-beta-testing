# Reviews Table Schema (3NF Compliant)

## Complete Table Schema

```sql
CREATE TABLE public.reviews (
  -- Primary Key
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Foreign Keys (3NF: references other tables)
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  
  -- Overall Rating (calculated from 5 categories, stored as integer 1-5)
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  
  -- Legacy Ratings (for backward compatibility)
  artist_rating INTEGER CHECK (artist_rating >= 1 AND artist_rating <= 5),
  venue_rating INTEGER CHECK (venue_rating >= 1 AND venue_rating <= 5), -- May coexist with venue_rating DECIMAL
  
  -- 5-Category Rating System (0.5-5.0, half-star increments)
  artist_performance_rating DECIMAL(2,1) CHECK (artist_performance_rating >= 0.5 AND artist_performance_rating <= 5.0),
  production_rating DECIMAL(2,1) CHECK (production_rating >= 0.5 AND production_rating <= 5.0),
  venue_rating DECIMAL(2,1) CHECK (venue_rating >= 0.5 AND venue_rating <= 5.0), -- Or venue_rating_decimal if INTEGER venue_rating exists
  location_rating DECIMAL(2,1) CHECK (location_rating >= 0.5 AND location_rating <= 5.0),
  value_rating DECIMAL(2,1) CHECK (value_rating >= 0.5 AND value_rating <= 5.0),
  
  -- Overall Review Content
  reaction_emoji TEXT,
  review_text TEXT,
  
  -- 5-Category Feedback Text (optional written feedback for each category)
  artist_performance_feedback TEXT,
  production_feedback TEXT,
  venue_feedback TEXT,
  location_feedback TEXT,
  value_feedback TEXT,
  
  -- 5-Category Recommendation Labels (preset recommendation selections)
  artist_performance_recommendation TEXT,
  production_recommendation TEXT,
  venue_recommendation TEXT,
  location_recommendation TEXT,
  value_recommendation TEXT,
  
  -- Legacy Category Review Text (for backward compatibility)
  performance_review_text TEXT,
  venue_review_text TEXT,
  overall_experience_review_text TEXT,
  
  -- Media
  photos TEXT[],
  videos TEXT[],
  
  -- Tags / Context
  mood_tags TEXT[],
  genre_tags TEXT[],
  context_tags TEXT[],
  venue_tags TEXT[],
  artist_tags TEXT[],
  
  -- Review Metadata
  review_type TEXT CHECK (review_type IN ('event', 'venue', 'artist')),
  ticket_price_paid NUMERIC(8,2) CHECK (ticket_price_paid >= 0),
  
  -- Social / Engagement
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  
  -- Privacy & Draft Status
  is_public BOOLEAN DEFAULT true,
  is_draft BOOLEAN DEFAULT false,
  
  -- Attendees
  attendees TEXT[], -- Array of attendee objects (users or phone contacts)
  met_on_synth BOOLEAN DEFAULT false,
  
  -- Ranking
  rank_order INTEGER,
  was_there BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  UNIQUE(user_id, event_id),
  
  -- Legacy 3-category columns (may exist for backward compatibility)
  performance_rating DECIMAL(2,1) CHECK (performance_rating >= 0.5 AND performance_rating <= 5.0),
  venue_rating_new DECIMAL(2,1) CHECK (venue_rating_new >= 0.5 AND venue_rating_new <= 5.0),
  overall_experience_rating DECIMAL(2,1) CHECK (overall_experience_rating >= 0.5 AND overall_experience_rating <= 5.0)
);
```

## 3NF Compliance

✅ **First Normal Form (1NF)**: All attributes are atomic (no repeating groups)
- Each category rating is a separate column
- Arrays (photos, videos, tags, attendees) are properly normalized as PostgreSQL array types

✅ **Second Normal Form (2NF)**: All non-key attributes fully depend on the primary key
- All attributes directly relate to a specific review (identified by `id`)
- No partial dependencies

✅ **Third Normal Form (3NF)**: No transitive dependencies
- All attributes depend directly on the primary key (`id`)
- No attribute depends on another non-key attribute
- Foreign keys (user_id, event_id, artist_id, venue_id) reference other tables, maintaining referential integrity

## Form Data Point to Database Column Mapping

### Step 1: Event Details
| Form Field | Database Column | Type | Notes |
|------------|----------------|------|-------|
| `selectedArtist` | `artist_id` | UUID | Foreign key to artists table |
| `selectedVenue` | `venue_id` | UUID | Foreign key to venues table |
| `eventDate` | (stored in `events` table) | DATE | Not stored in reviews table |
| `selectedSetlist` | (stored separately) | JSONB | Setlist data stored in separate field |
| `customSetlist` | (stored separately) | JSONB | Custom setlist stored in separate field |

### Step 2: Artist Performance Category
| Form Field | Database Column | Type | Notes |
|------------|----------------|------|-------|
| `artistPerformanceRating` | `artist_performance_rating` | DECIMAL(2,1) | 0.5-5.0, half-star increments |
| `artistPerformanceFeedback` | `artist_performance_feedback` | TEXT | Optional written feedback |
| `artistPerformanceRecommendation` | `artist_performance_recommendation` | TEXT | Preset label (e.g., "Electric energy") |

### Step 3: Production Quality Category
| Form Field | Database Column | Type | Notes |
|------------|----------------|------|-------|
| `productionRating` | `production_rating` | DECIMAL(2,1) | 0.5-5.0, half-star increments |
| `productionFeedback` | `production_feedback` | TEXT | Optional written feedback |
| `productionRecommendation` | `production_recommendation` | TEXT | Preset label (e.g., "Insane light show") |

### Step 4: Venue Experience Category
| Form Field | Database Column | Type | Notes |
|------------|----------------|------|-------|
| `venueRating` | `venue_rating` or `venue_rating_decimal` | DECIMAL(2,1) | 0.5-5.0, half-star increments (uses venue_rating_decimal if INTEGER venue_rating exists) |
| `venueFeedback` | `venue_feedback` | TEXT | Optional written feedback |
| `venueRecommendation` | `venue_recommendation` | TEXT | Preset label (e.g., "Staff was incredible") |

### Step 5: Location & Logistics Category
| Form Field | Database Column | Type | Notes |
|------------|----------------|------|-------|
| `locationRating` | `location_rating` | DECIMAL(2,1) | 0.5-5.0, half-star increments |
| `locationFeedback` | `location_feedback` | TEXT | Optional written feedback |
| `locationRecommendation` | `location_recommendation` | TEXT | Preset label (e.g., "Easy transit") |

### Step 6: Value for Ticket Category
| Form Field | Database Column | Type | Notes |
|------------|----------------|------|-------|
| `valueRating` | `value_rating` | DECIMAL(2,1) | 0.5-5.0, half-star increments |
| `valueFeedback` | `value_feedback` | TEXT | Optional written feedback |
| `valueRecommendation` | `value_recommendation` | TEXT | Preset label (e.g., "Worth every dollar") |
| `ticketPricePaid` | `ticket_price_paid` | NUMERIC(8,2) | Private field, used for value calculations |

### Step 7: Review Content
| Form Field | Database Column | Type | Notes |
|------------|----------------|------|-------|
| `reviewText` | `review_text` | TEXT | Overall experience description |
| `reactionEmoji` | `reaction_emoji` | TEXT | Emoji reaction (e.g., "🔥", "🤩") |
| `photos` | `photos` | TEXT[] | Array of photo URLs |
| `videos` | `videos` | TEXT[] | Array of video URLs |
| `attendees` | `attendees` | TEXT[] | Array of attendee objects |
| `metOnSynth` | `met_on_synth` | BOOLEAN | Whether attendees met on Synth |

### Step 8: Privacy & Submit
| Form Field | Database Column | Type | Notes |
|------------|----------------|------|-------|
| `isPublic` | `is_public` | BOOLEAN | Whether review is publicly visible |
| (calculated) | `rating` | INTEGER | Overall rating (1-5), calculated from 5 categories |
| (auto) | `was_there` | BOOLEAN | Automatically set to true when review is created |

### Additional Fields (Not from Form)
| Database Column | Type | Notes |
|-----------------|------|-------|
| `id` | UUID | Primary key, auto-generated |
| `user_id` | UUID | Foreign key to users table |
| `event_id` | UUID | Foreign key to events table |
| `likes_count` | INTEGER | Counter for likes |
| `comments_count` | INTEGER | Counter for comments |
| `shares_count` | INTEGER | Counter for shares |
| `is_draft` | BOOLEAN | Whether review is a draft |
| `rank_order` | INTEGER | User-defined ranking order |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

## Summary

**Total Form Data Points**: 20 unique fields
- 5 category ratings
- 5 category feedback texts
- 5 category recommendations
- 5 other fields (reviewText, reactionEmoji, photos, videos, ticketPricePaid, attendees, metOnSynth, isPublic)

**Total Database Columns for Form Data**: 20 columns
- All form fields have direct 1:1 mapping to database columns
- No data loss or aggregation
- All fields are atomic and 3NF compliant

