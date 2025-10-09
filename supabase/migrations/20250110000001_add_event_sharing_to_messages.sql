-- Add event sharing support to messages table
-- This allows messages to contain shared event references

-- Add columns to messages table for event sharing
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'event_share', 'system')),
ADD COLUMN IF NOT EXISTS shared_event_id UUID REFERENCES public.jambase_events(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create index for faster event share queries
CREATE INDEX IF NOT EXISTS idx_messages_shared_event_id ON public.messages(shared_event_id) WHERE shared_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_message_type ON public.messages(message_type);

-- Create event_shares tracking table (optional - for analytics)
CREATE TABLE IF NOT EXISTS public.event_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.jambase_events(id) ON DELETE CASCADE,
  sharer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  share_type TEXT NOT NULL CHECK (share_type IN ('direct_chat', 'group_chat', 'external')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on event_shares
ALTER TABLE public.event_shares ENABLE ROW LEVEL SECURITY;

-- Create policies for event_shares
CREATE POLICY "Users can view event shares in their chats" ON public.event_shares
  FOR SELECT USING (
    chat_id IN (
      SELECT id FROM public.chats WHERE auth.uid() = ANY(users)
    ) OR sharer_user_id = auth.uid()
  );

CREATE POLICY "Users can create event shares" ON public.event_shares
  FOR INSERT WITH CHECK (sharer_user_id = auth.uid());

-- Create indexes for event_shares
CREATE INDEX IF NOT EXISTS idx_event_shares_event_id ON public.event_shares(event_id);
CREATE INDEX IF NOT EXISTS idx_event_shares_sharer_user_id ON public.event_shares(sharer_user_id);
CREATE INDEX IF NOT EXISTS idx_event_shares_chat_id ON public.event_shares(chat_id);

-- Add comment for documentation
COMMENT ON COLUMN public.messages.message_type IS 'Type of message: text (normal message), event_share (shared event), system (system notification)';
COMMENT ON COLUMN public.messages.shared_event_id IS 'Reference to jambase_events table if this message is an event share';
COMMENT ON COLUMN public.messages.metadata IS 'Additional metadata for the message (e.g., share context, custom message)';
COMMENT ON TABLE public.event_shares IS 'Tracks event sharing activity for analytics and notifications';

