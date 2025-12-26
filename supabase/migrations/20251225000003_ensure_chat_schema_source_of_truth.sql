-- ============================================================
-- Ensure Chat Schema Matches Source of Truth
-- ============================================================
-- This migration ensures that:
-- 1. chat_participants table exists with correct schema
-- 2. chat_members_view view exists
-- 3. chats table has all required columns and constraints
-- 4. update_chat_member_count trigger function exists

-- ============================================================
-- STEP 1: CREATE chat_participants TABLE
-- ============================================================

-- Drop table if it exists (to recreate with correct schema)
DROP TABLE IF EXISTS public.chat_participants CASCADE;

-- Create chat_participants table matching source of truth
CREATE TABLE public.chat_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL,
  user_id uuid NOT NULL,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  last_read_at timestamp with time zone NULL,
  is_admin boolean NULL DEFAULT false,
  notifications_enabled boolean NULL DEFAULT true,
  CONSTRAINT chat_participants_pkey PRIMARY KEY (id),
  CONSTRAINT chat_participants_chat_id_user_id_key UNIQUE (chat_id, user_id),
  CONSTRAINT chat_participants_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE,
  CONSTRAINT chat_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chat_participants_chat_id ON public.chat_participants USING btree (chat_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_chat_participants_user_id ON public.chat_participants USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_chat_participants_admin ON public.chat_participants USING btree (chat_id, is_admin) TABLESPACE pg_default
WHERE (is_admin = true);

-- Enable RLS
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 2: ENSURE chats TABLE HAS ALL REQUIRED COLUMNS
-- ============================================================

-- Add missing columns to chats table if they don't exist
ALTER TABLE public.chats
ADD COLUMN IF NOT EXISTS chat_name text NOT NULL DEFAULT 'Chat'::text,
ADD COLUMN IF NOT EXISTS is_group_chat boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS users uuid[] NOT NULL DEFAULT '{}'::uuid[],
ADD COLUMN IF NOT EXISTS latest_message_id uuid NULL,
ADD COLUMN IF NOT EXISTS group_admin_id uuid NULL,
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS entity_type text NULL,
ADD COLUMN IF NOT EXISTS entity_id text NULL,
ADD COLUMN IF NOT EXISTS entity_uuid uuid NULL,
ADD COLUMN IF NOT EXISTS is_verified boolean NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS member_count integer NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_activity_at timestamp with time zone NULL;

-- Update existing NULL values to defaults
UPDATE public.chats SET chat_name = COALESCE(chat_name, 'Chat') WHERE chat_name IS NULL;
UPDATE public.chats SET is_group_chat = COALESCE(is_group_chat, false) WHERE is_group_chat IS NULL;
UPDATE public.chats SET users = COALESCE(users, ARRAY[]::uuid[]) WHERE users IS NULL;
UPDATE public.chats SET is_verified = COALESCE(is_verified, false) WHERE is_verified IS NULL;
UPDATE public.chats SET member_count = COALESCE(member_count, 0) WHERE member_count IS NULL;

-- Set NOT NULL constraints (after ensuring no NULLs)
DO $$
BEGIN
  -- Only set NOT NULL if all rows have values
  IF NOT EXISTS (SELECT 1 FROM public.chats WHERE chat_name IS NULL OR is_group_chat IS NULL OR users IS NULL) THEN
    ALTER TABLE public.chats
    ALTER COLUMN chat_name SET NOT NULL,
    ALTER COLUMN is_group_chat SET NOT NULL,
    ALTER COLUMN users SET NOT NULL;
  END IF;
END $$;

-- ============================================================
-- STEP 3: ADD FOREIGN KEY CONSTRAINTS TO chats TABLE
-- ============================================================

-- Add foreign key for latest_message_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'chats'
      AND tc.constraint_name = 'fk_chats_latest_message_id'
  ) THEN
    ALTER TABLE public.chats
    ADD CONSTRAINT fk_chats_latest_message_id 
    FOREIGN KEY (latest_message_id) REFERENCES messages (id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key for group_admin_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'chats'
      AND tc.constraint_name = 'fk_chats_group_admin_id'
  ) THEN
    -- Clean up orphaned references first
    UPDATE public.chats
    SET group_admin_id = NULL
    WHERE group_admin_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.users WHERE users.user_id = chats.group_admin_id
    );
    
    ALTER TABLE public.chats
    ADD CONSTRAINT fk_chats_group_admin_id 
    FOREIGN KEY (group_admin_id) REFERENCES users (user_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- STEP 4: ADD CHECK CONSTRAINTS TO chats TABLE
-- ============================================================

-- Add entity_type check constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'chats'
      AND tc.constraint_name = 'chats_entity_type_check'
  ) THEN
    ALTER TABLE public.chats
    ADD CONSTRAINT chats_entity_type_check CHECK (
      entity_type = ANY (ARRAY['event'::text, 'artist'::text, 'venue'::text])
    );
  END IF;
END $$;

-- Add entity_uuid consistency check constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'chats'
      AND tc.constraint_name = 'chk_entity_uuid_consistency'
  ) THEN
    ALTER TABLE public.chats
    ADD CONSTRAINT chk_entity_uuid_consistency CHECK (
      (
        (entity_type IS NULL) AND (entity_uuid IS NULL)
      )
      OR (
        (entity_type IS NOT NULL) AND (
          (entity_uuid IS NULL) OR (entity_uuid IS NOT NULL)
        )
      )
    );
  END IF;
END $$;

-- ============================================================
-- STEP 5: CREATE INDEXES ON chats TABLE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_chats_users ON public.chats USING gin (users) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON public.chats USING btree (updated_at DESC) TABLESPACE pg_default;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_verified_entity ON public.chats USING btree (entity_type, entity_id) TABLESPACE pg_default
WHERE (is_verified = true) AND (entity_type IS NOT NULL) AND (entity_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_verified_entity_uuid ON public.chats USING btree (entity_uuid) TABLESPACE pg_default
WHERE (is_verified = true) AND (entity_uuid IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_chats_entity_lookup ON public.chats USING btree (entity_type, entity_id) TABLESPACE pg_default
WHERE (entity_type IS NOT NULL) AND (entity_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_chats_entity_uuid_lookup ON public.chats USING btree (entity_uuid) TABLESPACE pg_default
WHERE (entity_uuid IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_chats_verified_activity ON public.chats USING btree (is_verified, last_activity_at DESC) TABLESPACE pg_default
WHERE (is_verified = true);

CREATE INDEX IF NOT EXISTS idx_chats_is_verified ON public.chats USING btree (is_verified) TABLESPACE pg_default
WHERE (is_verified = true);

-- ============================================================
-- STEP 6: CREATE update_chat_member_count FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_chat_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.chats
    SET member_count = (
      SELECT COUNT(*)::integer
      FROM public.chat_participants
      WHERE chat_id = NEW.chat_id
    )
    WHERE id = NEW.chat_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.chats
    SET member_count = (
      SELECT COUNT(*)::integer
      FROM public.chat_participants
      WHERE chat_id = OLD.chat_id
    )
    WHERE id = OLD.chat_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- ============================================================
-- STEP 7: CREATE TRIGGER FOR update_chat_member_count
-- ============================================================

DROP TRIGGER IF EXISTS trg_update_chat_member_count ON public.chat_participants;
CREATE TRIGGER trg_update_chat_member_count
AFTER INSERT OR DELETE ON public.chat_participants
FOR EACH ROW
EXECUTE FUNCTION update_chat_member_count();

-- ============================================================
-- STEP 8: CREATE chat_members_view
-- ============================================================

CREATE OR REPLACE VIEW public.chat_members_view AS
SELECT 
  cp.chat_id,
  cp.user_id,
  cp.joined_at,
  cp.is_admin,
  cp.last_read_at,
  cp.notifications_enabled,
  u.name,
  u.avatar_url,
  u.username
FROM public.chat_participants cp
JOIN public.users u ON u.user_id = cp.user_id;

-- Grant access to the view
GRANT SELECT ON public.chat_members_view TO authenticated;
GRANT SELECT ON public.chat_members_view TO anon;

-- ============================================================
-- STEP 9: CREATE updated_at TRIGGER FOR chats
-- ============================================================

-- Ensure update_updated_at_column function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_chats_updated_at ON public.chats;
CREATE TRIGGER update_chats_updated_at
BEFORE UPDATE ON public.chats
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STEP 10: CREATE RLS POLICIES FOR chat_participants
-- ============================================================
-- IMPORTANT: These policies avoid infinite recursion by:
-- 1. For SELECT: Allow if user_id matches OR if user is in chat's users array (direct check, no recursion)
-- 2. For INSERT/UPDATE/DELETE: Check chats.users array directly (no chat_participants query)

-- Drop existing policies
DROP POLICY IF EXISTS "chat_participants_select" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_update" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_delete" ON public.chat_participants;

-- Create RLS policies that avoid recursion
-- SELECT: Users can see participants if they are the participant OR if they are in the chat's users array
CREATE POLICY "chat_participants_select" ON public.chat_participants
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id
      AND auth.uid() = ANY(c.users)
    )
  );

-- INSERT: Users can add participants if they are in the chat's users array
-- Also allow if they are adding themselves (for joining chats)
CREATE POLICY "chat_participants_insert" ON public.chat_participants
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id
      AND auth.uid() = ANY(c.users)
    )
  );

-- UPDATE: Users can update their own participation OR if they are in the chat's users array
CREATE POLICY "chat_participants_update" ON public.chat_participants
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id
      AND auth.uid() = ANY(c.users)
    )
  );

-- DELETE: Users can remove their own participation OR if they are in the chat's users array (for admins)
CREATE POLICY "chat_participants_delete" ON public.chat_participants
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id
      AND auth.uid() = ANY(c.users)
    )
  );

-- ============================================================
-- STEP 11: SYNC EXISTING DATA
-- ============================================================

-- Sync member_count from chat_participants to chats.member_count
UPDATE public.chats c
SET member_count = (
  SELECT COUNT(*)::integer
  FROM public.chat_participants cp
  WHERE cp.chat_id = c.id
)
WHERE EXISTS (
  SELECT 1 FROM public.chat_participants cp WHERE cp.chat_id = c.id
);

-- Sync users array from chat_participants (if users array is empty but participants exist)
UPDATE public.chats c
SET users = (
  SELECT ARRAY_AGG(cp.user_id ORDER BY cp.joined_at)
  FROM public.chat_participants cp
  WHERE cp.chat_id = c.id
)
WHERE (c.users IS NULL OR array_length(c.users, 1) IS NULL OR array_length(c.users, 1) = 0)
AND EXISTS (
  SELECT 1 FROM public.chat_participants cp WHERE cp.chat_id = c.id
);

