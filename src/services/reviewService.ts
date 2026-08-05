import { supabase } from '@/integrations/supabase/client';
import { storageService } from '@/services/storageService';
// Note: Types will need to be regenerated after migration
// Using any for now until types.ts is regenerated from Supabase
type Tables<T extends string> = any;
type TablesInsert<T extends string> = any;
type TablesUpdate<T extends string> = any;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (value?: string | null): value is string =>
  typeof value === 'string' && UUID_REGEX.test(value);

// Custom setlist song structure
export interface CustomSetlistSong {
  song_name: string;
  cover_artist?: string;
  notes?: string;
  position: number;
}

export interface ReviewCustomSetlistPayload {
  id: string;
  title: string;
  isAutoTitle: boolean;
  songs: CustomSetlistSong[];
}

// Review system types with venue support
export interface ReviewData {
  rating?: number; // Overall rating (calculated automatically)
  artist_performance_rating?: number;
  production_rating?: number;
  venue_rating?: number;
  location_rating?: number;
  value_rating?: number;
  artist_performance_feedback?: string;
  production_feedback?: string;
  venue_feedback?: string;
  location_feedback?: string;
  value_feedback?: string;
  ticket_price_paid?: number;
  artist_rating?: number; // Legacy field for backward compatibility
  review_type: 'event' | 'venue' | 'artist'; // Type of review
  review_text?: string;
  photos?: string[]; // Array of photo URLs from storage
  videos?: string[]; // Array of video URLs from storage
  attendees?: Array<{ type: 'user'; user_id: string; name: string; avatar_url?: string } | { type: 'phone'; phone: string; name?: string }>; // People who attended
  met_on_synth?: boolean; // Track if users met/planned on Synth
  is_public?: boolean;
  venue_tags?: string[]; // Venue-specific tags
  artist_tags?: string[]; // Artist-specific tags
  setlist?: any; // Selected setlist data from Setlist.fm (API verified)
  // User-created custom setlists (review-only). Stored as JSONB.
  custom_setlist?: ReviewCustomSetlistPayload[];
  reaction_emoji?: string; // Emoji reaction to the review
  Event_date?: Date; // Event date - stored in reviews table as DATE type
}

export interface UserReview {
  id: string;
  user_id: string;
  event_id?: string; // Optional - reviews are identified by artist_id + venue_id
  venue_id?: string;
  rating: number;
  artist_performance_rating?: number;
  production_rating?: number;
  venue_rating?: number;
  location_rating?: number;
  value_rating?: number;
  artist_performance_feedback?: string;
  production_feedback?: string;
  venue_feedback?: string;
  location_feedback?: string;
  value_feedback?: string;
  ticket_price_paid?: number;
  artist_rating?: number; // Legacy field
  review_type?: 'event' | 'venue' | 'artist';
  review_text?: string;
  photos?: string[];
  videos?: string[];
  attendees?: Array<{ type: 'user'; user_id: string; name: string; avatar_url?: string } | { type: 'phone'; phone: string; name?: string }>; // People who attended
  met_on_synth?: boolean; // Track if users met/planned on Synth
  mood_tags?: string[];
  genre_tags?: string[];
  context_tags?: string[];
  venue_tags?: string[];
  artist_tags?: string[];
  setlist?: any; // Selected setlist data from Setlist.fm (API verified)
  // User-created custom setlists (review-only). Stored as JSONB.
  custom_setlist?: ReviewCustomSetlistPayload[];
  reaction_emoji?: string; // Emoji reaction to the review
  likes_count: number;
  comments_count: number;
  shares_count: number;
  is_public?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicReviewWithProfile extends UserReview {
  reviewer_name: string;
  reviewer_avatar?: string;
  event_title?: string;
  artist_name?: string;
  venue_name?: string;
  event_date?: string;
  venue_profile_name?: string;
  venue_address?: any;
}

export interface VenueStats {
  total_reviews: number;
  average_venue_rating: number;
  average_artist_rating: number;
  average_overall_rating: number;
  rating_distribution: {
    '1_star': number;
    '2_star': number;
    '3_star': number;
    '4_star': number;
    '5_star': number;
  };
}

export interface TagCount {
  tag: string;
  count: number;
}

// Legacy type definitions for backwards compatibility
export type UserReviewInsert = TablesInsert<'reviews'>;
export type UserReviewUpdate = TablesUpdate<'reviews'>;

export type ReviewLike = Tables<'review_likes'>;
export type ReviewLikeInsert = TablesInsert<'review_likes'>;

export type ReviewComment = Tables<'review_comments'>;
export type ReviewCommentInsert = TablesInsert<'review_comments'>;
export type ReviewCommentUpdate = TablesUpdate<'review_comments'>;

export type ReviewShare = Tables<'review_shares'>;
export type ReviewShareInsert = TablesInsert<'review_shares'>;

// Review with engagement data
export interface ReviewWithEngagement extends UserReview {
  is_liked_by_user?: boolean;
  user_like_id?: string;
  recent_comments?: ReviewComment[];
  total_comments?: number;
  // projected event metadata for UI (optional)
  artist_name?: string;
  artist_id?: string;
  venue_name?: string;
}

// Comment with user data
export interface CommentWithUser extends ReviewComment {
  user: {
    id: string;
    name: string;
    avatar_url?: string;
  };
}

// Pre-defined tag options for consistent tagging
export const VENUE_TAGS = [
  'excellent-sound',
  'poor-sound',
  'great-staff',
  'rude-staff',
  'clean-facilities',
  'dirty-facilities',
  'easy-parking',
  'no-parking',
  'accessible',
  'not-accessible',
  'good-drinks',
  'expensive-drinks',
  'great-food',
  'no-food',
  'spacious',
  'cramped',
  'good-sightlines',
  'obstructed-view',
  'air-conditioned',
  'too-hot',
  'well-organized',
  'chaotic',
] as const;

export const ARTIST_TAGS = [
  'amazing-performance',
  'disappointing-performance',
  'high-energy',
  'low-energy',
  'great-setlist',
  'boring-setlist',
  'excellent-vocals',
  'poor-vocals',
  'great-stage-presence',
  'no-stage-presence',
  'interactive',
  'distant',
  'on-time',
  'very-late',
  'good-sound-mix',
  'bad-sound-mix',
  'played-hits',
  'no-hits',
  'long-set',
  'short-set',
] as const;

export type VenueTag = typeof VENUE_TAGS[number];
export type ArtistTag = typeof ARTIST_TAGS[number];

export class ReviewService {
  private static isPlaceholderEntityImage(imageUrl: string | null | undefined): boolean {
    if (!imageUrl) return true;
    const url = String(imageUrl);
    return (
      url.includes('jambase-default-band-image-bw-1480x832.png') ||
      url.includes('/Synth_Placeholder.png') ||
      url.includes('Synth_Placeholder.png') ||
      url.includes('/placeholder.svg')
    );
  }

  private static async promoteReviewPhotoToEntityImage(params: {
    artistId?: string;
    venueId?: string;
    photoUrl?: string;
    isPublic?: boolean | null;
  }): Promise<void> {
    const { artistId, venueId, photoUrl, isPublic } = params;
    if (!isPublic) return;
    if (!photoUrl) return;

    // Prefer artist first, then venue (both can be updated if present).
    const tryUpdateArtist = async () => {
      if (!artistId || !isValidUuid(artistId)) return;
      const { data } = await supabase
        .from('artists')
        .select('image_url')
        .eq('id', artistId)
        .maybeSingle();
      if (!this.isPlaceholderEntityImage((data as any)?.image_url)) return;
      await supabase
        .from('artists')
        .update({ image_url: photoUrl, updated_at: new Date().toISOString() })
        .eq('id', artistId);
    };

    const tryUpdateVenue = async () => {
      if (!venueId || !isValidUuid(venueId)) return;
      const { data } = await supabase
        .from('venues')
        .select('image_url')
        .eq('id', venueId)
        .maybeSingle();
      if (!this.isPlaceholderEntityImage((data as any)?.image_url)) return;
      await supabase
        .from('venues')
        .update({ image_url: photoUrl, updated_at: new Date().toISOString() })
        .eq('id', venueId);
    };

    try {
      await Promise.all([tryUpdateArtist(), tryUpdateVenue()]);
    } catch (error) {
      // Non-critical: image promotion shouldn't block review publishing.
      console.warn('⚠️ ReviewService: Failed to promote review photo to entity image:', error);
    }
  }

  /**
   * Notify friends tagged in a review so they receive a notification and can write their own
   * review with artist, venue, date, and friends pre-filled.
   */
  static async notifyTaggedFriendsInReview(params: {
    actorUserId: string;
    reviewData: ReviewData;
    savedReview: any;
    artistId?: string;
    venueId?: string;
    eventDate: string;
  }): Promise<void> {
    const { actorUserId, reviewData, savedReview, artistId, venueId, eventDate } = params;
    const attendees = reviewData.attendees ?? [];
    const userAttendees = attendees.filter(
      (a): a is { type: 'user'; user_id: string; name: string; avatar_url?: string } =>
        typeof a === 'object' && a !== null && (a as any).type === 'user' && typeof (a as any).user_id === 'string'
    );
    const taggedFriendIds = userAttendees
      .map((a) => a.user_id)
      .filter((id) => id && id !== actorUserId && isValidUuid(id));

    if (taggedFriendIds.length === 0) return;

    // Fetch actor (reviewer) name
    let actorName = 'Someone';
    try {
      const { data: actor } = await supabase
        .from('users')
        .select('name')
        .eq('user_id', actorUserId)
        .maybeSingle();
      if (actor?.name) actorName = actor.name;
    } catch {
      // Non-fatal
    }

    // Fetch artist and venue names for notification message
    let artistName = '';
    let venueName = '';
    try {
      if (artistId) {
        const { data: a } = await supabase.from('artists').select('name').eq('id', artistId).maybeSingle();
        artistName = (a as any)?.name ?? '';
      }
      if (venueId) {
        const { data: v } = await supabase.from('venues').select('name').eq('id', venueId).maybeSingle();
        venueName = (v as any)?.name ?? '';
      }
    } catch {
      // Non-fatal
    }

    const eventDesc = [artistName, venueName].filter(Boolean).join(' at ') || 'a show';
    const notifications = taggedFriendIds.map((friendUserId) => ({
      user_id: friendUserId,
      type: 'friend_tagged_in_review',
      title: 'You were tagged in a review',
      message: `${actorName} tagged you in their review of ${eventDesc}. Write your own review!`,
      data: {
        review_id: savedReview?.id,
        artist_id: artistId,
        artist_name: artistName,
        venue_id: venueId,
        venue_name: venueName,
        Event_date: eventDate,
        actor_user_id: actorUserId,
        actor_name: actorName,
        attendees: userAttendees,
      },
      review_id: savedReview?.id,
      actor_user_id: actorUserId,
    }));

    const { error } = await supabase.from('notifications').insert(notifications);
    if (error) {
      throw error;
    }
  }

  /**
   * Create a user-created artist when the artist is not in the catalog.
   * Call this when the user enters a custom artist name, then pass the returned id
   * to setEventReview as userCreatedArtistId.
   */
  static async createUserCreatedArtist(
    userId: string,
    name: string,
    imageUrl?: string | null
  ): Promise<string> {
    const { data, error } = await supabase
      .from('user_created_artists')
      .insert({ user_id: userId, name: name.trim(), image_url: imageUrl ?? null })
      .select('id')
      .single();
    if (error) throw error;
    if (!data?.id) throw new Error('Failed to create user-created artist');
    return data.id;
  }

  static async createUserCreatedVenue(
    userId: string,
    name: string,
    imageUrl?: string | null
  ): Promise<string> {
    const { data, error } = await supabase
      .from('user_created_venues')
      .insert({ user_id: userId, name: name.trim(), image_url: imageUrl ?? null })
      .select('id')
      .single();
    if (error) throw error;
    if (!data?.id) throw new Error('Failed to create user-created venue');
    return data.id;
  }

  /**
   * Create or update a review - identified by artist_id + venue_id only.
   * event_id is not used in the review submission flow.
   * Use artistId for catalog artists or userCreatedArtistId when the artist was created via createUserCreatedArtist.
   */
  static async setEventReview(
    userId: string,
    _eventId: string | undefined, // Deprecated - kept for API compatibility, never used
    reviewData: ReviewData,
    venueId?: string,
    artistId?: string,
    userCreatedArtistId?: string,
    userCreatedVenueId?: string
  ): Promise<UserReview> {
    try {
      // Event_date is required (NOT NULL) - from reviewData or fallback to today
      let eventDate: string;
      if (reviewData.Event_date) {
        if (reviewData.Event_date instanceof Date) {
          eventDate = reviewData.Event_date.toISOString().split('T')[0];
        } else if (typeof reviewData.Event_date === 'string') {
          eventDate = reviewData.Event_date;
        } else {
          eventDate = new Date().toISOString().split('T')[0];
        }
      } else {
        eventDate = new Date().toISOString().split('T')[0];
      }
      // Helper to ensure a valid INTEGER rating value (1..5) for inserts/updates
      const deriveRating = (data: ReviewData): number => {
        const clampToRange = (val: number) => Math.max(0.5, Math.min(5.0, val));
        if (typeof data.rating === 'number' && !Number.isNaN(data.rating)) {
          return Number(clampToRange(data.rating).toFixed(1));
        }

        // Use 5-category system (decimal halves permitted at column level)
        const newParts = [
          data.artist_performance_rating,
          data.production_rating,
          data.venue_rating,
          data.location_rating,
          data.value_rating,
        ].filter(
          (v): v is number => typeof v === 'number' && v > 0
        );
        if (newParts.length > 0) {
          const avg = newParts.reduce((a, b) => a + b, 0) / newParts.length;
          return Number(clampToRange(avg).toFixed(1));
        }

        // Fallback to legacy two-category system (only for reading old data)
        const legacyParts = [data.artist_rating].filter(
          (v): v is number => typeof v === 'number' && v > 0
        );
        if (legacyParts.length > 0) {
          return clampToRange(Math.round(legacyParts[0]));
        }

        // As a last resort, return mid rating to pass NOT NULL constraint while being neutral
        return 3;
      };

      const normalizedVenueId = isValidUuid(venueId) ? venueId : undefined;
      const normalizedArtistId = isValidUuid(artistId) ? artistId : undefined;
      const normalizedUserCreatedArtistId = isValidUuid(userCreatedArtistId) ? userCreatedArtistId : undefined;
      const normalizedUserCreatedVenueId = isValidUuid(userCreatedVenueId) ? userCreatedVenueId : undefined;

      if (venueId && !normalizedVenueId) {
        console.warn('⚠️ ReviewService: Received non-UUID venueId parameter, ignoring', venueId);
      }
      if (artistId && !normalizedArtistId) {
        console.warn('⚠️ ReviewService: Received non-UUID artistId parameter, ignoring', artistId);
      }
      if (userCreatedArtistId && !normalizedUserCreatedArtistId) {
        console.warn('⚠️ ReviewService: Received non-UUID userCreatedArtistId parameter, ignoring', userCreatedArtistId);
      }
      if (userCreatedVenueId && !normalizedUserCreatedVenueId) {
        console.warn('⚠️ ReviewService: Received non-UUID userCreatedVenueId parameter, ignoring', userCreatedVenueId);
      }

      const hasCatalogArtist = !!normalizedArtistId;
      const hasUserCreatedArtist = !!normalizedUserCreatedArtistId;
      const hasCatalogVenue = !!normalizedVenueId;
      const hasUserCreatedVenue = !!normalizedUserCreatedVenueId;
      if (
        !(hasCatalogArtist || hasUserCreatedArtist) || (hasCatalogArtist && hasUserCreatedArtist) ||
        !(hasCatalogVenue || hasUserCreatedVenue) || (hasCatalogVenue && hasUserCreatedVenue)
      ) {
        throw new Error('Provide exactly one of artistId or userCreatedArtistId, and exactly one of venueId or userCreatedVenueId.');
      }

      const artistOrFilter = normalizedArtistId
        ? `artist_id.eq.${normalizedArtistId}`
        : `user_created_artist_id.eq.${normalizedUserCreatedArtistId}`;
      const venueOrFilter = normalizedVenueId
        ? `venue_id.eq.${normalizedVenueId}`
        : `user_created_venue_id.eq.${normalizedUserCreatedVenueId}`;

      let existingReview: any = null;
      let checkError: any = null;

      {
        // Check by artist (catalog or user-created) + venue_id when event_id is not provided
        const publishedResult = await (supabase as any)
          .from('reviews')
          .select('id, is_draft')
          .eq('user_id', userId)
          .is('event_id', null)
          .eq('is_draft', false)
          .or(artistOrFilter)
          .or(venueOrFilter)
          .maybeSingle();

        const draftResult = await (supabase as any)
          .from('reviews')
          .select('id, is_draft')
          .eq('user_id', userId)
          .is('event_id', null)
          .eq('is_draft', true)
          .or(artistOrFilter)
          .or(venueOrFilter)
          .maybeSingle();
        
        const publishedReview = publishedResult.data;
        const draftReview = draftResult.data;
        
        console.log('🔍 ReviewService: Checked for existing reviews by artist_id + venue_id:', { 
          published: !!publishedReview, 
          published_id: publishedReview?.id,
          draft: !!draftReview,
          draft_id: draftReview?.id
        });
        
        // If there's a published review, use that (and we'll delete drafts)
        if (publishedReview) {
          existingReview = publishedReview;
          checkError = publishedResult.error;
          
          // Delete any drafts that exist for this artist+venue (cleanup bad state)
          if (draftReview) {
            console.log('⚠️ ReviewService: Found both published review and draft - deleting draft:', draftReview.id);
            try {
              const { error: deleteError } = await supabase
                .from('reviews')
                .delete()
                .eq('id', draftReview.id);
              if (deleteError) {
                console.warn('⚠️ Failed to delete draft:', deleteError);
              } else {
                console.log('✅ Deleted draft:', draftReview.id);
              }
            } catch (error) {
              console.warn('⚠️ Error deleting draft:', error);
            }
          }
        } else if (draftReview) {
          // Only a draft exists, use that
          existingReview = draftReview;
          checkError = draftResult.error;
        } else {
          // No review exists at all
          existingReview = null;
          checkError = null;
        }
      }

      if (checkError && checkError.code !== 'PGRST116' && (checkError as any).status !== 406) {
        throw checkError;
      }

      // reviews.attendees is TEXT[] in DB, but UI may send attendee objects
      const attendeesForDb = reviewData.attendees?.map((a) =>
        typeof a === 'string' ? a : JSON.stringify(a)
      );

      if (existingReview) {
        const isDraft = existingReview.is_draft === true;
        
        // CRITICAL: If existing review IS a draft, DELETE it completely and create fresh published review
        // This is safer than trying to update a draft, which can fail silently
        if (isDraft) {
          console.log('🗑️ ReviewService: Existing review is a draft - deleting it completely before creating published review:', existingReview.id);
          try {
            // Delete ALL drafts for this artist+venue (including the one we found)
            const { error: deleteError } = await supabase
              .from('reviews')
              .delete()
              .eq('user_id', userId)
              .eq('is_draft', true)
              .or(artistOrFilter)
              .or(venueOrFilter);
            
            if (deleteError) {
              console.error('❌ Failed to delete draft before creating published review:', deleteError);
              throw deleteError;
            } else {
              console.log('✅ Deleted draft completely - will create fresh published review');
              // Set existingReview to null so we fall through to the insert path below
              existingReview = null;
            }
          } catch (error) {
            console.error('❌ Exception deleting draft:', error);
            throw error;
          }
        } else {
          // Existing review is already published - just delete any other drafts and update it
          console.log('🔄 ReviewService: Existing review is already published - updating it:', existingReview.id);
          try {
            // Delete all drafts for this artist+venue (but not the published review we're updating)
            const { error: deleteError } = await supabase
              .from('reviews')
              .delete()
              .eq('user_id', userId)
              .eq('is_draft', true)
              .or(artistOrFilter)
              .or(venueOrFilter);
              
              if (!deleteError) {
                console.log('✅ Deleted all drafts before updating published review');
              } else {
                console.warn('⚠️ Error deleting drafts before update:', deleteError);
              }
            } catch (error) {
              console.warn('⚠️ Exception deleting drafts before update:', error);
            }
        }
        
        // If existingReview is null now (we deleted the draft), fall through to insert path below
        if (!existingReview) {
          // Fall through to the insert path - we'll create a fresh published review
        } else {
          // Update the existing published review
          console.log('🔄 ReviewService: Updating existing published review:', existingReview.id);
          // Fetch existing setlist to preserve if not changed (select only setlist; custom_setlist may not exist on all deployments)
          let existingReviewData: { setlist?: any; custom_setlist?: any } | null = null;
          const { data: setlistData, error: setlistFetchError } = await supabase
            .from('reviews')
            .select('setlist')
            .eq('id', existingReview.id)
            .maybeSingle();
          if (!setlistFetchError && setlistData) existingReviewData = setlistData;

          // Update existing review
          // Save all 5 category ratings and feedback directly to database
          const fullUpdate: any = {
            ...(normalizedVenueId ? { venue_id: normalizedVenueId } : {}),
            ...(normalizedUserCreatedVenueId ? { user_created_venue_id: normalizedUserCreatedVenueId } : {}),
            ...(normalizedArtistId ? { artist_id: normalizedArtistId } : {}),
            ...(normalizedUserCreatedArtistId ? { user_created_artist_id: normalizedUserCreatedArtistId } : {}),
          // rating will be calculated by database trigger from category ratings
          review_text: reviewData.review_text,
          is_public: reviewData.is_public,
          is_draft: false, // Mark as published (not a draft)
          draft_data: null, // Clear draft data when publishing
          last_saved_at: null, // Clear last_saved_at when publishing
          Event_date: eventDate, // Always set - required (NOT NULL); column is case-sensitive "Event_date"
          // All 5 category ratings (0.5-5.0, rounded to 1 decimal) - MUST be included
          // Only set if value is > 0, otherwise undefined (NULL in database)
          artist_performance_rating: typeof reviewData.artist_performance_rating === 'number' && !isNaN(reviewData.artist_performance_rating) && reviewData.artist_performance_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.artist_performance_rating)).toFixed(1)) : undefined,
          production_rating: typeof reviewData.production_rating === 'number' && !isNaN(reviewData.production_rating) && reviewData.production_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.production_rating)).toFixed(1)) : undefined,
          venue_rating: typeof reviewData.venue_rating === 'number' && !isNaN(reviewData.venue_rating) && reviewData.venue_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.venue_rating)).toFixed(1)) : undefined,
          location_rating: typeof reviewData.location_rating === 'number' && !isNaN(reviewData.location_rating) && reviewData.location_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.location_rating)).toFixed(1)) : undefined,
          value_rating: typeof reviewData.value_rating === 'number' && !isNaN(reviewData.value_rating) && reviewData.value_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.value_rating)).toFixed(1)) : undefined,
          // All 5 category feedback text fields - MUST be included
          artist_performance_feedback: reviewData.artist_performance_feedback?.trim() || undefined,
          production_feedback: reviewData.production_feedback?.trim() || undefined,
          venue_feedback: reviewData.venue_feedback?.trim() || undefined,
          location_feedback: reviewData.location_feedback?.trim() || undefined,
          value_feedback: reviewData.value_feedback?.trim() || undefined,
          // All 5 category recommendation fields
          ticket_price_paid: reviewData.ticket_price_paid,
          artist_rating: reviewData.artist_rating, // Legacy field
          review_type: reviewData.review_type,
          venue_tags: reviewData.venue_tags,
          artist_tags: reviewData.artist_tags,
          photos: reviewData.photos, // Add photos field
          // Preserve setlist if not explicitly provided, otherwise use the new value
          // setlist is JSONB - store the object directly (Supabase will handle JSONB conversion)
          setlist: reviewData.setlist !== undefined ? reviewData.setlist : (existingReviewData?.setlist || null),
          // custom_setlist omitted: column may not exist on all deployments (e.g. reviews without 20260131100000)
          attendees: attendeesForDb, // Add attendees field
          was_there: true, // If someone writes a review, they obviously attended
          updated_at: new Date().toISOString()
          };
          
          console.log('🔍 ReviewService: Update payload category ratings:', {
          artist_performance_rating: fullUpdate.artist_performance_rating,
          production_rating: fullUpdate.production_rating,
          venue_rating: fullUpdate.venue_rating,
          location_rating: fullUpdate.location_rating,
          value_rating: fullUpdate.value_rating,
        });
        console.log('🔍 ReviewService: Update payload category feedback:', {
          artist_performance_feedback: fullUpdate.artist_performance_feedback,
          production_feedback: fullUpdate.production_feedback,
          venue_feedback: fullUpdate.venue_feedback,
          location_feedback: fullUpdate.location_feedback,
          value_feedback: fullUpdate.value_feedback,
          });

          // Perform update without returning to avoid 400/406 in some environments
          let { error } = await supabase
            .from('reviews')
            .update(fullUpdate)
            .eq('id', existingReview.id);
          // Fetch the updated row separately
          let data: any = null;
          if (!error) {
          const fetched = await supabase
            .from('reviews')
            .select('*')
            .eq('id', existingReview.id)
            .maybeSingle();
          data = fetched.data as any;
          error = fetched.error as any;
          
          // Verify the update worked
          console.log('✅ ReviewService: Updated review category ratings:', {
            artist_performance_rating: (data as any)?.artist_performance_rating,
            production_rating: (data as any)?.production_rating,
            venue_rating: (data as any)?.venue_rating,
            location_rating: (data as any)?.location_rating,
            value_rating: (data as any)?.value_rating,
          });
          console.log('✅ ReviewService: Updated review category feedback:', {
            artist_performance_feedback: (data as any)?.artist_performance_feedback,
            production_feedback: (data as any)?.production_feedback,
            venue_feedback: (data as any)?.venue_feedback,
            location_feedback: (data as any)?.location_feedback,
            value_feedback: (data as any)?.value_feedback,
          });
          }

          if (error && ((error as any)?.status === 400 || (error as any)?.code === '42703')) {
            // Retry without setlist/custom_setlist (and other optional columns) when DB returns 400/undefined column
            const fallbackUpdate: any = {
              review_text: reviewData.review_text,
              is_public: reviewData.is_public,
              is_draft: false,
              draft_data: null,
              last_saved_at: null,
              Event_date: eventDate,
              rating: typeof reviewData.rating === 'number' ? Number(reviewData.rating.toFixed(1)) : deriveRating(reviewData),
              artist_performance_rating: typeof reviewData.artist_performance_rating === 'number' && !isNaN(reviewData.artist_performance_rating) ? Number(Math.max(0.5, Math.min(5.0, reviewData.artist_performance_rating)).toFixed(1)) : undefined,
              production_rating: typeof reviewData.production_rating === 'number' && !isNaN(reviewData.production_rating) ? Number(Math.max(0.5, Math.min(5.0, reviewData.production_rating)).toFixed(1)) : undefined,
              venue_rating: typeof reviewData.venue_rating === 'number' && !isNaN(reviewData.venue_rating) ? Number(Math.max(0.5, Math.min(5.0, reviewData.venue_rating)).toFixed(1)) : undefined,
              location_rating: typeof reviewData.location_rating === 'number' && !isNaN(reviewData.location_rating) ? Number(Math.max(0.5, Math.min(5.0, reviewData.location_rating)).toFixed(1)) : undefined,
              value_rating: typeof reviewData.value_rating === 'number' && !isNaN(reviewData.value_rating) ? Number(Math.max(0.5, Math.min(5.0, reviewData.value_rating)).toFixed(1)) : undefined,
              photos: reviewData.photos,
              setlist: reviewData.setlist !== undefined ? reviewData.setlist : (existingReviewData?.setlist ?? null),
              was_there: true,
              updated_at: new Date().toISOString()
            };

            const retry = await supabase
              .from('reviews')
              .update(fallbackUpdate)
              .eq('id', existingReview.id)
              .select()
              .single();
            data = retry.data as any;
            error = retry.error as any;
          }

          if (error) throw error as any;
          
          // CRITICAL: After updating an existing review, ensure no drafts remain for this artist+venue
          if (data) {
          try {
            // First, ensure the current review is definitely not a draft anymore
            // Sometimes the update might not have worked properly, so we verify and fix if needed
            const verifyResult = await supabase
              .from('reviews')
              .select('id, is_draft')
              .eq('id', data.id)
              .maybeSingle();
            
            if (verifyResult.data) {
              if (verifyResult.data.is_draft === true) {
                // Draft flag is still true! Force update it to false
                console.warn('⚠️ ReviewService: Draft flag still true after update, forcing is_draft = false');
                await supabase
                  .from('reviews')
                  .update({ 
                    is_draft: false, 
                    draft_data: null, 
                    last_saved_at: null 
                  })
                  .eq('id', data.id);
              }
            }
            
            // Delete ALL drafts for this artist+venue
            const deleteQuery = (supabase as any)
              .from('reviews')
              .delete()
              .eq('user_id', userId)
              .eq('is_draft', true)
              .or(artistOrFilter)
              .or(venueOrFilter);
            
            const deleteResult = await deleteQuery;
            
            if (deleteResult.error) {
              console.warn('⚠️ ReviewService: Failed to delete drafts after update:', deleteResult.error);
            } else {
              const deletedCount = deleteResult.data?.length || 0;
              if (deletedCount > 0) {
                console.log(`🧹 Deleted ${deletedCount} draft review(s) after submitting review for artist+venue`);
              } else {
                console.log('✅ ReviewService: No drafts found to delete (review is now published)');
              }
              
              // Final verification: check if any drafts still exist for this artist+venue
              const remainingDrafts = await supabase
                .from('reviews')
                .select('id, is_draft')
                .eq('user_id', userId)
                .eq('is_draft', true)
                .or(artistOrFilter)
                .or(venueOrFilter);
              
              if (remainingDrafts.data && remainingDrafts.data.length > 0) {
                console.warn(`⚠️ ReviewService: WARNING - ${remainingDrafts.data.length} draft(s) still exist after cleanup for artist+venue`);
              } else {
                console.log('✅ ReviewService: Verified - no drafts remain for this artist+venue');
              }
            }
          } catch (cleanupError) {
            console.warn('⚠️ ReviewService: Error during draft cleanup after update:', cleanupError);
            // Don't throw - cleanup is not critical, but log for debugging
          }
          }
          
          // If this is a public review with photos, promote the first photo to artist/venue image_url
          // when the current image is missing or a placeholder.
          await ReviewService.promoteReviewPhotoToEntityImage({
            artistId: (data as any)?.artist_id ?? normalizedArtistId,
            venueId: (data as any)?.venue_id ?? normalizedVenueId,
            photoUrl: Array.isArray((data as any)?.photos) ? (data as any).photos[0] : undefined,
            isPublic: (data as any)?.is_public,
          });

          const resolvedArtistId = (data as any)?.artist_id ?? (data as any)?.user_created_artist_id ?? normalizedArtistId ?? normalizedUserCreatedArtistId;
          ReviewService.notifyTaggedFriendsInReview({
            actorUserId: userId,
            reviewData,
            savedReview: data,
            artistId: resolvedArtistId,
            venueId: normalizedVenueId,
            eventDate,
          }).catch((err) => console.warn('Failed to notify tagged friends:', err));

          return data as any as UserReview;
        }
      }

      // No existing review found - create a new one
      // This will be a published review (is_draft = false)
      // Save all 5 category ratings and feedback directly to database
      // NOTE: Do NOT send rating - let the database trigger calculate it from category ratings
      const insertPayload: any = {
        user_id: userId,
        ...(normalizedVenueId ? { venue_id: normalizedVenueId } : {}),
        ...(normalizedArtistId ? { artist_id: normalizedArtistId } : {}),
        ...(normalizedUserCreatedArtistId ? { user_created_artist_id: normalizedUserCreatedArtistId } : {}),
        ...(normalizedVenueId ? { venue_id: normalizedVenueId } : {}),
        ...(normalizedUserCreatedVenueId ? { user_created_venue_id: normalizedUserCreatedVenueId } : {}),
        // rating will be calculated by ensure_draft_no_rating trigger from category ratings
        reaction_emoji: reviewData.reaction_emoji,
        review_text: reviewData.review_text,
        is_public: reviewData.is_public ?? true,
        is_draft: false, // Explicitly mark as published (not a draft)
        Event_date: eventDate, // Always set - required (NOT NULL); column is case-sensitive "Event_date"
        // All 5 category ratings (0.5-5.0, rounded to 1 decimal)
        // Only set if value is > 0, otherwise undefined (NULL in database)
        artist_performance_rating: typeof reviewData.artist_performance_rating === 'number' && !isNaN(reviewData.artist_performance_rating) && reviewData.artist_performance_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.artist_performance_rating)).toFixed(1)) : undefined,
        production_rating: typeof reviewData.production_rating === 'number' && !isNaN(reviewData.production_rating) && reviewData.production_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.production_rating)).toFixed(1)) : undefined,
        venue_rating: typeof reviewData.venue_rating === 'number' && !isNaN(reviewData.venue_rating) && reviewData.venue_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.venue_rating)).toFixed(1)) : undefined,
        location_rating: typeof reviewData.location_rating === 'number' && !isNaN(reviewData.location_rating) && reviewData.location_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.location_rating)).toFixed(1)) : undefined,
        value_rating: typeof reviewData.value_rating === 'number' && !isNaN(reviewData.value_rating) && reviewData.value_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.value_rating)).toFixed(1)) : undefined,
        // All 5 category feedback text fields
        artist_performance_feedback: reviewData.artist_performance_feedback?.trim() || undefined,
        production_feedback: reviewData.production_feedback?.trim() || undefined,
        venue_feedback: reviewData.venue_feedback?.trim() || undefined,
        location_feedback: reviewData.location_feedback?.trim() || undefined,
        value_feedback: reviewData.value_feedback?.trim() || undefined,
        // All 5 category recommendation fields
        ticket_price_paid: reviewData.ticket_price_paid,
        artist_rating: reviewData.artist_rating, // Legacy field
        review_type: reviewData.review_type,
        venue_tags: reviewData.venue_tags,
        artist_tags: reviewData.artist_tags,
        photos: reviewData.photos, // Add photos field
        setlist: reviewData.setlist || null, // Add setlist field (JSONB - Supabase handles conversion)
        attendees: attendeesForDb, // Add attendees field
        was_there: true // If someone writes a review, they obviously attended
      } as any;

      console.log('🔍 ReviewService: Insert payload category ratings:', {
        artist_performance_rating: insertPayload.artist_performance_rating,
        production_rating: insertPayload.production_rating,
        venue_rating: insertPayload.venue_rating,
        location_rating: insertPayload.location_rating,
        value_rating: insertPayload.value_rating,
      });
      console.log('🔍 ReviewService: Insert payload category feedback:', {
        artist_performance_feedback: insertPayload.artist_performance_feedback,
        production_feedback: insertPayload.production_feedback,
        venue_feedback: insertPayload.venue_feedback,
        location_feedback: insertPayload.location_feedback,
        value_feedback: insertPayload.value_feedback,
      });

      if (normalizedArtistId) {
        (insertPayload as any).artist_id = normalizedArtistId;
      }
      if (normalizedUserCreatedArtistId) {
        (insertPayload as any).user_created_artist_id = normalizedUserCreatedArtistId;
      }
      if (normalizedVenueId) {
        (insertPayload as any).venue_id = normalizedVenueId;
      }
      if (normalizedUserCreatedVenueId) {
        (insertPayload as any).user_created_venue_id = normalizedUserCreatedVenueId;
      }
      
      // Debug: Log the final insert payload with all category data
      console.log('🔍 ReviewService: Final insert payload:', {
        ...insertPayload,
        category_ratings: {
          artist_performance_rating: insertPayload.artist_performance_rating,
          production_rating: insertPayload.production_rating,
          venue_rating: insertPayload.venue_rating,
          location_rating: insertPayload.location_rating,
          value_rating: insertPayload.value_rating,
        },
        category_feedback: {
          artist_performance_feedback: insertPayload.artist_performance_feedback,
          production_feedback: insertPayload.production_feedback,
          venue_feedback: insertPayload.venue_feedback,
          location_feedback: insertPayload.location_feedback,
          value_feedback: insertPayload.value_feedback,
        }
      });

      // Try full insert first
      let { data, error } = await supabase
        .from('reviews')
        .insert(insertPayload as any)
        .select()
        .maybeSingle();

      if (error) {
        // If duplicate key (user_id, artist_id, venue_id) already exists, fallback to update instead of failing
        const err: any = error as any;
        if (err?.code === '23505' || /duplicate key/i.test(err?.message || '')) {
          const upd = await supabase
            .from('reviews')
            .update(insertPayload as any)
            .eq('user_id', userId)
            .or(artistOrFilter)
            .or(venueOrFilter)
            .select()
            .maybeSingle();
          data = upd.data as any;
          error = upd.error as any;
        }
      }

      if (error) {
        // Retry with minimal columns if full insert fails
        // Still include all category ratings and feedback - they're essential
        const minimalInsert: any = {
          user_id: userId,
          ...(normalizedArtistId ? { artist_id: normalizedArtistId } : {}),
          ...(normalizedUserCreatedArtistId ? { user_created_artist_id: normalizedUserCreatedArtistId } : {}),
          ...(normalizedVenueId ? { venue_id: normalizedVenueId } : {}),
          ...(normalizedUserCreatedVenueId ? { user_created_venue_id: normalizedUserCreatedVenueId } : {}),
          // rating will be calculated by database trigger from category ratings
          review_text: reviewData.review_text,
          is_public: reviewData.is_public ?? true,
          is_draft: false, // Explicitly mark as published
          Event_date: eventDate, // Always set - required (NOT NULL); column is case-sensitive "Event_date"
          // All 5 category ratings (0.5-5.0, rounded to 1 decimal)
          // Only set if value is > 0, otherwise undefined (NULL in database)
          artist_performance_rating: typeof reviewData.artist_performance_rating === 'number' && !isNaN(reviewData.artist_performance_rating) && reviewData.artist_performance_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.artist_performance_rating)).toFixed(1)) : undefined,
          production_rating: typeof reviewData.production_rating === 'number' && !isNaN(reviewData.production_rating) && reviewData.production_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.production_rating)).toFixed(1)) : undefined,
          venue_rating: typeof reviewData.venue_rating === 'number' && !isNaN(reviewData.venue_rating) && reviewData.venue_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.venue_rating)).toFixed(1)) : undefined,
          location_rating: typeof reviewData.location_rating === 'number' && !isNaN(reviewData.location_rating) && reviewData.location_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.location_rating)).toFixed(1)) : undefined,
          value_rating: typeof reviewData.value_rating === 'number' && !isNaN(reviewData.value_rating) && reviewData.value_rating > 0 ? Number(Math.max(0.5, Math.min(5.0, reviewData.value_rating)).toFixed(1)) : undefined,
          // All 5 category feedback text fields
          artist_performance_feedback: reviewData.artist_performance_feedback?.trim() || undefined,
          production_feedback: reviewData.production_feedback?.trim() || undefined,
          venue_feedback: reviewData.venue_feedback?.trim() || undefined,
          location_feedback: reviewData.location_feedback?.trim() || undefined,
          value_feedback: reviewData.value_feedback?.trim() || undefined,
          ticket_price_paid: reviewData.ticket_price_paid,
          photos: reviewData.photos,
          setlist: reviewData.setlist || null, // JSONB field (Supabase handles conversion)
          attendees: attendeesForDb,
          was_there: true
        };

        console.error('⚠️ ReviewService: First insert failed, retrying with minimal insert. Error:', error);
        const retry = await supabase
          .from('reviews')
          .insert(minimalInsert)
          .select()
          .single();
        data = retry.data as any;
        error = retry.error as any;
      }

      if (error) {
        console.error('❌ ReviewService: Final insert/update error:', error);
        throw error as any;
      }
      
      console.log('✅ ReviewService: Review saved successfully. Data:', data);
      console.log('✅ ReviewService: Saved category ratings:', {
        artist_performance_rating: (data as any)?.artist_performance_rating,
        production_rating: (data as any)?.production_rating,
        venue_rating: (data as any)?.venue_rating,
        location_rating: (data as any)?.location_rating,
        value_rating: (data as any)?.value_rating,
      });
      console.log('✅ ReviewService: Saved category feedback:', {
        artist_performance_feedback: (data as any)?.artist_performance_feedback,
        production_feedback: (data as any)?.production_feedback,
        venue_feedback: (data as any)?.venue_feedback,
        location_feedback: (data as any)?.location_feedback,
        value_feedback: (data as any)?.value_feedback,
      });

      // If this is a public review with photos, promote the first photo to artist/venue image_url
      // when the current image is missing or a placeholder.
      await ReviewService.promoteReviewPhotoToEntityImage({
        artistId: (data as any)?.artist_id ?? normalizedArtistId,
        venueId: (data as any)?.venue_id ?? normalizedVenueId, // catalog only for image promotion
        photoUrl: Array.isArray((data as any)?.photos) ? (data as any).photos[0] : undefined,
        isPublic: (data as any)?.is_public,
      });

      const resolvedArtistId = (data as any)?.artist_id ?? (data as any)?.user_created_artist_id ?? normalizedArtistId ?? normalizedUserCreatedArtistId;
      ReviewService.notifyTaggedFriendsInReview({
        actorUserId: userId,
        reviewData,
        savedReview: data,
        artistId: resolvedArtistId,
        venueId: (data as any)?.venue_id ?? (data as any)?.user_created_venue_id ?? normalizedVenueId ?? normalizedUserCreatedVenueId,
        eventDate,
      }).catch((err) => console.warn('Failed to notify tagged friends:', err));
      
      // CRITICAL: Delete ALL drafts for this event immediately after creating published review
      // This is the nuclear option - delete ALL drafts, no exceptions
      // Only run when we have a valid eventId (event-based flow); artist+venue flow handles cleanup elsewhere
      if (isValidUuid(_eventId) && data) {
        try {
          // Delete ALL drafts for this event (the published review has is_draft=false, so it's safe)
          const { error: deleteError, data: deletedData } = await supabase
            .from('reviews')
            .delete()
            .eq('user_id', userId)
            .eq('event_id', _eventId)
            .eq('is_draft', true)
            .select('id');
          
          if (deleteError) {
            console.error('❌ CRITICAL: Failed to delete drafts after creating review:', deleteError);
          } else {
            const deletedCount = deletedData?.length || 0;
            if (deletedCount > 0) {
              console.log(`🧹 NUCLEAR: Deleted ${deletedCount} draft(s) after review creation`);
            }
            
            // VERIFY deletion worked - check if any drafts still exist
            const verifyResult = await supabase
              .from('reviews')
              .select('id')
              .eq('user_id', userId)
              .eq('event_id', _eventId)
              .eq('is_draft', true);
            
            if (verifyResult.data && verifyResult.data.length > 0) {
              console.error(`❌ CRITICAL ERROR: ${verifyResult.data.length} draft(s) STILL EXIST after deletion!`, verifyResult.data);
              // Try one more time with force delete
              await supabase
                .from('reviews')
                .delete()
                .eq('user_id', userId)
                .eq('event_id', _eventId)
                .eq('is_draft', true);
            } else {
              console.log('✅ Verified: All drafts deleted successfully');
            }
          }
        } catch (cleanupError) {
          console.error('❌ CRITICAL: Exception during draft cleanup:', cleanupError);
          // Try one more deletion attempt
          try {
            await supabase
              .from('reviews')
              .delete()
              .eq('user_id', userId)
              .eq('event_id', _eventId)
              .eq('is_draft', true);
          } catch (retryError) {
            console.error('❌ CRITICAL: Retry deletion also failed:', retryError);
          }
        }
      }
      
      return data as any as UserReview;
    } catch (error) {
      // Surface deeper Supabase details when possible
      const errObj: any = error as any;
      const message = errObj?.message || errObj?.error_description || errObj?.details || errObj?.hint || JSON.stringify(errObj);
      console.error('Error setting event review:', errObj);
      throw new Error(`Failed to set event review: ${message}`);
    }
  }

  /**
   * Get user's review for an event
   */
  static async getUserEventReview(userId: string, eventId: string): Promise<UserReview | null> {
    try {
      // Validate UUID format to prevent 400 errors
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(eventId)) {
        console.log('⚠️ Invalid event ID format (not a UUID), skipping review lookup:', eventId);
        return null;
      }

      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = not found, which is okay
        throw error;
      }

      return data || null;
    } catch (error) {
      const err = error as any;
      // Don't log UUID validation errors as they're handled gracefully
      if (err?.code !== '22P02') {
        console.error('Error getting user event review:', error);
      }
      return null;
    }
  }

  /**
   * Get user's previous reviews at the same venue (excluding current event)
   * Returns the most recent review with venue and location data
   */
  static async getPreviousVenueReview(
    userId: string,
    venueId: string | null | undefined,
    excludeReviewId?: string
  ): Promise<UserReview | null> {
    try {
      if (!venueId) return null;

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(venueId)) {
        return null;
      }

      let query = supabase
        .from('reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('venue_id', venueId)
        .eq('is_draft', false)
        .order('created_at', { ascending: false });

      if (excludeReviewId && uuidRegex.test(excludeReviewId)) {
        query = query.neq('id', excludeReviewId);
      }

      const { data, error } = await query;

      if (error && error.code !== 'PGRST116') {
        console.error('Error getting previous venue review:', error);
        return null;
      }

      if (!data || data.length === 0) {
        return null;
      }

      // Filter to find reviews with venue or location data (use only 5-category columns)
      const reviewWithVenueData = data.find((review: any) => {
        return (
          review.venue_rating != null ||
          review.location_rating != null ||
          review.venue_feedback ||
          review.location_feedback
        );
      });

      return reviewWithVenueData || null;
    } catch (error) {
      console.error('Error getting previous venue review:', error);
      return null;
    }
  }

  /**
   * Get all reviews for an event with engagement data
   */
  static async getEventReviews(
    eventId: string, 
    userId?: string
  ): Promise<{
    reviews: ReviewWithEngagement[];
    averageRating: number;
    totalReviews: number;
  }> {
    try {
      // Get reviews with user engagement data
      // Note: Using events_with_artist_venue view for normalized columns
      const { data: reviews, error } = await supabase
        .from('reviews')
        .select(`
          *,
          events_with_artist_venue:event_id (id, title, artist_name_normalized, venue_name_normalized, event_date),
          review_likes!left(id, user_id)
        `)
        .eq('event_id', eventId)
        .eq('is_public', true);
      
      // Sort by rating (which is calculated by database trigger from category ratings)
      if (reviews) {
        reviews.sort((a: any, b: any) => {
          // Use review.rating directly - it's always calculated as the average of 5 category ratings by the database trigger
          const ratingA = typeof a.rating === 'number' ? a.rating : 0;
          const ratingB = typeof b.rating === 'number' ? b.rating : 0;
          
          // Primary sort: by rating (descending)
          if (ratingB !== ratingA) return ratingB - ratingA;
          
          // Secondary sort: by created_at (descending)
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      }

      if (error) throw error;

      // Check if current user has liked any of these reviews
      let userLikes: string[] = [];
      if (userId && reviews && reviews.length > 0) {
        // First, get entity_ids for all review IDs
        const reviewIds = reviews.map(r => r.id);
        const { data: entities, error: entitiesError } = await supabase
          .from('entities')
          .select('id, entity_uuid')
          .eq('entity_type', 'review')
          .in('entity_uuid', reviewIds);
        
        if (entitiesError) {
          console.error('Error fetching entities for review likes:', entitiesError);
          // Continue with empty likes array if entity lookup fails
        } else if (entities && entities.length > 0) {
          const entityIds = entities.map(e => e.id);
          // Now query engagements using entity_ids (FK to entities.id)
          const { data: likes } = await supabase
            .from('engagements')
            .select('entity_id')
            .eq('user_id', userId)
            .eq('engagement_type', 'like')
            .in('entity_id', entityIds);
          
          // Map entity_ids back to review IDs for matching
          const entityIdToReviewId = new Map(entities.map(e => [e.id, e.entity_uuid]));
          userLikes = (likes?.map(l => entityIdToReviewId.get(l.entity_id)).filter(Boolean) as string[]) || [];
        }
      }

      // Process reviews with engagement data
      const processedReviews: ReviewWithEngagement[] = (reviews || []).map((review: any) => ({
        ...review,
        // Project event info onto the review for UI access (using normalized column names)
        artist_name: (review.events_with_artist_venue as any)?.artist_name_normalized || review.events?.artist_name,
        artist_id: review.artist_id || null, // Use review's artist_id if available
        venue_name: (review.events_with_artist_venue as any)?.venue_name_normalized || review.events?.venue_name,
        venue_id: review.venue_id || null, // Use review's venue_id if available
        is_liked_by_user: userLikes.includes(review.id),
        user_like_id: userLikes.includes(review.id) 
          ? review.review_likes?.find(l => l.user_id === userId)?.id 
          : undefined,
        // ensure optional fields exist for typing
        review_type: (review as any).review_type,
        is_public: (review as any).is_public
      }));

      const totalReviews = processedReviews.length;
      const averageRating = totalReviews > 0 
        ? processedReviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews 
        : 0;

      return {
        reviews: processedReviews,
        averageRating,
        totalReviews
      };
    } catch (error) {
      console.error('Error getting event reviews:', error);
      throw new Error(`Failed to get event reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's review history
   */
  static async getUserReviewHistory(userId: string): Promise<{
    reviews: Array<{
      review: UserReview;
      event: any; // JamBase event data
    }>;
    total: number;
  }> {
    try {
      console.log('🔍 ReviewService: Getting user review history for userId:', userId);
      
      // Fetch reviews first (without join since FK doesn't exist)
      console.log('🔍 ReviewService: Starting query for userId:', userId);
      
      // First, check total reviews for this user (including drafts) for debugging
      const { count: totalCount } = await supabase
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      console.log('🔍 ReviewService: Total reviews (including drafts) for user:', totalCount);
      
      // Fetch reviews and calculate average rating for ordering
      // Note: Event_date is a case-sensitive column ("Event_date" in PostgreSQL)
      // PostgREST requires explicit selection of case-sensitive columns with quotes
      // We need to explicitly select "Event_date" - PostgREST will return it preserving case
      const { data: reviewsData, error: reviewsError, count } = await supabase
        .from('reviews')
        .select('*, "Event_date"', { count: 'exact' })
        .eq('user_id', userId)
        .or('is_draft.eq.false,is_draft.is.null') // Include published + legacy reviews where is_draft is NULL
        .order('created_at', { ascending: false });
      
      // PostgREST may normalize "Event_date" to "event_date" (lowercase)
      // Log the first review to see what column names we actually get
      if (reviewsData && reviewsData.length > 0) {
        console.log('🔍 ReviewService: First review column names:', Object.keys(reviewsData[0]));
        console.log('🔍 ReviewService: First review Event_date check:', {
          hasEventDate: 'event_date' in reviewsData[0],
          hasEventDateCapital: 'Event_date' in reviewsData[0],
          event_date: (reviewsData[0] as any).event_date,
          Event_date: (reviewsData[0] as any).Event_date,
        });
      }
      
      // Sort by rating (which is calculated by database trigger from category ratings)
      if (reviewsData) {
        reviewsData.sort((a: any, b: any) => {
          // Use review.rating directly - it's always calculated as the average of 5 category ratings by the database trigger
          const ratingA = typeof a.rating === 'number' ? a.rating : 0;
          const ratingB = typeof b.rating === 'number' ? b.rating : 0;
          
          // Primary sort: by rating (descending)
          if (ratingB !== ratingA) return ratingB - ratingA;
          
          // Secondary sort: by rank_order (ascending, nulls last)
          if (a.rank_order != null && b.rank_order != null) {
            return a.rank_order - b.rank_order;
          }
          if (a.rank_order != null) return -1;
          if (b.rank_order != null) return 1;
          
          // Tertiary sort: by created_at (descending)
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      }
      
      console.log('🔍 ReviewService: Query completed. Count:', count, 'Data length:', reviewsData?.length);
      if (reviewsData && reviewsData.length > 0) {
        console.log('🔍 ReviewService: First review sample:', {
          id: reviewsData[0].id,
          user_id: reviewsData[0].user_id,
          event_id: reviewsData[0].event_id,
          is_draft: reviewsData[0].is_draft,
          was_there: reviewsData[0].was_there,
          review_text: reviewsData[0].review_text?.substring(0, 50)
        });
      }

      console.log('🔍 ReviewService: Raw query result:', { 
        dataLength: reviewsData?.length, 
        error: reviewsError,
        firstReview: reviewsData?.[0],
        userId: userId
      });

      if (reviewsError) {
        console.error('❌ ReviewService: Query error:', reviewsError);
        throw reviewsError;
      }

      if (!reviewsData || reviewsData.length === 0) {
        console.warn('⚠️ ReviewService: No reviews found for user:', userId);
        return {
          reviews: [],
          total: 0
        };
      }

      // Fetch events separately and create a map
      const eventIds = [...new Set((reviewsData || []).map((r: any) => r.event_id).filter(Boolean))];
      console.log('🔍 ReviewService: Event IDs to fetch:', eventIds.length, eventIds);
      let eventsMap: Record<string, any> = {};
      
      // Collect artist/venue IDs from reviews (catalog + user-created)
      const reviewArtistIds = [...new Set((reviewsData || []).map((r: any) => r.artist_id).filter(Boolean))];
      const reviewVenueIds = [...new Set((reviewsData || []).map((r: any) => r.venue_id).filter(Boolean))];
      const reviewUserCreatedArtistIds = [...new Set((reviewsData || []).map((r: any) => r.user_created_artist_id).filter(Boolean))];
      const reviewUserCreatedVenueIds = [...new Set((reviewsData || []).map((r: any) => r.user_created_venue_id).filter(Boolean))];
      
      if (eventIds.length > 0) {
        // Query events table
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('id, title, artist_name, venue_name, artist_id, venue_id, event_date, doors_time, venue_city, venue_state, venue_zip')
          .in('id', eventIds);
        
        console.log('🔍 ReviewService: Events query result:', {
          dataLength: eventsData?.length,
          error: eventsError,
          firstEvent: eventsData?.[0]
        });
        
        if (!eventsError && eventsData) {
          // Get unique artist and venue IDs from events
          const eventArtistIds = [...new Set(eventsData.map((e: any) => e.artist_id).filter(Boolean))];
          const eventVenueIds = [...new Set(eventsData.map((e: any) => e.venue_id).filter(Boolean))];
          
          // Combine with review-level artist/venue IDs
          const allArtistIds = [...new Set([...eventArtistIds, ...reviewArtistIds])];
          const allVenueIds = [...new Set([...eventVenueIds, ...reviewVenueIds])];
          
          // Fetch artist names from artists table
          let artistsMap: Record<string, any> = {};
          if (allArtistIds.length > 0) {
            const { data: artistsData } = await supabase
              .from('artists')
              .select('id, name, image_url')
              .in('id', allArtistIds);
            
            if (artistsData) {
              artistsMap = artistsData.reduce((acc: Record<string, any>, artist: any) => {
                acc[artist.id] = artist;
                return acc;
              }, {});
            }
          }
          
          // Fetch venue names from venues table
          let venuesMap: Record<string, any> = {};
          if (allVenueIds.length > 0) {
            const { data: venuesData } = await supabase
              .from('venues')
              .select('id, name, image_url')
              .in('id', allVenueIds);
            
            if (venuesData) {
              venuesMap = venuesData.reduce((acc: Record<string, any>, venue: any) => {
                acc[venue.id] = venue;
                return acc;
              }, {});
            }
          }
          
          // Build events map with normalized names from artists/venues tables, fallback to event.artist_name/venue_name
          eventsMap = eventsData.reduce((acc: Record<string, any>, event: any) => {
            acc[event.id] = {
              ...event,
              artist_name: artistsMap[event.artist_id]?.name || event.artist_name,
              venue_name: venuesMap[event.venue_id]?.name || event.venue_name,
              artist_id: event.artist_id,
              venue_id: event.venue_id,
            };
            return acc;
          }, {});
          
          console.log('🔍 ReviewService: Events map created with', Object.keys(eventsMap).length, 'events');
          console.log('🔍 ReviewService: Sample event in map:', eventsMap[Object.keys(eventsMap)[0]]);
        } else if (eventsError) {
          console.error('❌ ReviewService: Error fetching events:', eventsError);
        }
      } else {
        console.warn('⚠️ ReviewService: No event IDs found in reviews');
      }
      
      // Also fetch artist/venue names for reviews that don't have event_id but have artist_id/venue_id
      let artistsMap: Record<string, any> = {};
      let venuesMap: Record<string, any> = {};
      
      if (reviewArtistIds.length > 0) {
        const { data: artistsData } = await supabase
          .from('artists')
          .select('id, name, image_url')
          .in('id', reviewArtistIds);
        
        if (artistsData) {
          artistsMap = artistsData.reduce((acc: Record<string, any>, artist: any) => {
            acc[artist.id] = artist;
            return acc;
          }, {});
        }
      }
      
      if (reviewVenueIds.length > 0) {
        const { data: venuesData } = await supabase
          .from('venues')
          .select('id, name, image_url')
          .in('id', reviewVenueIds);
        
        if (venuesData) {
          venuesMap = venuesData.reduce((acc: Record<string, any>, venue: any) => {
            acc[venue.id] = venue;
            return acc;
          }, {});
        }
      }

      // Fetch user-created artist and venue names for reviews that use them
      let userCreatedArtistsMap: Record<string, any> = {};
      let userCreatedVenuesMap: Record<string, any> = {};
      if (reviewUserCreatedArtistIds.length > 0) {
        const { data: ucaData } = await supabase
          .from('user_created_artists')
          .select('id, name, image_url')
          .in('id', reviewUserCreatedArtistIds);
        if (ucaData) {
          userCreatedArtistsMap = ucaData.reduce((acc: Record<string, any>, row: any) => {
            acc[row.id] = row;
            return acc;
          }, {});
        }
      }
      if (reviewUserCreatedVenueIds.length > 0) {
        const { data: ucvData } = await supabase
          .from('user_created_venues')
          .select('id, name, image_url')
          .in('id', reviewUserCreatedVenueIds);
        if (ucvData) {
          userCreatedVenuesMap = ucvData.reduce((acc: Record<string, any>, row: any) => {
            acc[row.id] = row;
            return acc;
          }, {});
        }
      }

      const data = reviewsData;

      // Filter reviews: include those where user either attended or wrote a review
      // Exclude ATTENDANCE_ONLY reviews that don't have was_there=true
      const filteredData = (data || []).filter((item: any) => {
        // Include if was_there is true
        if (item.was_there === true) {
          return true;
        }
        // Include if review_text exists and is not ATTENDANCE_ONLY
        if (item.review_text && item.review_text !== 'ATTENDANCE_ONLY') {
          return true;
        }
        // Exclude everything else
        return false;
      });

      console.log('🔍 ReviewService: Total reviews fetched:', data?.length);
      console.log('🔍 ReviewService: Reviews after filtering:', filteredData.length);
      console.log('🔍 ReviewService: Sample filtered review:', filteredData[0] ? {
        id: filteredData[0].id,
        user_id: filteredData[0].user_id,
        event_id: filteredData[0].event_id,
        was_there: filteredData[0].was_there,
        review_text: filteredData[0].review_text,
        hasEventInMap: !!eventsMap[filteredData[0].event_id],
        eventTitle: eventsMap[filteredData[0].event_id]?.title
      } : 'No reviews');

      const result = {
        reviews: filteredData.map((item: any) => {
          // Get event data if event_id exists
          const eventData = item.event_id ? (eventsMap[item.event_id] || null) : null;
          
          // Resolve artist name from catalog or user-created
          const resolvedArtistName = item.artist_id
            ? (artistsMap[item.artist_id]?.name ?? null)
            : (item.user_created_artist_id ? (userCreatedArtistsMap[item.user_created_artist_id]?.name ?? null) : null);
          const resolvedVenueName = item.venue_id
            ? (venuesMap[item.venue_id]?.name ?? null)
            : (item.user_created_venue_id ? (userCreatedVenuesMap[item.user_created_venue_id]?.name ?? null) : null);

          // If no event data but review has artist/venue (catalog or user-created), create event-like object
          let event = eventData;
          if (!event && (item.artist_id || item.user_created_artist_id || item.venue_id || item.user_created_venue_id)) {
            event = {
              id: null,
              title: null,
              artist_name: resolvedArtistName,
              venue_name: resolvedVenueName,
              artist_id: item.artist_id,
              venue_id: item.venue_id,
              event_date: null,
            };
          }

          // If event exists but missing artist/venue names, fill from review (catalog or user-created)
          if (event && (!event.artist_name || !event.venue_name)) {
            if (!event.artist_name) {
              event.artist_name = resolvedArtistName;
              event.artist_id = item.artist_id ?? item.user_created_artist_id ?? event.artist_id;
            }
            if (!event.venue_name) {
              event.venue_name = resolvedVenueName;
              event.venue_id = item.venue_id ?? item.user_created_venue_id ?? event.venue_id;
            }
          }
          
          // Convert Event_date from string (YYYY-MM-DD) to Date object if present
          // PostgREST returns DATE columns as strings
          // Parse in local timezone to avoid date shifting (DATE type has no timezone)
          let eventDate: Date | undefined = undefined;
          const eventDateStr = (item as any).Event_date || (item as any).event_date;
          if (eventDateStr) {
            // Parse YYYY-MM-DD string in local timezone (not UTC) to avoid date shifting
            // DATE type has no time component, so we parse as local date
            const [year, month, day] = eventDateStr.split('-').map(Number);
            if (year && month && day) {
              const parsedDate = new Date(year, month - 1, day); // month is 0-indexed
              if (!isNaN(parsedDate.getTime())) {
                eventDate = parsedDate;
              }
            }
          }
          
          return {
            review: {
              id: item.id,
              user_id: item.user_id,
              event_id: item.event_id,
              artist_id: item.artist_id,
              venue_id: item.venue_id,
              rating: item.rating,
              rank_order: (item as any).rank_order,
              review_type: item.review_type,
              review_text: item.review_text,
              photos: item.photos,
              videos: item.videos,
              setlist: item.setlist,
              mood_tags: item.mood_tags,
              genre_tags: item.genre_tags,
              context_tags: item.context_tags,
              artist_rating: item.artist_rating,
              artist_performance_rating: item.artist_performance_rating,
              production_rating: item.production_rating,
              venue_rating: item.venue_rating,
              location_rating: item.location_rating,
              value_rating: item.value_rating,
              artist_performance_feedback: item.artist_performance_feedback,
              production_feedback: item.production_feedback,
              venue_feedback: item.venue_feedback,
              location_feedback: item.location_feedback,
              value_feedback: item.value_feedback,
              Event_date: eventDate, // Store as Date object
              ticket_price_paid: item.ticket_price_paid,
              created_at: item.created_at,
              updated_at: item.updated_at,
              likes_count: item.likes_count,
              comments_count: item.comments_count,
              shares_count: item.shares_count,
              is_public: item.is_public,
              was_there: item.was_there,
              attendees: item.attendees,
              met_on_synth: item.met_on_synth,
            },
            event: event
          };
        }),
        total: Array.isArray(data) ? data.length : 0
      };
      
      console.log('🔍 ReviewService: Processed result:', result);
      return result;
    } catch (error) {
      console.error('❌ ReviewService: Error getting user review history:', error);
      throw new Error(`Failed to get user review history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a review by review ID
   */
  static async deleteEventReview(userId: string, reviewId: string): Promise<void> {
    try {
      console.log('🗑️ Deleting review:', { userId, reviewId });

      // Best-effort cleanup of derived thumbnail (ignore failures, do not block delete).
      try {
        const { error: thumbRemoveError } = await storageService.removeReviewThumbnail(reviewId);
        if (thumbRemoveError) {
          console.warn('⚠️ ReviewService: Failed to remove derived thumbnail (non-fatal):', {
            code: (thumbRemoveError as any)?.statusCode ?? (thumbRemoveError as any)?.code,
            message: (thumbRemoveError as any)?.message,
          });
        }
      } catch (err: any) {
        console.warn('⚠️ ReviewService: Thumbnail removal threw (non-fatal):', err?.message ?? String(err));
      }

      const { error } = await supabase
        .from('reviews')
        .delete()
        .eq('id', reviewId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting review:', error);
        throw error;
      }
      console.log('✅ Review deleted successfully');
    } catch (error) {
      console.error('Error deleting __event review:', error);
      throw new Error(`Failed to delete event review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Like a review
   */
  static async likeReview(userId: string, reviewId: string): Promise<ReviewLike> {
    console.log('🔍 ReviewService: likeReview called', { userId, reviewId });
    
    try {
      // Get or create entity for this review (use RPC function which handles creation)
      const { data: entityId, error: entityError } = await supabase.rpc('get_or_create_entity', {
        p_entity_type: 'review',
        p_entity_uuid: reviewId,
        p_entity_text_id: null,
      });

      if (entityError) throw entityError;

      // Check if user already liked this review
      console.log('🔍 ReviewService: Checking for existing like...');
      const { data: existingLike, error: checkError } = await supabase
        .from('engagements')
        .select('id')
        .eq('user_id', userId)
        .eq('entity_id', entityId)
        .eq('engagement_type', 'like')
        .maybeSingle();

      console.log('🔍 ReviewService: Existing like check result:', { existingLike, checkError });

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('❌ ReviewService: Error checking existing like:', checkError);
        throw checkError;
      }

      if (existingLike) {
        console.log('✅ ReviewService: User already liked this review, fetching full like record...');
        // Fetch the full like record to return complete ReviewLike object
        const { data: fullLike, error: fetchError } = await supabase
          .from('engagements')
          .select('*')
          .eq('user_id', userId)
          .eq('entity_id', entityId)
          .eq('engagement_type', 'like')
          .single();
        
        if (fetchError || !fullLike) {
          console.error('❌ ReviewService: Error fetching existing like:', fetchError);
          throw fetchError || new Error('Failed to fetch existing like');
        }
        
        // Transform engagements table result to ReviewLike interface
        return {
          id: fullLike.id,
          user_id: fullLike.user_id,
          review_id: reviewId, // Add review_id for ReviewLike interface compatibility
          created_at: fullLike.created_at,
        } as ReviewLike;
      }

      console.log('🔍 ReviewService: Inserting new like...');
      const { data, error } = await supabase
        .from('engagements')
        .insert({
          user_id: userId,
          entity_id: entityId, // FK to entities.id (replaces entity_type + entity_id)
          engagement_type: 'like'
        })
        .select()
        .single();

      console.log('🔍 ReviewService: Insert result:', { data, error });

      if (error) {
        console.error('❌ ReviewService: Error inserting like:', error);
        // Handle duplicate key error gracefully
        if (error.code === '23505') {
          console.log('🔍 ReviewService: Duplicate key error, fetching existing like...');
          // Try to get the existing like (entityId already available from above)
          const { data: existing, error: fetchError } = await supabase
            .from('engagements')
            .select('*')
            .eq('user_id', userId)
            .eq('entity_id', entityId)
            .eq('engagement_type', 'like')
            .single();
          
          if (fetchError || !existing) {
            console.error('❌ ReviewService: Error fetching existing like after duplicate key error:', fetchError);
            throw error; // Re-throw original error if fetch fails
          }
          
          console.log('✅ ReviewService: Found existing like after duplicate error:', existing);
          
          // Transform engagements table result to ReviewLike interface
          return {
            id: existing.id,
            user_id: existing.user_id,
            review_id: reviewId, // Add review_id for ReviewLike interface compatibility
            created_at: existing.created_at,
          } as ReviewLike;
        }
        throw error;
      }

      console.log('✅ ReviewService: Like inserted successfully:', data);
      
      // Transform engagements table result to ReviewLike interface (add review_id for compatibility)
      return {
        id: data.id,
        user_id: data.user_id,
        review_id: reviewId, // Add review_id field required by ReviewLike interface
        created_at: data.created_at,
      } as ReviewLike;
    } catch (error) {
      console.error('❌ ReviewService: Error liking review:', error);
      throw new Error(`Failed to like review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Unlike a review
   */
  static async unlikeReview(userId: string, reviewId: string): Promise<void> {
    try {
      // Get entity_id for this review
      const { data: entityData, error: entityError } = await supabase
        .from('entities')
        .select('id')
        .eq('entity_type', 'review')
        .eq('entity_uuid', reviewId)
        .single();

      if (entityError && (entityError as any).code !== 'PGRST116') {
        throw entityError;
      }

      if (!entityData?.id) {
        // Entity not found, nothing to unlike - return silently
        return;
      }

      const { error } = await supabase
        .from('engagements')
        .delete()
        .eq('user_id', userId)
        .eq('entity_id', entityData.id)
        .eq('engagement_type', 'like');

      if (error) throw error;
    } catch (error) {
      console.error('Error unliking review:', error);
      throw new Error(`Failed to unlike review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add a comment to a review
   */
  static async addComment(
    userId: string, 
    reviewId: string, 
    commentText: string, 
    parentCommentId?: string
  ): Promise<ReviewComment> {
    try {
      // Get or create entity for this review
      const { data: entityId, error: entityError } = await supabase.rpc('get_or_create_entity', {
        p_entity_type: 'review',
        p_entity_uuid: reviewId,
        p_entity_text_id: null,
      });

      if (entityError) throw entityError;

      const { data, error } = await supabase
        .from('comments')
        .insert({
          user_id: userId,
          entity_id: entityId, // FK to entities.id (replaces entity_type + entity_id)
          comment_text: commentText,
          parent_comment_id: parentCommentId
        })
        .select()
        .single();

      if (error) throw error;

      // Update comments count
      await this.updateReviewCounts(reviewId, 'comments', 1);

      // Transform unified comments table result to ReviewComment interface
      // ReviewComment was from old review_comments table, now we use unified comments
      // Map the data to match the expected ReviewComment structure
      return {
        id: data.id,
        user_id: data.user_id,
        review_id: reviewId, // Add review_id for ReviewComment compatibility
        comment_text: data.comment_text,
        parent_comment_id: data.parent_comment_id,
        created_at: data.created_at,
        updated_at: data.updated_at,
        likes_count: data.likes_count || 0,
      } as ReviewComment;
    } catch (error) {
      console.error('Error adding comment:', error);
      throw new Error(`Failed to add comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get comments for a review
   */
  static async getReviewComments(reviewId: string): Promise<CommentWithUser[]> {
    try {
      // Get entity_id for this review
      const { data: entityData, error: entityError } = await supabase
        .from('entities')
        .select('id')
        .eq('entity_type', 'review')
        .eq('entity_uuid', reviewId)
        .single();

      if (entityError && (entityError as any).code !== 'PGRST116') {
        throw entityError;
      }

      if (!entityData?.id) {
        return []; // Entity not found, return empty array
      }

      // First, get the comments
      const { data: comments, error: commentsError } = await supabase
        .from('comments')
        .select('*')
        .eq('entity_id', entityData.id)
        .order('created_at', { ascending: true });

      if (commentsError) throw commentsError;

      if (!comments || comments.length === 0) {
        return [];
      }

      // Get unique user IDs from comments
      const userIds = [...new Set(comments.map(comment => comment.user_id))];

      // Fetch user profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('users')
        .select('id, name, avatar_url, user_id')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      // Create a map of user_id to profile data
      const profileMap = new Map();
      profiles?.forEach(profile => {
        profileMap.set(profile.user_id, {
          id: profile.id,
          name: profile.name,
          avatar_url: profile.avatar_url
        });
      });

      // Combine comments with user data
      const commentsWithUsers: CommentWithUser[] = comments.map(comment => ({
        ...comment,
        user: profileMap.get(comment.user_id) || {
          id: comment.user_id,
          name: 'Unknown User',
          avatar_url: undefined
        }
      }));

      return commentsWithUsers;
    } catch (error) {
      console.error('Error getting review comments:', error);
      throw new Error(`Failed to get review comments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Share a review
   */
  static async shareReview(
    userId: string, 
    reviewId: string, 
    platform?: string
  ): Promise<ReviewShare> {
    try {
      // Get or create entity for this review
      const { data: entityId, error: entityError } = await supabase.rpc('get_or_create_entity', {
        p_entity_type: 'review',
        p_entity_uuid: reviewId,
        p_entity_text_id: null,
      });

      if (entityError) throw entityError;

      const { data, error } = await supabase
        .from('engagements')
        .insert({
          user_id: userId,
          entity_id: entityId, // FK to entities.id (replaces entity_type + entity_id)
          engagement_type: 'share',
          engagement_value: platform || 'unknown',
          metadata: { review_id: reviewId, share_platform: platform }
        })
        .select()
        .single();

      if (error) throw error;

      // Update shares count
      await this.updateReviewCounts(reviewId, 'shares', 1);

      return data;
    } catch (error) {
      console.error('Error sharing review:', error);
      throw new Error(`Failed to share review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get public reviews with profiles (using the view)
   */
  static async getPublicReviewsWithProfiles(
    eventId?: string,
    venueId?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    reviews: PublicReviewWithProfile[];
    total: number;
  }> {
    try {
      let query = (supabase as any)
        .from('reviews')
        .select(`
          *,
          users:users!reviews_user_id_fkey (
            user_id,
            name,
            avatar_url,
            account_type
          )
          events_with_artist_venue:event_id (
            id,
            title,
            artist_name_normalized,
            venue_name_normalized,
            event_date
          )
        `, { count: 'exact' })
        .eq('is_public', true)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (eventId) {
        query = query.eq('event_id', eventId);
      }

      if (venueId) {
        query = query.eq('venue_id', venueId);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      // Fetch verification data for all reviewer user IDs (verification moved to user_verifications table)
      const reviewerUserIds = (data || []).map((r: any) => r.user_id).filter(Boolean);
      const verificationMap = new Map<string, boolean>();
      
      if (reviewerUserIds.length > 0) {
        const { data: verifications } = await supabase
          .from('user_verifications')
          .select('user_id, verified')
          .in('user_id', reviewerUserIds);
        
        verifications?.forEach((v: any) => {
          verificationMap.set(v.user_id, v.verified || false);
        });
      }

      // Transform the data to match the expected format
      const transformedReviews: PublicReviewWithProfile[] = (data || []).map((review: any) => ({
        ...review,
        reviewer_name: review.users?.name,
        reviewer_avatar: review.users?.avatar_url,
        reviewer_verified: verificationMap.get(review.user_id) || false,
        reviewer_account_type: review.users?.account_type,
        event_title: review.events_with_artist_venue?.title || review.events?.title,
        artist_name: (review.events_with_artist_venue as any)?.artist_name_normalized || review.events?.artist_name,
        venue_name: (review.events_with_artist_venue as any)?.venue_name_normalized || review.events?.venue_name,
        event_date: review.events_with_artist_venue?.event_date || review.events?.event_date,
      }));

      return {
        reviews: transformedReviews,
        total: count || 0
      };
    } catch (error) {
      console.error('Error getting public reviews with profiles:', error);
      throw new Error(`Failed to get public reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update review counts (likes, comments, shares)
   */
  private static async updateReviewCounts(
    reviewId: string, 
    type: 'likes' | 'comments' | 'shares', 
    delta: number
  ): Promise<void> {
    try {
      const column = `${type}_count`;
      console.log('🔍 ReviewService: Updating review counts', { reviewId, type, delta, column });
      
      // Use direct read-modify-write approach since RPC function may not exist
      const { data: current, error: fetchError } = await supabase
        .from('reviews')
        .select('likes_count, comments_count, shares_count')
        .eq('id', reviewId)
        .single();
      
      if (fetchError) {
        console.error('❌ ReviewService: Error fetching current counts:', fetchError);
        return;
      }
      
      const currentCount = current?.[column] || 0;
      const nextCount = Math.max(0, currentCount + delta);
      
      console.log('🔍 ReviewService: Updating count', { currentCount, nextCount });
      
      const { error: updateError } = await supabase
        .from('reviews')
        .update({ [column]: nextCount })
        .eq('id', reviewId);
      
      if (updateError) {
        console.error('❌ ReviewService: Error updating count:', updateError);
      } else {
        console.log('✅ ReviewService: Successfully updated count');
      }
    } catch (error) {
      console.error(`❌ ReviewService: Error updating ${type} count:`, error);
      // Don't throw here as it's not critical
    }
  }

  /**
   * Get engagement counts and like status for a review
   */
  static async getReviewEngagement(
    reviewId: string,
    userId?: string
  ): Promise<{ likes_count: number; comments_count: number; shares_count: number; is_liked_by_user: boolean } | null> {
    try {
      // Try using the new RPC function first
      const { data: rpcData, error: rpcError } = await (supabase as any)
        .rpc('get_review_engagement', {
          review_id_param: reviewId,
          user_id_param: userId || null
        });

      if (!rpcError && rpcData && Array.isArray(rpcData) && rpcData.length > 0 && typeof rpcData[0] === 'object') {
        return rpcData[0] as { likes_count: number; comments_count: number; shares_count: number; is_liked_by_user: boolean };
      }

      // Fallback to direct queries
      console.log('🔍 ReviewService: RPC failed, using direct queries');
      
      // Get review counts
      const { data: reviewData, error: reviewError } = await supabase
        .from('reviews')
        .select('likes_count, comments_count, shares_count')
        .eq('id', reviewId)
        .single();
      
      if (reviewError) {
        console.error('❌ ReviewService: Error fetching review data:', reviewError);
        throw reviewError;
      }
      
      // Check if user has liked this review
      let isLiked = false;
      if (userId) {
        // Get entity_id for this review first
        const { data: entityData, error: entityError } = await supabase
          .from('entities')
          .select('id')
          .eq('entity_type', 'review')
          .eq('entity_uuid', reviewId)
          .single();
        
        if (entityError) {
          // Only ignore "not found" errors (PGRST116), log others
          if ((entityError as any).code !== 'PGRST116') {
            console.error('Error fetching entity for review engagement check:', entityError);
          }
          // Return null if entity lookup fails (isLiked will remain false)
          // Continue to return review counts even if like check fails
        }
        
        if (entityData?.id) {
          const { data: likeData, error: likeError } = await supabase
            .from('engagements')
            .select('id')
            .eq('entity_id', entityData.id)
            .eq('engagement_type', 'like')
            .eq('user_id', userId)
            .maybeSingle();
          
          if (likeError) {
            console.error('❌ ReviewService: Error checking like status:', likeError);
          } else {
            isLiked = !!likeData;
          }
        }
      }
      
      return {
        likes_count: reviewData?.likes_count || 0,
        comments_count: reviewData?.comments_count || 0,
        shares_count: reviewData?.shares_count || 0,
        is_liked_by_user: isLiked,
      };
    } catch (e) {
      console.warn('ReviewService.getReviewEngagement failed', e);
      return null;
    }
  }

  /**
   * Get real-time engagement data for multiple reviews
   */
  static async getReviewsEngagement(
    reviewIds: string[],
    userId?: string
  ): Promise<Record<string, { likes_count: number; comments_count: number; shares_count: number; is_liked_by_user: boolean }>> {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          id, 
          likes_count, 
          comments_count, 
          shares_count,
          review_likes!left(id, user_id)
        `)
        .in('id', reviewIds);

      if (error) throw error;

      const result: Record<string, any> = {};
      
      data?.forEach((review: any) => {
        const likes = Array.isArray(review.review_likes) ? review.review_likes : [];
        const isLiked = userId ? likes.some((l: any) => l.user_id === userId) : false;
        
        result[review.id] = {
          likes_count: review.likes_count || 0,
          comments_count: review.comments_count || 0,
          shares_count: review.shares_count || 0,
          is_liked_by_user: isLiked,
        };
      });

      return result;
    } catch (e) {
      console.warn('ReviewService.getReviewsEngagement failed', e);
      return {};
    }
  }

  /**
   * Get popular tags for filtering
   */
  static async getPopularTags(type: 'mood' | 'genre' | 'context' | 'venue' | 'artist'): Promise<Array<{ tag: string; count: number }>> {
    try {
      const column = `${type}_tags`;
      const { data, error } = await supabase
        .from('reviews')
        .select(column)
        .not(column, 'is', null)
        .eq('is_public', true);

      if (error) throw error;

      // Count tag occurrences
      const tagCounts: Record<string, number> = {};
      data?.forEach(review => {
        const tags = review[column] as string[] || [];
        tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      });

      return Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
    } catch (error) {
      console.error('Error getting popular tags:', error);
      return [];
    }
  }

  /**
   * Get venue statistics
   */
  static async getVenueStats(venueId: string): Promise<VenueStats> {
    try {
      // Use JamBase venue_id instead of UUID
      // First try to resolve JamBase ID if venueId is a UUID
      let jambaseVenueId = venueId;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(venueId);
      
      if (isUUID) {
        // Look up JamBase ID from venues table (using helper view for normalized schema)
        const { data: venue } = await supabase
          .from('venues_with_external_ids')
          .select('jambase_venue_id')
          .eq('id', venueId)
          .maybeSingle();
        
        if (venue?.jambase_venue_id) {
          jambaseVenueId = venue.jambase_venue_id;
        }
      }
      
      const { data, error } = await (supabase as any)
        .rpc('get_venue_stats', { venue_jambase_id: jambaseVenueId });

      if (error) throw error;

      return data[0] || {
        total_reviews: 0,
        average_venue_rating: 0,
        average_artist_rating: 0,
        average_overall_rating: 0,
        rating_distribution: {
          '1_star': 0,
          '2_star': 0,
          '3_star': 0,
          '4_star': 0,
          '5_star': 0,
        }
      };
    } catch (error) {
      console.error('Error getting venue stats:', error);
      throw new Error(`Failed to get venue stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get popular venue tags
   */
  static async getPopularVenueTags(venueId?: string): Promise<TagCount[]> {
    try {
      // Use JamBase venue_id instead of UUID
      let jambaseVenueId = venueId;
      if (venueId) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(venueId);
        
        if (isUUID) {
          const { data: venue } = await supabase
            .from('venues_with_external_ids')
            .select('jambase_venue_id')
            .eq('id', venueId)
            .maybeSingle();
          
          if (venue?.jambase_venue_id) {
            jambaseVenueId = venue.jambase_venue_id;
          }
        }
      }
      
      const { data, error } = await (supabase as any)
        .rpc('get_popular_venue_tags', jambaseVenueId ? { venue_jambase_id: jambaseVenueId } : {});

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting popular venue tags:', error);
      return [];
    }
  }

  /**
   * Get reviews for a specific venue
   */
  static async getVenueReviews(
    venueId: string,
    userId?: string
  ): Promise<{
    reviews: ReviewWithEngagement[];
    averageRating: number;
    totalReviews: number;
  }> {
    try {
      // Get reviews with user engagement data
      const { data: reviews, error } = await (supabase as any)
        .from('reviews')
        .select(`
          *,
          review_likes!left(id, user_id)
        `)
        .eq('venue_id', venueId)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Check if current user has liked any of these reviews
      let userLikes: string[] = [];
      if (userId && reviews && reviews.length > 0) {
        // First, get entity_ids for all review IDs
        const reviewIds = reviews.map((r: any) => r.id);
        const { data: entities, error: entitiesError } = await supabase
          .from('entities')
          .select('id, entity_uuid')
          .eq('entity_type', 'review')
          .in('entity_uuid', reviewIds);
        
        if (entitiesError) {
          console.error('Error fetching entities for review likes:', entitiesError);
          // Continue with empty likes array if entity lookup fails
        } else if (entities && entities.length > 0) {
          const entityIds = entities.map(e => e.id);
          // Now query engagements using entity_ids (FK to entities.id)
          const { data: likes } = await supabase
            .from('engagements')
            .select('entity_id')
            .eq('user_id', userId)
            .eq('engagement_type', 'like')
            .in('entity_id', entityIds);
          
          // Map entity_ids back to review IDs for matching
          const entityIdToReviewId = new Map(entities.map(e => [e.id, e.entity_uuid]));
          userLikes = (likes?.map(l => entityIdToReviewId.get(l.entity_id)).filter(Boolean) as string[]) || [];
        }
      }

      // Process reviews with engagement data
      const processedReviews: ReviewWithEngagement[] = (((reviews as any[]) || [])).map((review: any) => ({
        ...review,
        is_liked_by_user: userLikes.includes(review.id),
        user_like_id: userLikes.includes(review.id)
          ? review.review_likes?.find((l: any) => l.user_id === userId)?.id
          : undefined,
        review_type: review.review_type,
        is_public: review.is_public
      })) as unknown as ReviewWithEngagement[];

      const totalReviews = processedReviews.length;
      const averageRating = totalReviews > 0 
        ? processedReviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews 
        : 0;

      return {
        reviews: processedReviews,
        averageRating,
        totalReviews
      };
    } catch (error) {
      console.error('Error getting venue reviews:', error);
      throw new Error(`Failed to get venue reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get reviews for a specific artist
   */
  static async getArtistReviews(
    artistId: string,
    userId?: string
  ): Promise<{
    reviews: ReviewWithEngagement[];
    averageRating: number;
    totalReviews: number;
  }> {
    try {
      // Get reviews with user engagement data
      const { data: reviews, error } = await (supabase as any)
        .from('reviews')
        .select(`
          *,
          review_likes!left(id, user_id)
        `)
        .eq('artist_id', artistId)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Check if current user has liked any of these reviews
      let userLikes: string[] = [];
      if (userId && reviews && reviews.length > 0) {
        // First, get entity_ids for all review IDs
        const reviewIds = reviews.map((r: any) => r.id);
        const { data: entities, error: entitiesError } = await supabase
          .from('entities')
          .select('id, entity_uuid')
          .eq('entity_type', 'review')
          .in('entity_uuid', reviewIds);
        
        if (entitiesError) {
          console.error('Error fetching entities for review likes:', entitiesError);
          // Continue with empty likes array if entity lookup fails
        } else if (entities && entities.length > 0) {
          const entityIds = entities.map(e => e.id);
          // Now query engagements using entity_ids (FK to entities.id)
          const { data: likes } = await supabase
            .from('engagements')
            .select('entity_id')
            .eq('user_id', userId)
            .eq('engagement_type', 'like')
            .in('entity_id', entityIds);
          
          // Map entity_ids back to review IDs for matching
          const entityIdToReviewId = new Map(entities.map(e => [e.id, e.entity_uuid]));
          userLikes = (likes?.map(l => entityIdToReviewId.get(l.entity_id)).filter(Boolean) as string[]) || [];
        }
      }

      // Process reviews with engagement data
      const processedReviews: ReviewWithEngagement[] = (((reviews as any[]) || [])).map((review: any) => ({
        ...review,
        is_liked_by_user: userLikes.includes(review.id),
        user_like_id: userLikes.includes(review.id)
          ? review.review_likes?.find((l: any) => l.user_id === userId)?.id
          : undefined,
        review_type: review.review_type,
        is_public: review.is_public
      })) as unknown as ReviewWithEngagement[];

      const totalReviews = processedReviews.length;
      const averageRating = totalReviews > 0 
        ? processedReviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews 
        : 0;

      return {
        reviews: processedReviews,
        averageRating,
        totalReviews
      };
    } catch (error) {
      console.error('Error getting artist reviews:', error);
      throw new Error(`Failed to get artist reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get artist statistics
   */
  static async getArtistStats(artistId: string): Promise<{
    total_reviews: number;
    average_rating: number;
    rating_distribution: {
      '1_star': number;
      '2_star': number;
      '3_star': number;
      '4_star': number;
      '5_star': number;
    };
  }> {
    try {
      // Use JamBase artist_id instead of UUID
      // First try to resolve JamBase ID if artistId is a UUID
      let jambaseArtistId = artistId;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(artistId);
      
      if (isUUID) {
        // Look up JamBase ID from artists table
        const { data: artist } = await supabase
          .from('artists')
          .select('jambase_artist_id')
          .eq('id', artistId)
          .single();
        
        if (artist?.jambase_artist_id) {
          jambaseArtistId = artist.jambase_artist_id;
        }
      }
      
      const { data, error } = await (supabase as any)
        .rpc('get_artist_stats', { artist_jambase_id: jambaseArtistId });

      if (error) throw error;

      return data[0] || {
        total_reviews: 0,
        average_rating: 0,
        rating_distribution: {
          '1_star': 0,
          '2_star': 0,
          '3_star': 0,
          '4_star': 0,
          '5_star': 0,
        }
      };
    } catch (error) {
      console.error('Error getting artist stats:', error);
      throw new Error(`Failed to get artist stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
