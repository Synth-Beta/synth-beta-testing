-- Ensure chat schema is complete for all features
-- This migration ensures message_type includes 'review_share' and all FKs are correct
--
-- 3NF COMPLIANCE:
-- - Uses foreign keys (shared_event_id, shared_review_id) to reference source tables
-- - Does NOT duplicate data from events/reviews tables in metadata column
-- - Metadata column should only contain message-specific data (custom_message, share_context)
-- - Event/review data must be retrieved via FK joins, not from metadata
-- - All foreign key constraints properly reference normalized tables (events, reviews)

-- Step 1: Update message_type constraint to include 'review_share' if not already present
DO $$
BEGIN
  -- Check if constraint exists and includes 'review_share'
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'messages'
      AND tc.constraint_type = 'CHECK'
      AND tc.constraint_name = 'messages_message_type_check'
      AND cc.check_clause NOT LIKE '%review_share%'
  ) THEN
    -- Drop old constraint
    ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
    
    -- Add new constraint with review_share
    ALTER TABLE public.messages 
    ADD CONSTRAINT messages_message_type_check 
    CHECK (message_type IN ('text', 'event_share', 'review_share', 'system'));
    
    RAISE NOTICE '✅ Updated message_type constraint to include review_share';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND constraint_name = 'messages_message_type_check'
  ) THEN
    -- Constraint doesn't exist, create it
    ALTER TABLE public.messages 
    ADD CONSTRAINT messages_message_type_check 
    CHECK (message_type IN ('text', 'event_share', 'review_share', 'system'));
    
    RAISE NOTICE '✅ Created message_type constraint with review_share';
  ELSE
    RAISE NOTICE '✅ message_type constraint already includes review_share';
  END IF;
END $$;

-- Step 2: Ensure shared_review_id column exists with proper FK
DO $$
BEGIN
  -- Check if column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'shared_review_id'
  ) THEN
    ALTER TABLE public.messages 
    ADD COLUMN shared_review_id UUID REFERENCES public.reviews(id) ON DELETE SET NULL;
    
    RAISE NOTICE '✅ Added shared_review_id column';
  END IF;
  
  -- Verify FK constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'messages'
      AND kcu.column_name = 'shared_review_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'reviews'
      AND ccu.column_name = 'id'
  ) THEN
    -- Clean up orphaned references first
    UPDATE public.messages
    SET shared_review_id = NULL
    WHERE shared_review_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.reviews WHERE reviews.id = messages.shared_review_id
    );
    
    -- Add FK constraint (if column exists but constraint doesn't)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'messages'
        AND column_name = 'shared_review_id'
    ) THEN
      ALTER TABLE public.messages
      ADD CONSTRAINT fk_messages_shared_review_id 
        FOREIGN KEY (shared_review_id) 
        REFERENCES public.reviews(id) 
        ON DELETE SET NULL;
      
      RAISE NOTICE '✅ Created shared_review_id FK constraint';
    END IF;
  ELSE
    RAISE NOTICE '✅ shared_review_id FK constraint already exists';
  END IF;
END $$;

-- Step 3: Ensure shared_event_id FK is correct (references events.id, not jambase_events)
DO $$
BEGIN
  -- Check if FK exists and points to correct table
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'messages'
      AND kcu.column_name = 'shared_event_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'events'
      AND ccu.column_name = 'id'
  ) THEN
    RAISE NOTICE '✅ shared_event_id FK correctly points to events.id';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'messages'
      AND kcu.column_name = 'shared_event_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name != 'events'
  ) THEN
    -- FK points to wrong table, need to fix
    RAISE NOTICE '⚠️ shared_event_id FK points to wrong table, manual fix may be needed';
  ELSE
    -- No FK exists, create it
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'messages'
        AND column_name = 'shared_event_id'
    ) THEN
      -- Clean up orphaned references first
      UPDATE public.messages
      SET shared_event_id = NULL
      WHERE shared_event_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.events WHERE events.id = messages.shared_event_id
      );
      
      ALTER TABLE public.messages
      ADD CONSTRAINT fk_messages_shared_event_id 
        FOREIGN KEY (shared_event_id) 
        REFERENCES public.events(id) 
        ON DELETE SET NULL;
      
      RAISE NOTICE '✅ Created shared_event_id FK constraint to events.id';
    END IF;
  END IF;
END $$;

-- Step 4: Ensure indexes exist for performance
CREATE INDEX IF NOT EXISTS idx_messages_shared_review_id ON public.messages(shared_review_id) WHERE shared_review_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_shared_event_id ON public.messages(shared_event_id) WHERE shared_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_message_type ON public.messages(message_type);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id_created_at ON public.messages(chat_id, created_at DESC);

-- Step 5: Ensure metadata column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.messages 
    ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    
    RAISE NOTICE '✅ Added metadata column';
  ELSE
    RAISE NOTICE '✅ metadata column already exists';
  END IF;
END $$;

-- Add comments for documentation (3NF compliant design)
COMMENT ON COLUMN public.messages.message_type IS 'Type of message: text (normal message), event_share (shared event), review_share (shared review), system (system notification)';
COMMENT ON COLUMN public.messages.shared_event_id IS 'Reference to events table if this message is an event share. Use this FK to join with events table - DO NOT duplicate event data in metadata.';
COMMENT ON COLUMN public.messages.shared_review_id IS 'Reference to reviews table if this message is a review share. Use this FK to join with reviews table - DO NOT duplicate review data in metadata.';
COMMENT ON COLUMN public.messages.metadata IS '3NF COMPLIANT: Store only message-specific metadata (e.g., custom_message, share_context). DO NOT store duplicated data from events/reviews tables (event_title, artist_name, venue_name, review_text, rating, etc.) - use foreign keys (shared_event_id, shared_review_id) to join with source tables instead.';

