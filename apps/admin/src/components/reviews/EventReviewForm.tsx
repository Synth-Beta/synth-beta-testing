import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import { useReviewForm } from '@/hooks/useReviewForm';
import { ReviewService, type ReviewData, type UserReview, type PublicReviewWithProfile } from '@/services/reviewService';
import { EventDetailsStep } from './ReviewFormSteps/EventDetailsStep';
import { RatingStep } from './ReviewFormSteps/RatingStep';
import { ReviewContentStep } from './ReviewFormSteps/ReviewContentStep';
import { PrivacySubmitStep } from './ReviewFormSteps/PrivacySubmitStep';
import { supabase } from '@/integrations/supabase/client';
import { trackInteraction } from '@/services/interactionTrackingService';
import { useAutoSave } from '@/hooks/useAutoSave';
import { DraftReviewService, DraftReviewData, DraftReview } from '@/services/draftReviewService';
import { DraftToggle } from './DraftToggle';

interface EventReviewFormProps {
  event: JamBaseEvent | PublicReviewWithProfile;
  userId: string;
  onSubmitted?: (review: UserReview) => void;
  onDeleted?: () => void;
  onClose?: () => void;
}

export function EventReviewForm({ event, userId, onSubmitted, onDeleted, onClose }: EventReviewFormProps) {
  const { toast } = useToast();
  const {
    formData,
    errors,
    isLoading,
    updateFormData,
    setLoading,
    resetForm,
    setFormData
  } = useReviewForm();

  const [existingReview, setExistingReview] = useState<UserReview | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [actualEventId, setActualEventId] = useState<string>(event.id);
  const [currentDraft, setCurrentDraft] = useState<DraftReview | null>(null);

  // Auto-save functionality (localStorage only - no database records)
  const { manualSave, loadDraft, clearDraft } = useAutoSave({
    userId,
    eventId: actualEventId,
    formData: formData as DraftReviewData,
    enabled: !existingReview, // Only auto-save if not editing existing review
    requireEventSelection: true, // Only auto-save when a specific event is selected
    onSave: (success) => {
      setIsSaving(false);
      if (success) {
        setLastSaveTime(new Date());
      }
    }
  });

  // Create event in database when artist and venue are selected (for new reviews)
  useEffect(() => {
    const createEventForDraft = async () => {
      console.log('🎯 Event creation check:', {
        eventId: event?.id,
        isNewReview: event?.id?.startsWith('new-review'),
        hasArtist: !!formData.selectedArtist,
        hasVenue: !!formData.selectedVenue,
        hasDate: !!formData.eventDate,
        currentActualEventId: actualEventId
      });
      
      // Only create event if it's a new review (starts with 'new-review')
      if (!event?.id?.startsWith('new-review')) {
        console.log('🚫 Not creating event: Not a new review');
        return;
      }
      
      // Only create if we have both artist and venue selected
      if (!formData.selectedArtist || !formData.selectedVenue || !formData.eventDate) {
        console.log('🚫 Not creating event: Missing required data');
        return;
      }
      
      // Don't create if we already have a valid event ID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(actualEventId)) {
        console.log('🚫 Not creating event: Already have valid event ID');
        return;
      }
      
      console.log('🎯 Creating event for draft save...');
      
      try {
        const eventDateTime = new Date(formData.eventDate + 'T20:00:00Z');
        const insertPayload: any = {
          title: `${formData.selectedArtist.name} at ${formData.selectedVenue.name}`,
          artist_name: formData.selectedArtist.name,
          venue_name: formData.selectedVenue.name,
          venue_id: formData.selectedVenue.is_from_database ? formData.selectedVenue.id : null,
          venue_city: formData.selectedVenue.address?.addressLocality || 'Unknown',
          venue_state: formData.selectedVenue.address?.addressRegion || 'Unknown',
          event_date: eventDateTime.toISOString(),
          description: `Concert by ${formData.selectedArtist.name} at ${formData.selectedVenue.name}`
        };
        
        const { data, error } = await (supabase as any)
          .from('jambase_events')
          .insert(insertPayload)
          .select()
          .single();
        
        if (error) {
          console.error('❌ Error creating event for draft:', error);
        } else if (data) {
          console.log('✅ Event created for draft:', data.id);
          setActualEventId(data.id);
        }
      } catch (error) {
        console.error('❌ Exception creating event for draft:', error);
      }
    };
    
    createEventForDraft();
  }, [formData.selectedArtist, formData.selectedVenue, formData.eventDate, event?.id, actualEventId]);

  useEffect(() => {
    const load = async () => {
      if (!event || !userId) return;
      
      // Helper to check if string is a valid UUID
      const isValidUUID = (str: string) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
      };
      
      try {
        // First check if we have an existing review ID (edit mode)
        const existingReviewId = (event as any)?.existing_review_id;
        let review = null;
        
        if (existingReviewId && isValidUUID(existingReviewId)) {
          // Edit mode: fetch review by ID
          const { data, error } = await (supabase as any)
            .from('user_reviews')
            .select('*')
            .eq('id', existingReviewId)
            .maybeSingle();
          if (data && !error) {
            review = data;
          }
        } else if (isValidUUID(event.id)) {
          // Create mode: only try to fetch by event ID if it's a valid UUID
          review = await ReviewService.getUserEventReview(userId, event.id);
        }

        // Load draft data from localStorage if no existing review
        if (!review) {
          // Try to load existing draft from localStorage
          const draftData = loadDraft(event.id);
          if (draftData) {
            console.log('📂 Loaded draft from localStorage for event:', event.id);
            setFormData(draftData as any);
          }
        }

        if (review) {
          setExistingReview(review);
          // Prefill form data from existing review
          setFormData({
            selectedArtist: null,
            selectedVenue: null,
            eventDate: (review.event_date || review.created_at || '').split('T')[0],
            performanceRating: review.performance_rating || review.rating,
            venueRating: review.venue_rating || review.venue_rating_new || review.rating,
            overallExperienceRating: review.overall_experience_rating || review.rating,
            rating: review.rating,
            reviewText: review.review_text || '',
            reactionEmoji: review.reaction_emoji || '',
            performanceReviewText: review.performance_review_text || '',
            venueReviewText: review.venue_review_text || '',
            overallExperienceReviewText: review.overall_experience_review_text || '',
            artistReviewText: '',
            photos: review.photos || [], // Load existing photos
            videos: review.videos || [], // Load existing videos
            customSetlist: (review as any).custom_setlist || [], // Load existing custom setlist
            isPublic: review.is_public,
            reviewType: review.review_type || 'event',
          });
          
          // Pre-populate selected artist and venue
          try {
            const approxArtist = (event as any)?.artist_name || (event as any)?.artist?.name || review.artist_name;
            const approxVenue = (event as any)?.venue_name || (event as any)?.venue?.name || review.venue_name;
            const approxVenueId = review.venue_id;
            const selectedArtist = approxArtist
              ? ({ id: (event as any)?.artist?.id || `manual-${approxArtist}`, name: approxArtist, is_from_database: false } as any)
              : null;
            const selectedVenue = approxVenue
              ? ({ id: approxVenueId || (event as any)?.venue?.id || `manual-${approxVenue}`, name: approxVenue, is_from_database: !!approxVenueId } as any)
              : null;
            const updates: any = {};
            if (selectedArtist) updates.selectedArtist = selectedArtist;
            if (selectedVenue) updates.selectedVenue = selectedVenue;
            if (Object.keys(updates).length > 0) setFormData(updates);
          } catch {}
        } else {
          // No existing review - create new one
          setExistingReview(null);
          resetForm();
          
          // Prefill from the provided event context (artist, venue, date)
          try {
            const approxArtist = (event as any)?.artist_name || (event as any)?.artist?.name;
            const approxArtistId = (event as any)?.artist_id || (event as any)?.artist?.id || undefined;
            const approxVenue = (event as any)?.venue_name || (event as any)?.venue?.name;
            const approxVenueId = (event as any)?.venue_id || (event as any)?.venue?.id || undefined;
            const approxDate = (event as any)?.event_date || (event as any)?.date || undefined;

            const selectedArtist = approxArtist
              ? ({ id: approxArtistId || `manual-${approxArtist}`, name: approxArtist, is_from_database: !!approxArtistId } as any)
              : null;
            const selectedVenue = approxVenue
              ? ({ id: approxVenueId || `manual-${approxVenue}`, name: approxVenue, is_from_database: !!approxVenueId } as any)
              : null;
            const eventDate = approxDate ? String(approxDate).split('T')[0] : '';

            setFormData({
              reviewType: 'event',
              ...(selectedArtist ? { selectedArtist } : {}),
              ...(selectedVenue ? { selectedVenue } : {}),
              ...(eventDate ? { eventDate } : {}),
            });
          } catch {
            setFormData({ reviewType: 'event' });
          }
        }
      } catch (e) {
        console.error('Error loading review for single page form', e);
      }
    };
    load();
    // run strictly on event.id change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, userId]);

  const handleSaveDraft = async () => {
    console.log('🔥 SAVE DRAFT CLICKED - FORCING SAVE');
    
    try {
      // Force save the draft directly using DraftReviewService
      const success = await DraftReviewService.saveDraft(userId, actualEventId, formData as any);
      
      if (success) {
        console.log('✅ Draft saved successfully!');
        toast({
          title: "Draft Saved",
          description: "Your draft has been saved successfully!",
        });
        
        // Close the form
        if (onClose) {
          onClose();
        }
      } else {
        console.log('❌ Failed to save draft');
        toast({
          title: "Save Failed",
          description: "Failed to save draft. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Error saving draft:', error);
      toast({
        title: "Save Failed",
        description: "An error occurred while saving the draft.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async () => {
    if (!userId) {
      toast({ title: 'Authentication Required', description: 'Please log in to submit a review.', variant: 'destructive' });
      return;
    }

    // Comprehensive validation before submission
    const validationErrors: string[] = [];

    // Step 1: Event Details Validation
    if (formData.reviewType === 'event') {
      if (!formData.selectedArtist) {
        validationErrors.push('Please select an artist');
      }
      if (!formData.selectedVenue) {
        validationErrors.push('Please select a venue');
      }
      if (!formData.eventDate) {
        validationErrors.push('Please select an event date');
      }
    } else if (formData.reviewType === 'venue') {
      if (!formData.selectedVenue) {
        validationErrors.push('Please select a venue');
      }
    } else if (formData.reviewType === 'artist') {
      if (!formData.selectedArtist) {
        validationErrors.push('Please select an artist');
      }
    }

    // Step 2: Ratings Validation
    if (formData.performanceRating === 0) {
      validationErrors.push('Please rate the performance');
    } else if (formData.performanceRating < 0.5 || formData.performanceRating > 5.0) {
      validationErrors.push('Performance rating must be between 0.5 and 5.0 stars');
    }

    if (formData.venueRating === 0) {
      validationErrors.push('Please rate the venue');
    } else if (formData.venueRating < 0.5 || formData.venueRating > 5.0) {
      validationErrors.push('Venue rating must be between 0.5 and 5.0 stars');
    }

    if (formData.overallExperienceRating === 0) {
      validationErrors.push('Please rate the overall experience');
    } else if (formData.overallExperienceRating < 0.5 || formData.overallExperienceRating > 5.0) {
      validationErrors.push('Overall experience rating must be between 0.5 and 5.0 stars');
    }

    // Step 3: Review Text Validation
    if (!formData.reviewText || formData.reviewText.trim() === '') {
      validationErrors.push('Please share a brief description of your experience');
    } else if (formData.reviewText.length > 500) {
      validationErrors.push('Review text must be 500 characters or less');
    }

    // Optional field length validation
    if (formData.performanceReviewText && formData.performanceReviewText.length > 300) {
      validationErrors.push('Performance review must be 300 characters or less');
    }
    if (formData.venueReviewText && formData.venueReviewText.length > 300) {
      validationErrors.push('Venue review must be 300 characters or less');
    }
    if (formData.overallExperienceReviewText && formData.overallExperienceReviewText.length > 300) {
      validationErrors.push('Overall experience review must be 300 characters or less');
    }
    if (formData.artistReviewText && formData.artistReviewText.length > 300) {
      validationErrors.push('Artist review must be 300 characters or less');
    }

    // If there are validation errors, show them and don't submit
    if (validationErrors.length > 0) {
      const errorMessage = validationErrors.length === 1 
        ? validationErrors[0]
        : `Please complete the following:\n• ${validationErrors.join('\n• ')}`;
      
      toast({ 
        title: 'Incomplete Review', 
        description: errorMessage, 
        variant: 'destructive',
        duration: 6000 // Show longer for multiple errors
      });
      return;
    }

    let eventId = event.id;
    // Resolve or cache artist in DB to obtain stable UUID for artists table
    let artistProfileId: string | undefined;
    try {
      const artistCandidate: any = (formData.selectedArtist || (event as any)?.artist) || null;
      const jambaseArtistId: string | undefined = artistCandidate?.id || (artistCandidate?.identifier?.split?.(':')?.[1]);
      if (jambaseArtistId) {
        // Try DB first
        const byId = await (supabase as any)
          .from('artists')
          .select('id')
          .eq('jambase_artist_id', jambaseArtistId)
          .limit(1);
        if (Array.isArray(byId.data) && byId.data.length > 0) {
          artistProfileId = byId.data[0].id;
        } else {
          // Populate cache via search (this populates DB), then re-select
          try {
            const { UnifiedArtistSearchService } = await import('@/services/unifiedArtistSearchService');
            await UnifiedArtistSearchService.searchArtists(artistCandidate?.name || '');
            const reSel = await (supabase as any)
              .from('artists')
              .select('id')
              .eq('jambase_artist_id', jambaseArtistId)
              .limit(1);
            if (Array.isArray(reSel.data) && reSel.data.length > 0) {
              artistProfileId = reSel.data[0].id;
            }
          } catch {}
        }
      }
    } catch {}
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId);
    if (!looksLikeUuid || event?.id?.startsWith('new-review')) {
      try {
        const eventDateTime = new Date(formData.eventDate + 'T20:00:00Z');
        // Attempt insert; if it fails due to schema, degrade to minimal payload
        let insertPayload: any = {
          title: `${formData.selectedArtist?.name || 'Concert'} at ${formData.selectedVenue?.name || 'Venue'}`,
          artist_name: formData.selectedArtist?.name || '',
          venue_name: formData.selectedVenue?.name || '',
          venue_id: formData.selectedVenue?.is_from_database ? formData.selectedVenue.id : null,
          venue_city: formData.selectedVenue?.address?.addressLocality || 'Unknown',
          venue_state: formData.selectedVenue?.address?.addressRegion || 'Unknown',
          event_date: eventDateTime.toISOString(),
          description: `Concert by ${formData.selectedArtist?.name || ''} at ${formData.selectedVenue?.name || ''}`
        };
        let ins = await (supabase as any)
          .from('jambase_events')
          .insert(insertPayload)
          .select()
          .single();
        if (ins.error) {
          insertPayload = {
            title: insertPayload.title,
            artist_name: insertPayload.artist_name,
            venue_name: insertPayload.venue_name,
            event_date: insertPayload.event_date,
          };
          ins = await (supabase as any)
            .from('jambase_events')
            .insert(insertPayload)
            .select()
            .single();
        }
        // If we resolved artist_profile, update event row with artist_id for future accuracy
        if (!ins.error && artistProfileId) {
          try {
            await (supabase as any)
              .from('jambase_events')
              .update({ artist_id: artistProfileId })
              .eq('id', ins.data.id);
          } catch {}
        }
        if (ins.error) throw ins.error;
        eventId = ins.data.id;
      } catch (e) {
        console.error('Error creating event:', e);
        toast({ title: 'Error', description: 'Failed to create event entry. Please try again.', variant: 'destructive' });
        return;
      }
    }

    setLoading(true);
    try {
      const combinedReviewText = [
        formData.reviewText.trim(),
        formData.artistReviewText.trim() ? `Artist: ${formData.artistReviewText.trim()}` : ''
      ].filter(Boolean).join('\n\n');

      // Ensure overall rating is saved on a 1..5 integer scale without halving
      const integerOverall = Math.max(1, Math.min(5, Math.round(formData.rating))) as any;
      const reviewData: ReviewData = {
        review_type: 'event',
        // Send integer overall rating to satisfy NOT NULL integer column; decimals go to category columns
        rating: integerOverall,
        performance_rating: formData.performanceRating || undefined,
        venue_rating: formData.venueRating || undefined,
        overall_experience_rating: formData.overallExperienceRating || undefined,
        performance_review_text: formData.performanceReviewText || undefined,
        venue_review_text: formData.venueReviewText || undefined,
        overall_experience_review_text: formData.overallExperienceReviewText || undefined,
        review_text: combinedReviewText.trim() || undefined,
        reaction_emoji: formData.reactionEmoji || undefined,
        photos: formData.photos && formData.photos.length > 0 ? formData.photos : undefined,
        videos: formData.videos && formData.videos.length > 0 ? formData.videos : undefined,
        setlist: formData.selectedSetlist || undefined,
        custom_setlist: formData.customSetlist && formData.customSetlist.length > 0 ? formData.customSetlist : undefined,
        is_public: formData.isPublic,
      };

      console.log('🎵 EventReviewForm: Review data being saved:', {
        hasSetlist: !!reviewData.setlist,
        setlistData: reviewData.setlist,
        formDataSelectedSetlist: formData.selectedSetlist,
        hasCustomSetlist: !!reviewData.custom_setlist,
        customSetlistSongCount: reviewData.custom_setlist?.length || 0
      });

      // Ensure venue exists in DB to save venue_id if possible
      let venueId: string | undefined = formData.selectedVenue?.is_from_database ? formData.selectedVenue.id : undefined;
      if (!venueId && formData.selectedVenue) {
        try {
          const candidateIdentifier = formData.selectedVenue.identifier;
          const idLooksLikeUuid = typeof candidateIdentifier === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidateIdentifier);

          // Prefer UUID identifier lookup if value is a UUID; otherwise skip identifier equality to avoid 400s
          let foundId: string | undefined = undefined;
          if (idLooksLikeUuid) {
            const selByIdentifier = await (supabase as any)
              .from('venues')
              .select('id')
              .eq('identifier', candidateIdentifier)
              .limit(1);
            foundId = Array.isArray(selByIdentifier.data) && selByIdentifier.data.length > 0 ? selByIdentifier.data[0].id : undefined;
          }
          if (foundId) {
            venueId = foundId;
          } else {
            // Fallback: try name search with wildcards
            const byName = await (supabase as any)
              .from('venues')
              .select('id')
              .ilike('name', `%${formData.selectedVenue.name}%`)
              .limit(1);
            const nameId = Array.isArray(byName.data) && byName.data.length > 0 ? byName.data[0].id : undefined;
            if (nameId) {
              venueId = nameId;
            } else {
              // Insert minimal row; handle unique race by selecting on conflict
              const ins = await (supabase as any)
                .from('venues')
                .insert({
                  jambase_venue_id: `user-created-${Date.now()}`,
                  name: formData.selectedVenue.name,
                  identifier: idLooksLikeUuid ? candidateIdentifier : `user-created-${formData.selectedVenue.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
                  address: typeof formData.selectedVenue.address === 'string' ? formData.selectedVenue.address : (formData.selectedVenue.address?.streetAddress || null),
                  city: formData.selectedVenue.address?.addressLocality || null,
                  state: formData.selectedVenue.address?.addressRegion || null,
                  zip: formData.selectedVenue.address?.postalCode || null,
                  country: formData.selectedVenue.address?.addressCountry || 'US',
                  latitude: formData.selectedVenue.geo?.latitude || null,
                  longitude: formData.selectedVenue.geo?.longitude || null,
                  image_url: formData.selectedVenue.image_url || null,
                  url: (formData.selectedVenue as any).url || null,
                  date_published: new Date().toISOString(),
                  date_modified: new Date().toISOString()
                });
              // After insert, always resolve id via safe lookup (identifier if UUID else name ilike)
              if (!ins.error) {
                if (idLooksLikeUuid) {
                  const reSelByIdentifier = await (supabase as any)
                    .from('venues')
                    .select('id')
                    .eq('identifier', candidateIdentifier)
                    .limit(1);
                  if (Array.isArray(reSelByIdentifier.data) && reSelByIdentifier.data.length > 0) {
                    venueId = reSelByIdentifier.data[0].id;
                  }
                }
                if (!venueId) {
                  const reSelByName = await (supabase as any)
                    .from('venues')
                    .select('id')
                    .ilike('name', `%${formData.selectedVenue.name}%`)
                    .limit(1);
                  if (Array.isArray(reSelByName.data) && reSelByName.data.length > 0) {
                    venueId = reSelByName.data[0].id;
                  }
                }
              }
            }
          }
        } catch {}
      }

      const review = await ReviewService.setEventReview(userId, eventId, reviewData, venueId);
      
      // Clear localStorage draft after successful submission
      clearDraft(eventId);
      
      // Update jambase_events table with API setlist data ONLY (not custom setlist)
      // Custom setlist stays in user_reviews.custom_setlist column only
      if (formData.selectedSetlist) {
        try {
          console.log('🎵 EventReviewForm: Updating jambase_events with API setlist data:', {
            eventId,
            setlist: formData.selectedSetlist,
            songCount: formData.selectedSetlist.songCount
          });
          
          const updateData: any = {
            setlist: formData.selectedSetlist,
            updated_at: new Date().toISOString()
          };
          
          // Add song count if available
          if (formData.selectedSetlist.songCount) {
            updateData.setlist_song_count = formData.selectedSetlist.songCount;
          }
          
          // Add setlist.fm URL if available
          if (formData.selectedSetlist.url) {
            updateData.setlist_fm_url = formData.selectedSetlist.url;
          }
          
          // Add setlist.fm ID if available
          if (formData.selectedSetlist.setlistFmId) {
            updateData.setlist_fm_id = formData.selectedSetlist.setlistFmId;
          }
          
          const { error: updateError } = await supabase
            .from('jambase_events')
            .update(updateData)
            .eq('id', eventId);
          
          if (updateError) {
            console.error('🎵 Error updating jambase_events with setlist:', updateError);
          } else {
            console.log('🎵 Successfully updated jambase_events with setlist data');
          }
        } catch (error) {
          console.error('🎵 Error updating jambase_events with setlist:', error);
        }
      }
      
      try {
        const entityType = formData.reviewType === 'artist' ? 'artist' : (formData.reviewType === 'venue' ? 'venue' : 'event');
        const entityId = entityType === 'artist' ? (formData.selectedArtist?.id || eventId) : (entityType === 'venue' ? (venueId || formData.selectedVenue?.id || eventId) : eventId);
        trackInteraction.review(entityType, entityId, reviewData.rating as number, {
          performance_rating: reviewData.performance_rating,
          venue_rating: reviewData.venue_rating,
          overall_experience_rating: reviewData.overall_experience_rating,
          is_public: reviewData.is_public,
          has_text: !!reviewData.review_text,
          text_length: reviewData.review_text?.length || 0,
          reviewType: formData.reviewType
        });
        trackInteraction.formSubmit('event_review', entityId, true, { reviewType: formData.reviewType });
      } catch {}
      toast({ title: existingReview ? 'Review Updated' : 'Review Submitted! 🎉', description: existingReview ? 'Your review has been updated.' : 'Thanks for sharing your concert experience!' });
      
      // New reviews start the form over; edits leave it as the user left it.
      if (!existingReview) {
        resetForm();
      }
      if (onSubmitted) onSubmitted(review);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Error submitting review:', e);
      toast({ title: 'Error', description: `Failed to submit review: ${msg}`, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Debug component state
  console.log('🔍 EventReviewForm render state:', {
    existingReview: !!existingReview,
    isLoading,
    actualEventId,
    hasFormData: !!formData
  });

  return (
    <>
      <Card className="border-gray-200">
        <CardContent className="p-0">
          <div className="px-6 py-6 space-y-8">
            {/* Draft Toggle - only show for new reviews */}
            {!existingReview && (
              <DraftToggle
                userId={userId}
                onSelectDraft={(draft) => {
                  setCurrentDraft(draft);
                  if (draft.draft_data) {
                    setFormData(draft.draft_data as any);
                  }
                  // Close the review form when a draft is selected
                  if (onClose) {
                    onClose();
                  }
                }}
                onNewReview={() => {
                  setCurrentDraft(null);
                  resetForm();
                }}
                currentMode={currentDraft ? 'draft' : 'new'}
              />
            )}
            
            {/* Auto-save status - localStorage based */}
            {!existingReview && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span>Your progress is automatically saved locally</span>
                </div>
              </div>
            )}
            
            <EventDetailsStep formData={formData} errors={errors} onUpdateFormData={updateFormData} />
            <RatingStep formData={formData} errors={errors} onUpdateFormData={updateFormData} />
            <ReviewContentStep formData={formData} errors={errors} onUpdateFormData={updateFormData} />

            {/* Submit inline */}
            <div className="pt-3">
              <div className="flex justify-between items-center">
                {/* Auto-save status */}
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  {isSaving && (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                      <span>Saving...</span>
                    </div>
                  )}
                  {lastSaveTime && !isSaving && (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Saved {lastSaveTime.toLocaleTimeString()}</span>
                    </div>
                  )}
                </div>

                {/* Submit buttons */}
                <div className="flex gap-2">
                  {!existingReview && (
                    <>
                      {console.log('🔥 Save as Draft button is being rendered!')}
                      <Button 
                        variant="outline" 
                        onClick={handleSaveDraft}
                        disabled={isLoading}
                        className="border-gray-300"
                      >
                        Save as Draft
                      </Button>
                    </>
                  )}
                  <Button onClick={handleSubmit} disabled={isLoading} className="bg-pink-500 hover:bg-pink-600">
                    {isLoading ? 'Submitting...' : 'Submit Review'}
                  </Button>
                </div>
              </div>
            </div>

            {existingReview && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={async () => {
                    console.log('🗑️ Deleting review:', { eventId: event.id, userId });
                    try {
                      await ReviewService.deleteEventReview(userId, event.id);
                      console.log('✅ Review deleted successfully');
                      
                      try { trackInteraction.click('review', event.id, { action: 'delete', source: 'event_review_form' }); } catch {}
                      
                      toast({ 
                        title: 'Review Deleted', 
                        description: 'Your review has been deleted.' 
                      });
                      
                      setExistingReview(null);
                      resetForm();
                      
                      // Notify parent component to refresh
                      if (onDeleted) {
                        console.log('📢 Calling onDeleted callback');
                        onDeleted();
                      }
                    } catch (e) {
                      console.error('❌ Error deleting review:', e);
                      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
                      toast({ 
                        title: 'Error', 
                        description: `Failed to delete review: ${errorMsg}`, 
                        variant: 'destructive' 
                      });
                    }
                  }}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Delete Review
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

    </>
  );
}


