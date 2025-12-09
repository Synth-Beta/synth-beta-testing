-- Add performance indexes for connection degree queries and chat unread counts
-- These indexes optimize the queries used in Discover and Connect pages

BEGIN;

-- Note: friends table may be a view pointing to relationships table
-- Indexes on views are not supported, so we create indexes on the underlying relationships table instead

-- Indexes for relationships table (used in connection interests and connection degree functions)
-- Note: If friends is a view, it queries relationships with: related_entity_type='user', relationship_type='friend', status='accepted'
CREATE INDEX IF NOT EXISTS idx_relationships_user_id ON public.relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_relationships_entity_id ON public.relationships(related_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON public.relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_entity_type ON public.relationships(related_entity_type);
CREATE INDEX IF NOT EXISTS idx_relationships_user_type_entity ON public.relationships(user_id, relationship_type, related_entity_type);
CREATE INDEX IF NOT EXISTS idx_relationships_created_at ON public.relationships(created_at DESC);
-- Composite index optimized for friend queries (if friends view queries relationships)
CREATE INDEX IF NOT EXISTS idx_relationships_friends ON public.relationships(user_id, related_entity_id, relationship_type, related_entity_type, status) 
  WHERE related_entity_type = 'user' AND relationship_type = 'friend' AND status = 'accepted';

-- Indexes for reviews table (used in connection degree reviews)
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_public_draft ON public.reviews(is_public, is_draft) WHERE is_public = true AND is_draft = false;
CREATE INDEX IF NOT EXISTS idx_reviews_user_public_created ON public.reviews(user_id, is_public, created_at DESC) WHERE is_public = true;

-- Indexes for messages table (used in chat unread counts)
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON public.messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_sender ON public.messages(chat_id, sender_id);

-- Indexes for chats table (used in chat previews)
CREATE INDEX IF NOT EXISTS idx_chats_users ON public.chats USING GIN(users);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON public.chats(updated_at DESC);

-- Indexes for events table (used in connection interests)
CREATE INDEX IF NOT EXISTS idx_events_id ON public.events(id);
CREATE INDEX IF NOT EXISTS idx_events_artist_name ON public.events(artist_name);
CREATE INDEX IF NOT EXISTS idx_events_venue_name ON public.events(venue_name);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON public.events(event_date);

-- Indexes for notifications table (used in notifications page)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- Indexes for users table (used in chat and profile pages)
CREATE INDEX IF NOT EXISTS idx_users_user_id ON public.users(user_id);
CREATE INDEX IF NOT EXISTS idx_users_name ON public.users(name);

COMMENT ON INDEX idx_relationships_user_id IS 'Optimizes get_first_degree_connections queries (friends view uses relationships)';
COMMENT ON INDEX idx_relationships_friends IS 'Optimizes friend queries when friends is a view pointing to relationships';
COMMENT ON INDEX idx_relationships_user_type_entity IS 'Optimizes connection interests queries and connection degree functions';
COMMENT ON INDEX idx_reviews_user_public_created IS 'Optimizes connection degree reviews queries';
COMMENT ON INDEX idx_messages_chat_created IS 'Optimizes chat unread count queries';
COMMENT ON INDEX idx_notifications_user_read_created IS 'Optimizes notifications page queries';
COMMENT ON INDEX idx_users_user_id IS 'Optimizes profile and chat queries';

COMMIT;

