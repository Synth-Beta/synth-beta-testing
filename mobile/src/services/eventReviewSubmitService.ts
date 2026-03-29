import { supabase } from '../integrations/supabase/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidUuid = (value?: string | null): value is string =>
  typeof value === 'string' && UUID_REGEX.test(value);

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

export interface ReviewData {
  rating?: number;
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
  artist_rating?: number;
  review_type: 'event' | 'venue' | 'artist';
  review_text?: string;
  photos?: string[];
  videos?: string[];
  attendees?: Array<{ type: 'user'; user_id: string; name: string; avatar_url?: string } | { type: 'phone'; phone: string; name?: string }>;
  met_on_synth?: boolean;
  is_public?: boolean;
  setlist?: any;
  custom_setlist?: ReviewCustomSetlistPayload[];
  reaction_emoji?: string;
  Event_date?: Date;
  venue_tags?: string[];
  artist_tags?: string[];
}

export interface UserReview {
  id: string;
  user_id: string;
  event_id?: string;
  venue_id?: string;
  rating: number;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export class EventReviewSubmitService {
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
      if (!EventReviewSubmitService.isPlaceholderEntityImage((data as any)?.image_url)) return;
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
      if (!EventReviewSubmitService.isPlaceholderEntityImage((data as any)?.image_url)) return;
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
          await EventReviewSubmitService.promoteReviewPhotoToEntityImage({
            artistId: (data as any)?.artist_id ?? normalizedArtistId,
            venueId: (data as any)?.venue_id ?? normalizedVenueId,
            photoUrl: Array.isArray((data as any)?.photos) ? (data as any).photos[0] : undefined,
            isPublic: (data as any)?.is_public,
          });

          const resolvedArtistId = (data as any)?.artist_id ?? (data as any)?.user_created_artist_id ?? normalizedArtistId ?? normalizedUserCreatedArtistId;
          EventReviewSubmitService.notifyTaggedFriendsInReview({
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
      await EventReviewSubmitService.promoteReviewPhotoToEntityImage({
        artistId: (data as any)?.artist_id ?? normalizedArtistId,
        venueId: (data as any)?.venue_id ?? normalizedVenueId, // catalog only for image promotion
        photoUrl: Array.isArray((data as any)?.photos) ? (data as any).photos[0] : undefined,
        isPublic: (data as any)?.is_public,
      });

      const resolvedArtistId = (data as any)?.artist_id ?? (data as any)?.user_created_artist_id ?? normalizedArtistId ?? normalizedUserCreatedArtistId;
      EventReviewSubmitService.notifyTaggedFriendsInReview({
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

  static async getPreviousVenueReview(
    userId: string,
    venueId: string | null | undefined,
    excludeReviewId?: string
  ): Promise<UserReview | null> {
    try {
      if (!venueId) return null;
      if (!isValidUuid(venueId)) return null;

      let query = supabase
        .from('reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('venue_id', venueId)
        .eq('is_draft', false)
        .order('created_at', { ascending: false });

      if (excludeReviewId && isValidUuid(excludeReviewId)) {
        query = query.neq('id', excludeReviewId);
      }

      const { data, error } = await query;

      if (error && error.code !== 'PGRST116') {
        return null;
      }

      if (!data || data.length === 0) return null;

      const reviewWithVenueData = data.find((review: any) => {
        const vr = review.venue_rating ?? review.venueRating;
        const lr = review.location_rating ?? review.locationRating;
        return (typeof vr === 'number' && vr > 0) || (typeof lr === 'number' && lr > 0);
      });

      return (reviewWithVenueData || data[0]) as UserReview;
    } catch {
      return null;
    }
  }
}
