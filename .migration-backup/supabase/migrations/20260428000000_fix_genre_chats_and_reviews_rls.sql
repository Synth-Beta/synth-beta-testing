-- ============================================================
-- CRITICAL FIX 1: Allow 'genre' as entity_type on chats table
-- Without this, genre chat creation fails with a CHECK constraint
-- violation and Join button does nothing silently.
-- ============================================================

ALTER TABLE public.chats
    DROP CONSTRAINT IF EXISTS chats_entity_type_check;

ALTER TABLE public.chats
    ADD CONSTRAINT chats_entity_type_check
    CHECK (entity_type IN ('event', 'artist', 'venue', 'genre'));

-- Unique index so only one group chat exists per genre slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_genre_entity
    ON public.chats (entity_id)
    WHERE entity_type = 'genre' AND is_group_chat = true;

-- ============================================================
-- CRITICAL FIX 2: Add SELECT policies to reviews table
-- Without this, RLS blocks ALL reads on reviews (no policies =
-- deny by default). Reviews never load anywhere in the app.
-- ============================================================

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Drop any stale policies first
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;
DROP POLICY IF EXISTS "Published reviews are viewable by everyone" ON public.reviews;
DROP POLICY IF EXISTS "Users can view own draft reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can insert their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can delete their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Authenticated users can read reviews" ON public.reviews;

-- Published reviews are readable by everyone (authenticated + anon)
CREATE POLICY "Published reviews are viewable by everyone"
ON public.reviews
FOR SELECT
USING (is_draft = false OR is_draft IS NULL);

-- Users can also see their own draft reviews
CREATE POLICY "Users can view own draft reviews"
ON public.reviews
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can create their own reviews
CREATE POLICY "Users can insert their own reviews"
ON public.reviews
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own reviews
CREATE POLICY "Users can update their own reviews"
ON public.reviews
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can delete their own reviews
CREATE POLICY "Users can delete their own reviews"
ON public.reviews
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Ensure grants
GRANT SELECT ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
