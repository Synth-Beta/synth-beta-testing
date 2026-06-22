-- Allow 'genre' as a valid entity_type for genre community group chats.
-- The original constraint only permitted 'event', 'artist', 'venue', which caused
-- genre chat inserts to fail with a constraint violation.

-- Drop the old inline CHECK constraint (auto-named by Postgres)
ALTER TABLE public.chats
    DROP CONSTRAINT IF EXISTS chats_entity_type_check;

-- Re-add with 'genre' included
ALTER TABLE public.chats
    ADD CONSTRAINT chats_entity_type_check
    CHECK (entity_type IN ('event', 'artist', 'venue', 'genre'));

-- Unique index so only one group chat exists per genre slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_genre_entity
    ON public.chats (entity_id)
    WHERE entity_type = 'genre' AND is_group_chat = true;
