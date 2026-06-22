-- Fix 400: "invalid input value for enum preference_signal_type"
-- The enum was created by an older migration without these values; add all
-- that the app sends: interest, follow, view (and others for triggers/RPCs).

ALTER TYPE public.preference_signal_type ADD VALUE IF NOT EXISTS 'interest';
ALTER TYPE public.preference_signal_type ADD VALUE IF NOT EXISTS 'follow';
ALTER TYPE public.preference_signal_type ADD VALUE IF NOT EXISTS 'view';
ALTER TYPE public.preference_signal_type ADD VALUE IF NOT EXISTS 'save';
ALTER TYPE public.preference_signal_type ADD VALUE IF NOT EXISTS 'genre_manual_preference';
ALTER TYPE public.preference_signal_type ADD VALUE IF NOT EXISTS 'artist_manual_preference';
ALTER TYPE public.preference_signal_type ADD VALUE IF NOT EXISTS 'streaming_profile_synced';
ALTER TYPE public.preference_signal_type ADD VALUE IF NOT EXISTS 'bucket_list';
ALTER TYPE public.preference_signal_type ADD VALUE IF NOT EXISTS 'review';
ALTER TYPE public.preference_signal_type ADD VALUE IF NOT EXISTS 'attendance';

ALTER TYPE public.preference_entity_type ADD VALUE IF NOT EXISTS 'event';
ALTER TYPE public.preference_entity_type ADD VALUE IF NOT EXISTS 'artist';
ALTER TYPE public.preference_entity_type ADD VALUE IF NOT EXISTS 'venue';
ALTER TYPE public.preference_entity_type ADD VALUE IF NOT EXISTS 'genre';
