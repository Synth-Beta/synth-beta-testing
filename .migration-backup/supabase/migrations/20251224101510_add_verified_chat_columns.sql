-- Add verified chat columns to chats table
-- This enables linking chats to entities (events, artists, venues) and marking them as verified

-- Step 1: Add columns to chats table
ALTER TABLE public.chats
ADD COLUMN IF NOT EXISTS entity_type TEXT CHECK (entity_type IN ('event', 'artist', 'venue')),
ADD COLUMN IF NOT EXISTS entity_id TEXT, -- Using TEXT to handle both UUID and text IDs (jambase_artist_id, venue_name)
ADD COLUMN IF NOT EXISTS entity_uuid UUID, -- UUID reference to the actual entity (for FK relationships)
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Step 2: Add simple CHECK constraint (PostgreSQL doesn't allow subqueries in CHECK constraints)
-- Data integrity will be enforced by application logic and the functions that create verified chats
ALTER TABLE public.chats
ADD CONSTRAINT chk_entity_uuid_consistency 
CHECK (
  (entity_type IS NULL AND entity_uuid IS NULL)
  OR (entity_type IS NOT NULL AND (entity_uuid IS NULL OR entity_uuid IS NOT NULL))
);

-- Step 3: Create unique constraint - only one verified chat per entity
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_verified_entity 
ON public.chats(entity_type, entity_id) 
WHERE is_verified = true AND entity_type IS NOT NULL AND entity_id IS NOT NULL;

-- Also create unique index on entity_uuid for verified chats
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_verified_entity_uuid 
ON public.chats(entity_uuid) 
WHERE is_verified = true AND entity_uuid IS NOT NULL;

-- Step 4: Create indexes for lookups
CREATE INDEX IF NOT EXISTS idx_chats_entity_lookup 
ON public.chats(entity_type, entity_id) 
WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chats_entity_uuid_lookup 
ON public.chats(entity_uuid) 
WHERE entity_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chats_verified_activity 
ON public.chats(is_verified, last_activity_at DESC) 
WHERE is_verified = true;

CREATE INDEX IF NOT EXISTS idx_chats_is_verified 
ON public.chats(is_verified) 
WHERE is_verified = true;

-- Step 5: Add comments for documentation
COMMENT ON COLUMN public.chats.entity_type IS 'Type of entity this chat is associated with: event, artist, or venue';
COMMENT ON COLUMN public.chats.entity_id IS 'ID of the entity (UUID for events/artists, TEXT for venues or jambase_artist_id)';
COMMENT ON COLUMN public.chats.entity_uuid IS 'UUID reference to the actual entity table (events.id, artists.id, or venues.id) for FK relationships';
COMMENT ON COLUMN public.chats.is_verified IS 'Marks official entity chats that are automatically created and managed';
COMMENT ON COLUMN public.chats.member_count IS 'Cached count of members for performance (should match array_length(users, 1))';
COMMENT ON COLUMN public.chats.last_activity_at IS 'Timestamp of last message activity for sorting by recency';
