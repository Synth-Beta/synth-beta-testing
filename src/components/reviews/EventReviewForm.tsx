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
import { ShowRanking, type ShowEntry } from './ShowRanking';
import { trackInteraction } from '@/services/interactionTrackingService';
import { PostSubmitRankingModal } from './PostSubmitRankingModal';
import { useAutoSave } from '@/hooks/useAutoSave';
import { DraftReviewService, DraftReviewData, DraftReview } from '@/services/draftReviewService';
import { DraftToggle } from './DraftToggle';
import { SMSInvitationService } from '@/services/smsInvitationService';

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
  const [shows, setShows] = useState<ShowEntry[]>([]);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [submittedReview, setSubmittedReview] = useState<UserReview | null>(null);
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
      
      // Validate eventDate format
      if (formData.eventDate.trim() === '') {
        console.log('🚫 Not creating event: Empty event date');
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
        
        // Validate that the date is actually valid
        if (isNaN(eventDateTime.getTime())) {
          console.error('❌ Invalid date format:', formData.eventDate);
          throw new Error(`Invalid event date format: ${formData.eventDate}`);
        }
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
        
        // Step 3: Check if event exists first, then insert if needed
        console.log('🔍 DEBUG: Checking for existing event before insert');
        
        // First, check if an event with similar details already exists
        const { data: existingEvent } = await (supabase as any)
          .from('jambase_events')
          .select('id')
          .eq('artist_name', formData.selectedArtist.name)
          .eq('venue_name', formData.selectedVenue.name)
          .eq('event_date', eventDateTime.toISOString())
          .maybeSingle();
        
        if (existingEvent) {
          console.log('🔍 DEBUG: Found existing event, using it:', existingEvent.id);
          setActualEventId(existingEvent.id);
        } else {
          console.log('🔍 DEBUG: No existing event found, creating new one');
          
          // Create a unique jambase_event_id for user-created events
          const uniqueEventId = `user_created_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          const insertPayloadWithId = {
            ...insertPayload,
            jambase_event_id: uniqueEventId
          };
          
          console.log('🔍 DEBUG: Insert payload:', JSON.stringify(insertPayloadWithId, null, 2));
          
          // Insert the new event
          const { data: newEvent, error: insertError } = await (supabase as any)
            .from('jambase_events')
            .insert(insertPayloadWithId)
            .select()
            .single();
          
          if (insertError) {
            console.error('❌ Error creating event for draft:', insertError);
            throw insertError;
          }
          
          console.log('✅ Event created for draft:', newEvent.id);
          setActualEventId(newEvent.id);
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
          
          // Fetch event details from jambase_events to get artist_name, venue_name, and event_date
          let eventDetails = null;
          if (review.event_id) {
            const { data: eventData } = await (supabase as any)
              .from('jambase_events')
              .select('artist_name, artist_id, venue_name, venue_id, event_date')
              .eq('id', review.event_id)
              .single();
            
            if (eventData) {
              eventDetails = eventData;
              console.log('🎯 Fetched event details for review:', eventDetails);
            }
          }
          
          // Prefill form data from existing review
          setFormData({
            selectedArtist: null,
            selectedVenue: null,
            eventDate: eventDetails?.event_date 
              ? String(eventDetails.event_date).split('T')[0] 
              : (review.created_at || '').split('T')[0],
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
          
          // Pre-populate selected artist and venue from event details
          try {
            const approxArtist = eventDetails?.artist_name || (event as any)?.artist_name || (event as any)?.artist?.name;
            const approxArtistId = eventDetails?.artist_id || (event as any)?.artist_id || (event as any)?.artist?.id;
            const approxVenue = eventDetails?.venue_name || (event as any)?.venue_name || (event as any)?.venue?.name;
            const approxVenueId = eventDetails?.venue_id || review.venue_id || (event as any)?.venue?.id;
            const eventDateFromEvent = eventDetails?.event_date 
              ? String(eventDetails.event_date).split('T')[0] 
              : ((event as any)?.event_date ? String((event as any).event_date).split('T')[0] : null);
            
            const selectedArtist = approxArtist
              ? ({ 
                  id: approxArtistId || `manual-${approxArtist}`, 
                  name: approxArtist, 
                  is_from_database: !!approxArtistId 
                } as any)
              : null;
            const selectedVenue = approxVenue
              ? ({ id: approxVenueId || `manual-${approxVenue}`, name: approxVenue, is_from_database: !!approxVenueId } as any)
              : null;
            
            const updates: any = {
              selectedArtist,
              selectedVenue,
              // Also set the setlist if it exists
              selectedSetlist: event.setlist || (event as any)?.existing_review?.selectedSetlist || null,
              // Ensure event date is set
              eventDate: eventDateFromEvent || formData.eventDate
            };
            console.log('🎵 Pre-populating form data for edit:', { 
              selectedArtist, 
              selectedVenue, 
              hasSetlist: !!updates.selectedSetlist,
              eventDate: updates.eventDate,
              eventDateFromEvent,
              eventDetails
            });
            setFormData(updates);
          } catch (error) {
            console.error('❌ Error pre-populating artist/venue:', error);
          }
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
      console.log('🔍 EventReviewForm: Artist resolution - candidate:', artistCandidate, 'jambaseArtistId:', jambaseArtistId);
      if (jambaseArtistId) {
        console.log('🔍 EventReviewForm: Looking up artist with jambaseArtistId:', jambaseArtistId);
        // Try DB first
        const byId = await (supabase as any)
          .from('artists')
          .select('id')
          .eq('jambase_artist_id', jambaseArtistId)
          .limit(1);
        if (Array.isArray(byId.data) && byId.data.length > 0) {
          artistProfileId = byId.data[0].id;
          console.log('🔍 EventReviewForm: Found existing artist in DB:', artistProfileId);
        } else {
          console.log('🔍 EventReviewForm: Artist not found in DB, searching local DB only...');
          // Review form: local DB search only, no API calls
          try {
            const { UnifiedArtistSearchService } = await import('@/services/unifiedArtistSearchService');
            await UnifiedArtistSearchService.searchArtists(artistCandidate?.name || '', 20, false);
            const reSel = await (supabase as any)
              .from('artists')
              .select('id')
              .eq('jambase_artist_id', jambaseArtistId)
              .limit(1);
            if (Array.isArray(reSel.data) && reSel.data.length > 0) {
              artistProfileId = reSel.data[0].id;
              console.log('🔍 EventReviewForm: Found artist after search:', artistProfileId);
            } else {
              console.log('⚠️ EventReviewForm: Artist still not found after search');
            }
          } catch {}
        }
      }
    } catch {}
    
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
          const selByName = await (supabase as any)
            .from('venues')
            .select('id')
            .ilike('name', `%${formData.selectedVenue.name}%`)
            .limit(1);
          foundId = Array.isArray(selByName.data) && selByName.data.length > 0 ? selByName.data[0].id : undefined;
          if (foundId) {
            venueId = foundId;
          }
        }
      } catch {}
    }

    // ALWAYS create or find the correct event for the new artist/venue combination
    // This ensures that when editing a review with different artist/venue, we use the correct event_id
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId);
    
    // Check if this is a new event (not a valid UUID or starts with 'new-review')
    const isNewEvent = !looksLikeUuid || event?.id?.startsWith('new-review');
    
    // If editing an existing review, check if artist/venue has changed
    const artistChanged = formData.selectedArtist && existingReview && formData.selectedArtist.name !== ((existingReview as any).artist_name || (event as any)?.artist_name);
    const venueChanged = formData.selectedVenue && existingReview && formData.selectedVenue.name !== ((existingReview as any).venue_name || (event as any)?.venue_name);
    
    // We need to create a new event if it's a new event OR if the artist/venue has changed
    const needsNewEvent = isNewEvent || artistChanged || venueChanged;
    
    // If event already exists and doesn't need recreation, verify and potentially update its date
    if (looksLikeUuid && !event?.id?.startsWith('new-review') && !needsNewEvent) {
      if (formData.eventDate && formData.eventDate.trim() !== '') {
        try {
          const eventDateTime = new Date(formData.eventDate + 'T20:00:00Z');
          if (!isNaN(eventDateTime.getTime())) {
            const { data: existingEvent } = await (supabase as any)
              .from('jambase_events')
              .select('event_date')
              .eq('id', eventId)
              .single();
            
            if (existingEvent) {
              const existingDate = new Date(existingEvent.event_date);
              const expectedDate = eventDateTime;
              const daysDiff = Math.abs((expectedDate.getTime() - existingDate.getTime()) / (1000 * 60 * 60 * 24));
              if (daysDiff > 1) {
                console.log('🔧 Updating event date from', existingDate, 'to', expectedDate);
                await (supabase as any)
                  .from('jambase_events')
                  .update({ event_date: eventDateTime.toISOString() })
                  .eq('id', eventId);
              }
            }
          }
        } catch (error) {
          console.error('❌ Error updating event date:', error);
        }
      }
    }
    
    if (needsNewEvent) {
      try {
        // Validate eventDate before creating Date object
        if (!formData.eventDate || formData.eventDate.trim() === '') {
          throw new Error('Event date is required');
        }
        
        const eventDateTime = new Date(formData.eventDate + 'T20:00:00Z');
        
        // Validate that the date is actually valid
        if (isNaN(eventDateTime.getTime())) {
          throw new Error(`Invalid event date: ${formData.eventDate}`);
        }
        
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
        // If we resolved artist_profile, update event row with artist_uuid for future accuracy
        if (!ins.error && artistProfileId) {
          try {
            console.log('🔍 EventReviewForm: Updating jambase_events with artist_uuid:', artistProfileId);
            const updateResult = await (supabase as any)
              .from('jambase_events')
              .update({ artist_uuid: artistProfileId })
              .eq('id', ins.data.id);
            console.log('🔍 EventReviewForm: Artist UUID update result:', updateResult);
          } catch (error) {
            console.error('❌ EventReviewForm: Error updating artist_uuid:', error);
          }
        } else {
          console.log('⚠️ EventReviewForm: No artistProfileId to update:', { artistProfileId, hasError: !!ins.error });
        }
        
        // Note: venue_uuid column doesn't exist in jambase_events table
        // The venueId will be passed directly to ReviewService
        if (!ins.error && venueId) {
          console.log('🔍 EventReviewForm: VenueId resolved for ReviewService:', venueId);
        } else {
          console.log('⚠️ EventReviewForm: No venueId resolved:', { venueId, hasError: !!ins.error });
        }
        if (ins.error) throw ins.error;
        eventId = ins.data.id;
        
        // If we're editing an existing review and the event changed, delete the old review
        if (existingReview && (artistChanged || venueChanged)) {
          console.log('🔄 EventReviewForm: Artist/venue changed, deleting old review and creating new one');
          await supabase
            .from('user_reviews')
            .delete()
            .eq('id', existingReview.id);
          setExistingReview(null); // Treat as new review
        }
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

      const showsRankingBlock = shows.length
        ? `\n\nShow rankings:\n${shows
            .slice()
            .sort((a, b) => (b.rating - a.rating) || (a.order - b.order))
            .map((s, idx) => `${idx + 1}. ${s.show_name || 'Show'}${s.show_date ? ` (${s.show_date})` : ''}${s.venue_name ? ` @ ${s.venue_name}` : ''} — ${s.rating}/5${(shows.filter(x => x.rating === s.rating).length > 1) ? ` [tie #${s.order}]` : ''}`)
            .join('\n')}
        `
        : '';

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
        review_text: (combinedReviewText + showsRankingBlock).trim() || undefined,
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
      
      // Send SMS invitations for phone numbers if any
      if (formData.attendees && formData.attendees.length > 0) {
        const phoneNumbers = formData.attendees
          .filter((a): a is { type: 'phone'; phone: string; name?: string } => a.type === 'phone')
          .map(a => a.phone);
        
        if (phoneNumbers.length > 0) {
          try {
            // Get user's profile name
            const { data: profile } = await supabase
              .from('profiles')
              .select('name')
              .eq('user_id', userId)
              .single();
            
            const senderName = profile?.name || 'A friend';
            
            await SMSInvitationService.sendReviewInvitations(
              phoneNumbers,
              review.id,
              senderName
            );
          } catch (error) {
            console.error('Failed to send SMS invitations:', error);
            // Don't block review submission if SMS fails
          }
        }
      }
      
      // Check if we should show ranking modal (only for new reviews, not edits)
      if (!existingReview) {
        console.log('🎯 New review submitted, checking if we should show ranking modal');
        console.log('  Review data:', {
          id: review.id,
          rating: review.rating,
          performance_rating: review.performance_rating,
          venue_rating: (review as any).venue_rating_new || review.venue_rating,
          overall_experience_rating: review.overall_experience_rating,
        });
        
        // Calculate the effective rating from the saved review (use decimal values if available)
        const effectiveRating = review.performance_rating && (review as any).venue_rating_new && review.overall_experience_rating
          ? (review.performance_rating + (review as any).venue_rating_new + review.overall_experience_rating) / 3
          : review.rating;
        
        console.log('  Effective rating for modal:', effectiveRating);
        console.log('  Opening ranking modal with review ID:', review.id);
        console.log('  ⚠️ DELAYING onSubmitted callback until modal closes');
        
        // Small delay to ensure review is fully saved before opening modal
        setTimeout(() => {
          setSubmittedReview(review);
          setShowRankingModal(true);
          console.log('  ✅ Modal state updated:', { showRankingModal: true, submittedReview: review.id });
        }, 100);
        
        // Don't reset form yet - wait until after ranking modal closes
        // DON'T call onSubmitted yet - will be called when modal closes
      } else {
        // For edits, call onSubmitted immediately
        if (onSubmitted) onSubmitted(review);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Error submitting review:', e);
      toast({ title: 'Error', description: `Failed to submit review: ${msg}`, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleRankingModalClose = () => {
    console.log('🚪 Ranking modal closing');
    setShowRankingModal(false);
    const reviewToSubmit = submittedReview;
    setSubmittedReview(null);
    resetForm();
    
    // NOW call the onSubmitted callback (which triggers navigation)
    if (onSubmitted && reviewToSubmit) {
      console.log('📞 Calling onSubmitted callback after modal close');
      onSubmitted(reviewToSubmit);
    }
  };

  // Calculate effective rating for the ranking modal
  const getEffectiveRating = () => {
    if (formData.performanceRating && formData.venueRating && formData.overallExperienceRating) {
      return (formData.performanceRating + formData.venueRating + formData.overallExperienceRating) / 3;
    }
    return formData.rating;
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
                    console.log('🗑️ Deleting review:', { reviewId: existingReview?.id, eventId: event.id, userId });
                    try {
                      if (!existingReview?.id) {
                        throw new Error('No review ID found');
                      }
                      await ReviewService.deleteEventReview(userId, existingReview.id);
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

      {/* Post-submit ranking modal */}
      {submittedReview && (() => {
        console.log('📺 Rendering PostSubmitRankingModal:', {
          submittedReview: submittedReview.id,
          showRankingModal,
          userId: userId?.slice(0, 8),
          effectiveRating: getEffectiveRating(),
        });
        return (
          <PostSubmitRankingModal
            isOpen={showRankingModal}
            onClose={handleRankingModalClose}
            userId={userId}
            newReview={submittedReview}
            rating={getEffectiveRating()}
          />
        );
      })()}
    </>
  );
}


