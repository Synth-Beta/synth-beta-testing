-- Add review sharing support to messages table
-- This allows messages to contain shared review references
-- Used for sharing friend reviews in the Connect page
-- All data is stored in messages table (3NF compliant - no redundant tables)

-- Update message_type check constraint to include 'review_share'
ALTER TABLE public.messages 
DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE public.messages 
ADD CONSTRAINT messages_message_type_check 
CHECK (message_type IN ('text', 'event_share', 'review_share', 'system'));

-- Add shared_review_id column for review sharing
-- This is a foreign key reference (3NF compliant - no data duplication)
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS shared_review_id UUID REFERENCES public.reviews(id) ON DELETE SET NULL;

-- Create index for faster review share queries
CREATE INDEX IF NOT EXISTS idx_messages_shared_review_id ON public.messages(shared_review_id) WHERE shared_review_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.messages.message_type IS 'Type of message: text (normal message), event_share (shared event), review_share (shared review), system (system notification)';
COMMENT ON COLUMN public.messages.shared_review_id IS 'Reference to reviews table if this message is a review share. Used for sharing friend reviews in Connect page.';

