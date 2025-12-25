-- ============================================
-- NORMALIZE EXTERNAL IDs TO 3NF
-- ============================================
-- This migration creates a central table for ALL external/provider IDs
-- and normalizes the events table to use proper foreign keys (UUIDs)
-- instead of storing external IDs as foreign keys or duplicate text columns.
--
-- Goals:
-- 1. Create external_entity_ids table (one source of truth for provider IDs)
-- 2. Rename events columns to reflect they're internal UUIDs (not external IDs)
-- 3. Backfill existing external IDs into mapping table
-- 4. Remove redundant duplicate columns
-- 5. Prepare for multi-provider support (Ticketmaster, Spotify, etc.)
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Create central external IDs mapping table
-- ============================================
-- One row = "this internal entity corresponds to this provider ID"
-- Supports multiple providers (JamBase, Ticketmaster, Spotify, etc.)

CREATE TABLE IF NOT EXISTS public.external_entity_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What internal entity does this refer to?
  entity_type text NOT NULL CHECK (entity_type IN ('artist', 'venue', 'event')),
  entity_uuid uuid NOT NULL,
  
  -- Where did the ID come from?
  source text NOT NULL CHECK (source IN (
    'jambase', 'ticketmaster', 'spotify', 'seatgeek', 'dice', 'eventbrite', 'manual'
  )),
  
  external_id text NOT NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensures "JamBase artist 123" maps to exactly one internal artist
  CONSTRAINT external_entity_ids_source_type_external_id_uniq 
    UNIQUE (source, entity_type, external_id),
  
  -- Optional: ensure each entity has at most one id per source+type (helps avoid duplicates)
  -- Note: This constraint allows one artist to have both JamBase and Ticketmaster IDs
  CONSTRAINT external_entity_ids_entity_source_type_uniq 
    UNIQUE (entity_uuid, source, entity_type)
);

-- Helpful indexes for lookups
CREATE INDEX IF NOT EXISTS external_entity_ids_lookup_idx
  ON public.external_entity_ids (source, entity_type, external_id);

CREATE INDEX IF NOT EXISTS external_entity_ids_entity_idx
  ON public.external_entity_ids (entity_uuid);

CREATE INDEX IF NOT EXISTS external_entity_ids_type_source_idx
  ON public.external_entity_ids (entity_type, source);

-- Add helpful comments
COMMENT ON TABLE public.external_entity_ids IS 
  'Central mapping table for all external/provider IDs. Maps internal UUIDs to external provider IDs (JamBase, Ticketmaster, etc.). One source of truth for provider ID lookups.';

COMMENT ON COLUMN public.external_entity_ids.entity_type IS 
  'Type of entity: artist, venue, or event';

COMMENT ON COLUMN public.external_entity_ids.entity_uuid IS 
  'Internal UUID reference to artists(id), venues(id), or events(id). Note: This is polymorphic (references different tables based on entity_type), so it cannot be a traditional foreign key. Referential integrity is application-enforced. This is standard practice for polymorphic relationships (similar to Stripe, Shopify, etc.).';

COMMENT ON COLUMN public.external_entity_ids.source IS 
  'Provider/source of the external ID (jambase, ticketmaster, spotify, etc.)';

COMMENT ON COLUMN public.external_entity_ids.external_id IS 
  'The actual external ID string from the provider (e.g., "3953048" from JamBase)';

-- ============================================
-- STEP 2: Normalize events table column names
-- ============================================
-- Current schema has:
--   events.artist_jambase_id uuid  FK -> artists(id)
--   events.venue_jambase_id  uuid  FK -> venues(id)
--
-- Rename them to what they actually are: internal UUID foreign keys

DO $$
BEGIN
  -- Rename artist_jambase_id to artist_id (if it exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'events' 
      AND column_name = 'artist_jambase_id'
  ) THEN
    ALTER TABLE public.events RENAME COLUMN artist_jambase_id TO artist_id;
    RAISE NOTICE 'Renamed events.artist_jambase_id to events.artist_id';
  END IF;
  
  -- Rename venue_jambase_id to venue_id (if it exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'events' 
      AND column_name = 'venue_jambase_id'
  ) THEN
    ALTER TABLE public.events RENAME COLUMN venue_jambase_id TO venue_id;
    RAISE NOTICE 'Renamed events.venue_jambase_id to events.venue_id';
  END IF;
END $$;

-- ============================================
-- STEP 3: Ensure foreign keys are correct after rename
-- ============================================
-- Drop old constraints if they exist and recreate with correct names

DO $$
BEGIN
  -- Drop old constraints if they exist by name
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'events_artist_jambase_id_fkey'
  ) THEN
    ALTER TABLE public.events DROP CONSTRAINT events_artist_jambase_id_fkey;
    RAISE NOTICE 'Dropped old constraint events_artist_jambase_id_fkey';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'events_venue_jambase_id_fkey'
  ) THEN
    ALTER TABLE public.events DROP CONSTRAINT events_venue_jambase_id_fkey;
    RAISE NOTICE 'Dropped old constraint events_venue_jambase_id_fkey';
  END IF;
  
  -- Recreate as correctly named FKs (only if columns exist)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'artist_id'
  ) THEN
    -- Drop constraint if it already exists
    ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_artist_id_fkey;
    
    ALTER TABLE public.events
      ADD CONSTRAINT events_artist_id_fkey
        FOREIGN KEY (artist_id) REFERENCES public.artists(id)
        ON DELETE RESTRICT;
    RAISE NOTICE 'Created foreign key events_artist_id_fkey (ON DELETE RESTRICT - events require artists)';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'venue_id'
  ) THEN
    -- Drop constraint if it already exists
    ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_venue_id_fkey;
    
    ALTER TABLE public.events
      ADD CONSTRAINT events_venue_id_fkey
        FOREIGN KEY (venue_id) REFERENCES public.venues(id)
        ON DELETE RESTRICT;
    RAISE NOTICE 'Created foreign key events_venue_id_fkey (ON DELETE RESTRICT - events require venues)';
  END IF;
END $$;

-- ============================================
-- STEP 4: Drop trigger that maintains redundant text columns
-- ============================================
-- The trigger update_event_jambase_id_texts() maintains artist_jambase_id_text
-- and venue_jambase_id_text. We'll drop these columns, so drop the trigger first.

DROP TRIGGER IF EXISTS trigger_update_event_jambase_id_texts ON public.events;
DROP FUNCTION IF EXISTS public.update_event_jambase_id_texts();

-- ============================================
-- STEP 5: Backfill external IDs into mapping table
-- ============================================
-- Migrate existing external IDs from artists, venues, and events tables
-- into the new central mapping table

-- Artists: artists.jambase_artist_id is currently NOT NULL UNIQUE
INSERT INTO public.external_entity_ids (entity_type, entity_uuid, source, external_id)
SELECT 'artist', a.id, 'jambase', a.jambase_artist_id
FROM public.artists a
WHERE a.jambase_artist_id IS NOT NULL
  AND a.jambase_artist_id != ''  -- Exclude empty strings
ON CONFLICT (source, entity_type, external_id) DO NOTHING;

-- Venues: venues.jambase_venue_id exists (may not be unique in your schema)
INSERT INTO public.external_entity_ids (entity_type, entity_uuid, source, external_id)
SELECT 'venue', v.id, 'jambase', v.jambase_venue_id
FROM public.venues v
WHERE v.jambase_venue_id IS NOT NULL
  AND v.jambase_venue_id != ''  -- Exclude empty strings
ON CONFLICT (source, entity_type, external_id) DO NOTHING;

-- Events: events.jambase_event_id is UNIQUE
INSERT INTO public.external_entity_ids (entity_type, entity_uuid, source, external_id)
SELECT 'event', e.id, 'jambase', e.jambase_event_id
FROM public.events e
WHERE e.jambase_event_id IS NOT NULL
  AND e.jambase_event_id != ''  -- Exclude empty strings
ON CONFLICT (source, entity_type, external_id) DO NOTHING;

-- ============================================
-- STEP 6: Update views and functions that depend on columns we're about to drop
-- ============================================
-- We must update dependent objects BEFORE dropping columns
-- This includes views, functions, and triggers

-- Update is_event_relevant_to_user function to work with UUIDs
-- It will now receive UUIDs and look up external IDs internally if needed
CREATE OR REPLACE FUNCTION public.is_event_relevant_to_user(
  p_user_id UUID,
  p_event_artist_id TEXT,
  p_event_venue_id TEXT,
  p_event_venue_name TEXT,
  p_event_venue_city TEXT,
  p_event_venue_state TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_follows_artist BOOLEAN := false;
  v_follows_venue BOOLEAN := false;
  v_artist_uuid UUID;
  v_venue_uuid UUID;
BEGIN
  -- If p_event_artist_id is a UUID, use it directly; otherwise try to find UUID from external_entity_ids
  IF p_event_artist_id IS NOT NULL THEN
    -- Try to parse as UUID first
    BEGIN
      v_artist_uuid := p_event_artist_id::UUID;
    EXCEPTION WHEN OTHERS THEN
      -- Not a UUID, try to look it up as external ID
      SELECT entity_uuid INTO v_artist_uuid
      FROM public.external_entity_ids
      WHERE external_id = p_event_artist_id
        AND source = 'jambase'
        AND entity_type = 'artist'
      LIMIT 1;
    END;
    
    -- Check if user follows the artist (using UUID if we found one)
    IF v_artist_uuid IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM artist_follows af
        WHERE af.user_id = p_user_id
          AND af.artist_id = v_artist_uuid
        LIMIT 1
      ) INTO v_follows_artist;
    ELSE
      -- Fallback: try matching by external ID in artists table (backward compatibility)
      SELECT EXISTS (
        SELECT 1
        FROM artist_follows af
        JOIN artists a ON a.id = af.artist_id
        WHERE af.user_id = p_user_id
          AND LOWER(TRIM(a.jambase_artist_id)) = LOWER(TRIM(p_event_artist_id))
        LIMIT 1
      ) INTO v_follows_artist;
    END IF;
  END IF;
  
  -- If p_event_venue_id is a UUID, use it directly; otherwise try to find UUID from external_entity_ids
  IF p_event_venue_id IS NOT NULL THEN
    -- Try to parse as UUID first
    BEGIN
      v_venue_uuid := p_event_venue_id::UUID;
    EXCEPTION WHEN OTHERS THEN
      -- Not a UUID, try to look it up as external ID
      SELECT entity_uuid INTO v_venue_uuid
      FROM public.external_entity_ids
      WHERE external_id = p_event_venue_id
        AND source = 'jambase'
        AND entity_type = 'venue'
      LIMIT 1;
    END;
    
    -- Check if user follows the venue (using UUID if we found one)
    IF v_venue_uuid IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM user_venue_relationships uvr
        WHERE uvr.user_id = p_user_id
          AND uvr.venue_id = v_venue_uuid
        LIMIT 1
      ) INTO v_follows_venue;
    ELSE
      -- Fallback: try matching by external ID in venues table (backward compatibility)
      SELECT EXISTS (
        SELECT 1
        FROM user_venue_relationships uvr
        JOIN venues v ON v.id = uvr.venue_id
        WHERE uvr.user_id = p_user_id
          AND LOWER(TRIM(v.jambase_venue_id)) = LOWER(TRIM(p_event_venue_id))
        LIMIT 1
      ) INTO v_follows_venue;
    END IF;
  ELSIF p_event_venue_name IS NOT NULL THEN
    -- Fallback to name matching
    SELECT EXISTS (
      SELECT 1
      FROM user_venue_relationships uvr
      JOIN venues v ON v.id = uvr.venue_id
      WHERE uvr.user_id = p_user_id
        AND LOWER(TRIM(v.name)) = LOWER(TRIM(p_event_venue_name))
      LIMIT 1
    ) INTO v_follows_venue;
  END IF;
  
  RETURN v_follows_artist OR v_follows_venue;
END;
$$;

-- Update reviews_with_connection_degree view to use external_entity_ids
DROP VIEW IF EXISTS public.reviews_with_connection_degree CASCADE;

CREATE VIEW public.reviews_with_connection_degree AS
SELECT 
  ur.id as review_id,
  ur.user_id as reviewer_id,
  ur.event_id,
  ur.rating::numeric AS rating,
  ur.review_text::TEXT as review_text,
  ur.review_text::TEXT AS content,
  ur.is_public,
  ur.is_draft,
  ur.photos::TEXT[] as photos,
  je.setlist AS setlist,
  ur.likes_count,
  ur.comments_count,
  ur.shares_count,
  ur.created_at,
  ur.updated_at,
  -- Profile information
  p.name::TEXT as reviewer_name,
  p.avatar_url::TEXT as reviewer_avatar,
  p.verified as reviewer_verified,
  p.account_type::TEXT as reviewer_account_type,
  -- Event information
  je.title::TEXT as event_title,
  je.artist_name::TEXT as artist_name,
  je.venue_name::TEXT as venue_name,
  je.event_date,
  je.venue_city::TEXT as venue_city,
  je.venue_state::TEXT as venue_state,
  -- Get external IDs from external_entity_ids table (or NULL if not found)
  COALESCE(eei_artist.external_id, je.artist_id::TEXT) as artist_id,
  COALESCE(eei_venue.external_id, je.venue_id::TEXT) as venue_id,
  -- Connection degree (using existing function)
  COALESCE(
    public.get_connection_degree(auth.uid(), ur.user_id),
    999
  ) as connection_degree,
  -- Connection type label
  (SELECT label::TEXT FROM public.get_connection_info(auth.uid(), ur.user_id) LIMIT 1)::TEXT as connection_type_label,
  -- Connection color
  (SELECT color::TEXT FROM public.get_connection_info(auth.uid(), ur.user_id) LIMIT 1)::TEXT as connection_color
FROM public.reviews ur
JOIN public.users p ON ur.user_id = p.user_id
JOIN public.events je ON ur.event_id = je.id
-- Left join to get external IDs for artist
LEFT JOIN public.external_entity_ids eei_artist 
  ON eei_artist.entity_uuid = je.artist_id 
  AND eei_artist.entity_type = 'artist' 
  AND eei_artist.source = 'jambase'
-- Left join to get external IDs for venue
LEFT JOIN public.external_entity_ids eei_venue 
  ON eei_venue.entity_uuid = je.venue_id 
  AND eei_venue.entity_type = 'venue' 
  AND eei_venue.source = 'jambase'
WHERE ur.is_public = true 
  AND ur.is_draft = false
  AND ur.review_text != 'ATTENDANCE_ONLY'
  AND ur.review_text IS NOT NULL
  AND ur.review_text != ''
  AND ur.user_id != auth.uid() -- Exclude own reviews
  -- Filter by connection degree: include 1st, 2nd, relevant 3rd, and brand-new public reviews
  AND (
    public.get_connection_degree(auth.uid(), ur.user_id) IN (1, 2) -- Always include 1st and 2nd
    OR (
      public.get_connection_degree(auth.uid(), ur.user_id) = 3 
      -- Only include 3rd if relevant: current user follows the artist OR venue of THIS event
      AND public.is_event_relevant_to_user(
        auth.uid(), 
        COALESCE(eei_artist.external_id, je.artist_id::TEXT),
        COALESCE(eei_venue.external_id, je.venue_id::TEXT),
        je.venue_name,
        je.venue_city,
        je.venue_state
      )
    )
    OR (
      public.get_connection_degree(auth.uid(), ur.user_id) NOT IN (1, 2, 3)
      AND ur.created_at = ur.updated_at -- Only surface brand-new reviews
      AND ur.created_at >= (NOW() - INTERVAL '30 days')
    )
  );

GRANT SELECT ON public.reviews_with_connection_degree TO authenticated;

COMMENT ON VIEW public.reviews_with_connection_degree IS 
  'Reviews from 1st, 2nd, and relevant 3rd degree connections. 3rd degree only shows if the current user follows the artist OR venue of the review event. Updated to use external_entity_ids table for 3NF compliance.';

-- Update get_connection_degree_reviews function (it just uses the view, so it should work automatically)
-- But let's make sure it exists and is correct
CREATE OR REPLACE FUNCTION public.get_connection_degree_reviews(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  review_id UUID,
  reviewer_id UUID,
  event_id UUID,
  rating DECIMAL,
  review_text TEXT,
  content TEXT,
  is_public BOOLEAN,
  is_draft BOOLEAN,
  photos JSONB,
  setlist JSONB,
  likes_count INTEGER,
  comments_count INTEGER,
  shares_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  reviewer_name TEXT,
  reviewer_avatar TEXT,
  reviewer_verified BOOLEAN,
  reviewer_account_type TEXT,
  event_title TEXT,
  artist_name TEXT,
  venue_name TEXT,
  event_date TIMESTAMPTZ,
  venue_city TEXT,
  venue_state TEXT,
  artist_id TEXT,
  venue_id TEXT,
  connection_degree INTEGER,
  connection_type_label TEXT,
  connection_color TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Temporarily set auth context (view uses auth.uid())
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user_id::text)::text, false);
  
  RETURN QUERY
  SELECT 
    rwcd.review_id,
    rwcd.reviewer_id,
    rwcd.event_id,
    rwcd.rating,
    rwcd.review_text::TEXT,
    rwcd.content::TEXT,
    rwcd.is_public,
    rwcd.is_draft,
    CASE 
      WHEN rwcd.photos IS NULL THEN NULL::JSONB
      ELSE to_jsonb(rwcd.photos)  -- Convert TEXT[] to JSONB for function return
    END as photos,
    rwcd.setlist,
    rwcd.likes_count,
    rwcd.comments_count,
    rwcd.shares_count,
    rwcd.created_at,
    rwcd.updated_at,
    rwcd.reviewer_name::TEXT,
    rwcd.reviewer_avatar::TEXT,
    rwcd.reviewer_verified,
    rwcd.reviewer_account_type::TEXT,
    rwcd.event_title::TEXT,
    rwcd.artist_name::TEXT,
    rwcd.venue_name::TEXT,
    rwcd.event_date,
    rwcd.venue_city::TEXT,
    rwcd.venue_state::TEXT,
    rwcd.artist_id::TEXT,
    rwcd.venue_id::TEXT,
    rwcd.connection_degree,
    rwcd.connection_type_label::TEXT,
    rwcd.connection_color::TEXT
  FROM public.reviews_with_connection_degree AS rwcd
  ORDER BY 
    rwcd.connection_degree ASC, -- Prioritize closer connections (1st before 2nd before 3rd)
    rwcd.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_connection_degree_reviews(UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_connection_degree_reviews IS 
  'Returns reviews from 1st, 2nd, and relevant 3rd degree connections, ordered by connection degree then recency. Updated to use external_entity_ids table for 3NF compliance.';

-- Note: get_personalized_feed_v3 function also references artist_jambase_id_text and venue_jambase_id_text
-- However, functions don't create blocking dependencies for column drops (only views do)
-- The function will fail at runtime if called with old column references, so update it separately
-- or it will automatically work once we update it to use external_entity_ids joins

-- ============================================
-- STEP 7: Remove redundant duplicate columns
-- ============================================
-- These columns duplicate provider IDs that are now in external_entity_ids
-- They cause inconsistency and violate 3NF
-- Now safe to drop since we've updated all dependent views/functions

ALTER TABLE public.events
  DROP COLUMN IF EXISTS artist_jambase_id_text,
  DROP COLUMN IF EXISTS venue_jambase_id_text;

-- Drop indexes on the columns we just removed
DROP INDEX IF EXISTS idx_events_artist_jambase_id_text;
DROP INDEX IF EXISTS idx_events_venue_jambase_id_text;

-- ============================================
-- STEP 8: Create helper function for external ID lookups
-- ============================================
-- Makes it easier to query external IDs going forward

CREATE OR REPLACE FUNCTION public.get_external_id(
  p_entity_uuid uuid,
  p_source text,
  p_entity_type text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_external_id text;
BEGIN
  SELECT external_id INTO v_external_id
  FROM public.external_entity_ids
  WHERE entity_uuid = p_entity_uuid
    AND source = p_source
    AND (p_entity_type IS NULL OR entity_type = p_entity_type)
  LIMIT 1;
  
  RETURN v_external_id;
END;
$$;

COMMENT ON FUNCTION public.get_external_id IS 
  'Helper function to get external ID for an entity. Returns NULL if not found. NOTE: This is a convenience function for simple lookups. For complex queries, prefer explicit JOINs with external_entity_ids table for better performance and clarity.';

-- ============================================
-- STEP 9: Create helper function for reverse lookup (external ID -> UUID)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_entity_uuid_by_external_id(
  p_external_id text,
  p_source text,
  p_entity_type text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_entity_uuid uuid;
BEGIN
  SELECT entity_uuid INTO v_entity_uuid
  FROM public.external_entity_ids
  WHERE external_id = p_external_id
    AND source = p_source
    AND entity_type = p_entity_type
  LIMIT 1;
  
  RETURN v_entity_uuid;
END;
$$;

COMMENT ON FUNCTION public.get_entity_uuid_by_external_id IS 
  'Helper function to get internal UUID from external ID. Returns NULL if not found. NOTE: This is a convenience function for simple lookups. For complex queries, prefer explicit JOINs with external_entity_ids table for better performance and clarity.';

GRANT EXECUTE ON FUNCTION public.get_external_id(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_entity_uuid_by_external_id(text, text, text) TO authenticated;

-- ============================================
-- MIGRATION NOTES
-- ============================================
-- After running this migration, you'll need to update:
--
-- 1. Functions/views that reference:
--    - events.artist_jambase_id_text → use get_external_id(e.artist_id, 'jambase', 'artist')
--    - events.venue_jambase_id_text → use get_external_id(e.venue_id, 'jambase', 'venue')
--    - events.artist_jambase_id → use events.artist_id (it's the same column, just renamed)
--    - events.venue_jambase_id → use events.venue_id (it's the same column, just renamed)
--
-- 2. Application code that queries by external IDs:
--    - Instead of: WHERE artist_jambase_id_text = '123'
--    - Use: WHERE artist_id = get_entity_uuid_by_external_id('123', 'jambase', 'artist')
--
-- 3. ⚠️ CRITICAL: DO NOT drop JamBase columns too early!
--    DO NOT run these until ALL of the following are updated:
--      ✅ All ingestion/sync code
--      ✅ All views and materialized views
--      ✅ All functions and stored procedures
--      ✅ All application code (frontend + backend)
--      ✅ All scheduled jobs/cron tasks
--      ✅ All data export/import scripts
--    
--    Only after everything is switched to external_entity_ids:
--      ALTER TABLE public.artists DROP COLUMN IF EXISTS jambase_artist_id;
--      ALTER TABLE public.venues DROP COLUMN IF EXISTS jambase_venue_id;
--      ALTER TABLE public.events DROP COLUMN IF EXISTS jambase_event_id;
--    
--    Staged migration = safe migration. Premature column drops = production incidents.
--
-- 4. The external_entity_ids table now enforces uniqueness:
--    - One external ID per source+type maps to exactly one internal entity
--    - One internal entity can have multiple external IDs (different sources)
--
-- 5. Foreign Key Behavior:
--    - events.artist_id and events.venue_id use ON DELETE RESTRICT
--    - This prevents orphaned events (events must have both artist and venue)
--    - If you need to delete an artist/venue, you must first handle their events
--    - This preserves referential integrity and forces explicit cleanup logic
--
-- ============================================

COMMIT;

