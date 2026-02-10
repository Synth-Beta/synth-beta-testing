-- Feed V5 performance indexes
-- These indexes support date, location and relationship filters used by get_personalized_feed_v5

BEGIN;

-- Core events filtering: date + basic id, plus simple lat/lng bounding box
CREATE INDEX IF NOT EXISTS idx_events_event_date_id
  ON public.events (event_date, id);

CREATE INDEX IF NOT EXISTS idx_events_lat_lng
  ON public.events (latitude, longitude);

-- Artist follows lookup
CREATE INDEX IF NOT EXISTS idx_artist_follows_user_artist
  ON public.artist_follows (user_id, artist_id);

-- User-venue relationships lookup
CREATE INDEX IF NOT EXISTS idx_user_venue_relationships_user_venue
  ON public.user_venue_relationships (user_id, venue_id);

-- User-event relationships lookup (by user, event, relationship_type)
CREATE INDEX IF NOT EXISTS idx_user_event_relationships_user_event_type
  ON public.user_event_relationships (user_id, event_id, relationship_type);

-- User preferences lookup
CREATE INDEX IF NOT EXISTS idx_user_preferences_user
  ON public.user_preferences (user_id);

COMMIT;

