-- Create event_media table to track photos and videos uploaded via reviews
CREATE TABLE IF NOT EXISTS public.event_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Prevent duplicate entries for same review + url
  UNIQUE(review_id, url)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_event_media_review_id ON public.event_media(review_id);
CREATE INDEX IF NOT EXISTS idx_event_media_event_id ON public.event_media(event_id);
CREATE INDEX IF NOT EXISTS idx_event_media_artist_id ON public.event_media(artist_id);
CREATE INDEX IF NOT EXISTS idx_event_media_venue_id ON public.event_media(venue_id);
CREATE INDEX IF NOT EXISTS idx_event_media_media_type ON public.event_media(media_type);
CREATE INDEX IF NOT EXISTS idx_event_media_created_at ON public.event_media(created_at DESC);

-- Function to sync photos/videos from reviews to event_media table
CREATE OR REPLACE FUNCTION public.sync_review_media_to_event_media()
RETURNS TRIGGER AS $$
DECLARE
  photo_url TEXT;
  video_url TEXT;
  review_event_id UUID;
  review_artist_id UUID;
  review_venue_id UUID;
BEGIN
  -- Get event_id, artist_id, venue_id from the review (use NEW if available, otherwise OLD)
  review_event_id := COALESCE(NEW.event_id, OLD.event_id);
  review_artist_id := COALESCE(NEW.artist_id, OLD.artist_id);
  review_venue_id := COALESCE(NEW.venue_id, OLD.venue_id);

  -- Handle photos
  IF TG_OP = 'INSERT' THEN
    -- For inserts, add all photos
    IF NEW.photos IS NOT NULL AND array_length(NEW.photos, 1) > 0 THEN
      FOREACH photo_url IN ARRAY NEW.photos
      LOOP
        INSERT INTO public.event_media (review_id, event_id, artist_id, venue_id, url, media_type)
        VALUES (NEW.id, review_event_id, review_artist_id, review_venue_id, photo_url, 'photo')
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- For updates, check if photos changed
    IF OLD.photos IS DISTINCT FROM NEW.photos THEN
      -- Delete existing photos for this review
      DELETE FROM public.event_media 
      WHERE review_id = NEW.id AND media_type = 'photo';
      
      -- Insert new photos if any
      IF NEW.photos IS NOT NULL AND array_length(NEW.photos, 1) > 0 THEN
        FOREACH photo_url IN ARRAY NEW.photos
        LOOP
          INSERT INTO public.event_media (review_id, event_id, artist_id, venue_id, url, media_type)
          VALUES (NEW.id, review_event_id, review_artist_id, review_venue_id, photo_url, 'photo')
          ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;
    ELSIF NEW.event_id IS DISTINCT FROM OLD.event_id OR 
          NEW.artist_id IS DISTINCT FROM OLD.artist_id OR 
          NEW.venue_id IS DISTINCT FROM OLD.venue_id THEN
      -- If event_id, artist_id, or venue_id changed, update those fields in event_media
      UPDATE public.event_media
      SET event_id = review_event_id,
          artist_id = review_artist_id,
          venue_id = review_venue_id
      WHERE review_id = NEW.id;
    END IF;
  END IF;

  -- Handle videos
  IF TG_OP = 'INSERT' THEN
    -- For inserts, add all videos
    IF NEW.videos IS NOT NULL AND array_length(NEW.videos, 1) > 0 THEN
      FOREACH video_url IN ARRAY NEW.videos
      LOOP
        INSERT INTO public.event_media (review_id, event_id, artist_id, venue_id, url, media_type)
        VALUES (NEW.id, review_event_id, review_artist_id, review_venue_id, video_url, 'video')
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- For updates, check if videos changed
    IF OLD.videos IS DISTINCT FROM NEW.videos THEN
      -- Delete existing videos for this review
      DELETE FROM public.event_media 
      WHERE review_id = NEW.id AND media_type = 'video';
      
      -- Insert new videos if any
      IF NEW.videos IS NOT NULL AND array_length(NEW.videos, 1) > 0 THEN
        FOREACH video_url IN ARRAY NEW.videos
        LOOP
          INSERT INTO public.event_media (review_id, event_id, artist_id, venue_id, url, media_type)
          VALUES (NEW.id, review_event_id, review_artist_id, review_venue_id, video_url, 'video')
          ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically sync media when reviews are inserted or updated
DROP TRIGGER IF EXISTS trigger_sync_review_media_to_event_media ON public.reviews;
CREATE TRIGGER trigger_sync_review_media_to_event_media
  AFTER INSERT OR UPDATE OF photos, videos, event_id, artist_id, venue_id
  ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_review_media_to_event_media();

-- Function to backfill existing review media into event_media table
CREATE OR REPLACE FUNCTION public.backfill_event_media_from_reviews()
RETURNS TABLE(media_count INTEGER) AS $$
DECLARE
  photo_count INTEGER := 0;
  video_count INTEGER := 0;
  review_rec RECORD;
  photo_url TEXT;
  video_url TEXT;
BEGIN
  -- Loop through all reviews with photos or videos
  FOR review_rec IN 
    SELECT id, event_id, artist_id, venue_id, photos, videos
    FROM public.reviews
    WHERE (photos IS NOT NULL AND array_length(photos, 1) > 0) OR
          (videos IS NOT NULL AND array_length(videos, 1) > 0)
  LOOP
    -- Insert photos
    IF review_rec.photos IS NOT NULL AND array_length(review_rec.photos, 1) > 0 THEN
      FOREACH photo_url IN ARRAY review_rec.photos
      LOOP
        INSERT INTO public.event_media (review_id, event_id, artist_id, venue_id, url, media_type)
        VALUES (review_rec.id, review_rec.event_id, review_rec.artist_id, review_rec.venue_id, photo_url, 'photo')
        ON CONFLICT DO NOTHING;
        photo_count := photo_count + 1;
      END LOOP;
    END IF;

    -- Insert videos
    IF review_rec.videos IS NOT NULL AND array_length(review_rec.videos, 1) > 0 THEN
      FOREACH video_url IN ARRAY review_rec.videos
      LOOP
        INSERT INTO public.event_media (review_id, event_id, artist_id, venue_id, url, media_type)
        VALUES (review_rec.id, review_rec.event_id, review_rec.artist_id, review_rec.venue_id, video_url, 'video')
        ON CONFLICT DO NOTHING;
        video_count := video_count + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN QUERY SELECT (photo_count + video_count)::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Run backfill to populate event_media with existing review media
-- This is optional and can be run manually if needed:
-- SELECT * FROM public.backfill_event_media_from_reviews();

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_event_media_updated_at ON public.event_media;
CREATE TRIGGER update_event_media_updated_at
  BEFORE UPDATE ON public.event_media
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

