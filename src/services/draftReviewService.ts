import { supabase } from '@/integrations/supabase/client';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_REGEX.test(value);

const sanitizeEntitySelection = (entity: any | undefined | null) => {
  if (!entity || typeof entity !== 'object') return entity;
  const sanitized = { ...entity };

  if ('id' in sanitized && !isValidUuid(sanitized.id)) {
    if (typeof sanitized.id === 'string') {
      sanitized.jambase_id = sanitized.jambase_id ?? sanitized.id;
    }
    sanitized.id = null;
  }

  if ('identifier' in sanitized && !isValidUuid(sanitized.identifier)) {
    sanitized.jambase_identifier = sanitized.jambase_identifier ?? sanitized.identifier;
  }

  return sanitized;
};

export interface DraftReviewData {
  selectedArtist?: any;
  selectedVenue?: any;
  eventDate?: string;
  performanceRating?: number;
  venueRating?: number;
  overallExperienceRating?: number;
  reviewText?: string;
  photos?: string[];
  videos?: string[];
  moodTags?: string[];
  genreTags?: string[];
  contextTags?: string[];
  reactionEmoji?: string;
  selectedSetlist?: any;
  customSetlists?: any;
}

export interface DraftReview {
  id: string;
  event_id: string;
  draft_data: DraftReviewData;
  last_saved_at: string;
  event_title?: string;
  artist_name?: string;
  venue_name?: string;
  event_date?: string;
}

export class DraftReviewService {
  private static async ensureEventArtistUuid(
    eventId: string,
    draftData: DraftReviewData
  ): Promise<string | undefined> {
    try {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('id, artist_id, artist_name')
        .eq('id', eventId)
        .maybeSingle();

      if (eventError) {
        console.warn('⚠️ DraftReviewService: Failed to fetch event for artist resolution', eventError);
      }

      // Prioritize JamBase artist_id for matching
      if (eventData?.artist_id) {
        // If artist_id is a JamBase ID (not UUID), use it directly
        const artistId = eventData.artist_id.trim();
        if (!isValidUuid(artistId)) {
          // It's a JamBase ID, resolve to UUID for foreign key if needed (using helper view)
          const { data: artist } = await supabase
            .from('artists_with_external_ids')
            .select('id')
            .eq('jambase_artist_id', artistId)
            .maybeSingle();
          
          if (artist?.id) {
            return artist.id;
          }
        } else {
          // It's already a UUID
          return artistId;
        }
      }

      const selectedArtist = draftData.selectedArtist || null;
      let artistProfileId: string | undefined;
      let jambaseArtistId: string | undefined;

      if (selectedArtist && typeof selectedArtist === 'object') {
        const candidateId = selectedArtist.id;
        if (isValidUuid(candidateId)) {
          artistProfileId = candidateId;
        }

        jambaseArtistId =
          jambaseArtistId ||
          selectedArtist.jambase_id ||
          (typeof candidateId === 'string' && !isValidUuid(candidateId) ? candidateId : undefined) ||
          (typeof selectedArtist.identifier === 'string'
            ? selectedArtist.identifier.split?.(':')?.[1]
            : undefined);
      }

      if (!jambaseArtistId && eventData?.artist_id) {
        const eventArtistId = eventData.artist_id.trim();
        if (isValidUuid(eventArtistId)) {
          artistProfileId = eventArtistId;
        } else if (eventArtistId) {
          jambaseArtistId = eventArtistId;
        }
      }

      if (!artistProfileId && jambaseArtistId) {
        // Use helper view for normalized schema
        let lookup = await (supabase as any)
          .from('artists_with_external_ids')
          .select('id')
          .eq('jambase_artist_id', jambaseArtistId)
          .limit(1);

        if (!lookup.error && Array.isArray(lookup.data) && lookup.data.length > 0) {
          artistProfileId = lookup.data[0].id;
        } else if (!lookup.error) {
          try {
            const { UnifiedArtistSearchService } = await import('@/services/unifiedArtistSearchService');
            await UnifiedArtistSearchService.searchArtists(
              selectedArtist?.name || eventData?.artist_name || '',
              20,
              false
            );

            lookup = await (supabase as any)
              .from('artists_with_external_ids')
              .select('id')
              .eq('jambase_artist_id', jambaseArtistId)
              .limit(1);

            if (!lookup.error && Array.isArray(lookup.data) && lookup.data.length > 0) {
              artistProfileId = lookup.data[0].id;
            }
          } catch (searchError) {
            console.warn('⚠️ DraftReviewService: Artist search retry failed', searchError);
          }
        }
      }

      if (artistProfileId && isValidUuid(artistProfileId)) {
        await supabase
          .from('events')
          .update({ artist_uuid: artistProfileId })
          .eq('id', eventId);
        return artistProfileId;
      }
    } catch (error) {
      console.warn('⚠️ DraftReviewService: ensureEventArtistUuid encountered error', error);
    }

    return undefined;
  }

  /**
   * Auto-save draft review data
   */
  static async saveDraft(
    userId: string,
    eventId: string,
    draftData: DraftReviewData
  ): Promise<string | null> {
    try {
      console.log('💾 Saving draft:', { userId, eventId, draftData });
      
      // Validate inputs
      if (!userId || !eventId) {
        console.error('❌ Missing required parameters:', { userId, eventId });
        return null;
      }

      // Check if eventId is a valid UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(eventId)) {
        console.error('❌ Event ID is not a valid UUID:', eventId);
        return null;
      }

      // CRITICAL: Check if a published review already exists for this event
      // If it does, don't create/update a draft - the review is already complete
      const { data: existingPublishedReview, error: checkError } = await supabase
        .from('reviews')
        .select('id, is_draft')
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .eq('is_draft', false)
        .maybeSingle();
      
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('❌ Error checking for existing published review:', checkError);
        // Continue anyway - don't block draft saving on check error
      }
      
      if (existingPublishedReview && !existingPublishedReview.is_draft) {
        console.log('🚫 Draft save blocked: Published review already exists for this event');
        console.log('   Published review ID:', existingPublishedReview.id);
        // Don't save draft if review is already published
        return null;
      }

      const resolvedArtistUuid = await this.ensureEventArtistUuid(eventId, draftData);

      const enrichedDraftData = resolvedArtistUuid
        ? {
            ...draftData,
            selectedArtist: draftData.selectedArtist
              ? { ...draftData.selectedArtist, id: resolvedArtistUuid }
              : draftData.selectedArtist,
          }
        : draftData;

      const payload = {
        ...enrichedDraftData,
        selectedArtist: sanitizeEntitySelection(enrichedDraftData.selectedArtist),
        selectedVenue: sanitizeEntitySelection(enrichedDraftData.selectedVenue),
      };

      const { data, error } = await (supabase as any).rpc('save_review_draft', {
        p_user_id: userId,
        p_event_id: eventId,
        p_draft_data: payload
      });

      if (error) {
        console.error('❌ Error saving draft:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        return null;
      }

      console.log('✅ Draft saved successfully:', data);
      return data;
    } catch (error) {
      console.error('❌ Exception saving draft:', error);
      return null;
    }
  }

  /**
   * Get user's draft reviews
   */
  static async getUserDrafts(userId: string): Promise<DraftReview[]> {
    try {
      const { data, error } = await (supabase as any).rpc('get_user_draft_reviews', {
        p_user_id: userId
      });

      if (error) {
        console.error('Error fetching drafts:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching drafts:', error);
      return [];
    }
  }

  /**
   * Publish a draft review (convert to final review)
   */
  static async publishDraft(
    draftId: string,
    finalData: DraftReviewData
  ): Promise<string | null> {
    try {
      const { data, error } = await (supabase as any).rpc('publish_review_draft', {
        p_draft_id: draftId,
        p_final_data: finalData
      });

      if (error) {
        console.error('Error publishing draft:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error publishing draft:', error);
      return null;
    }
  }

  /**
   * Delete a draft review
   */
  static async deleteDraft(draftId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await (supabase as any).rpc('delete_review_draft', {
        p_draft_id: draftId,
        p_user_id: userId
      });

      if (error) {
        console.error('Error deleting draft:', error);
        return false;
      }

      return data;
    } catch (error) {
      console.error('Error deleting draft:', error);
      return false;
    }
  }

  /**
   * Load draft data for a specific event
   */
  static async loadDraftForEvent(
    userId: string,
    eventId: string
  ): Promise<DraftReviewData | null> {
    try {
      const { data, error } = await (supabase as any)
        .from('reviews')
        .select('draft_data')
        .eq('user_id', userId)
        .eq('entity_type', 'event')
        .eq('entity_id', eventId)
        .eq('is_draft', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No draft found
          return null;
        }
        console.error('Error loading draft:', error);
        return null;
      }

      return data?.draft_data || null;
    } catch (error) {
      console.error('Error loading draft:', error);
      return null;
    }
  }

  /**
   * Check if user has a draft for a specific event
   */
  static async hasDraftForEvent(
    userId: string,
    eventId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('id')
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .eq('is_draft', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return false;
        }
        console.error('Error checking draft:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking draft:', error);
      return false;
    }
  }
}
