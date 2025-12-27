import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { JamBaseEvent } from '@/types/eventTypes';
import { useReviewForm, REVIEW_FORM_TOTAL_STEPS, getTotalSteps } from '@/hooks/useReviewForm';
import { ReviewService, type ReviewData, type UserReview, type PublicReviewWithProfile } from '@/services/reviewService';
import { TimeSelectionStep } from './ReviewFormSteps/TimeSelectionStep';
import { EventDetailsStep } from './ReviewFormSteps/EventDetailsStep';
import { CategoryStep, type CategoryConfig } from './ReviewFormSteps/CategoryStep';
import { ReviewContentStep } from './ReviewFormSteps/ReviewContentStep';
import { QuickReviewStep } from './ReviewFormSteps/QuickReviewStep';
import { PrivacySubmitStep } from './ReviewFormSteps/PrivacySubmitStep';
import { supabase } from '@/integrations/supabase/client';
import type { ShowEntry } from './ShowRanking';
import { trackInteraction } from '@/services/interactionTrackingService';
import { PostSubmitRankingModal } from './PostSubmitRankingModal';
import { useAutoSave } from '@/hooks/useAutoSave';
import { DraftReviewService, DraftReviewData, DraftReview } from '@/services/draftReviewService';
import { DraftToggle } from './DraftToggle';
import { SMSInvitationService } from '@/services/smsInvitationService';
import { SetlistModal } from '@/components/reviews/SetlistModal';
import { CustomSetlistInput } from '@/components/reviews/CustomSetlistInput';
import { Music, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

const ARTIST_SUGGESTIONS: CategoryConfig['suggestions'] = [
  { id: 'artist-electric', label: 'Electric energy', description: 'The band fed off the crowd with nonstop energy.', sentiment: 'positive' },
  { id: 'artist-tight', label: 'Tight musicianship', description: 'Flawless set and tight transitions all night.', sentiment: 'positive' },
  { id: 'artist-weak-vocals', label: 'Vocals struggled', description: 'Vocals were off pitch for most of the night.', sentiment: 'negative' },
  { id: 'artist-short-set', label: 'Short setlist', description: 'Felt too quick—left wanting a few more songs.', sentiment: 'negative' },
];

const PRODUCTION_SUGGESTIONS: CategoryConfig['suggestions'] = [
  { id: 'production-lights', label: 'Insane light show', description: 'Lighting design elevated every drop.', sentiment: 'positive' },
  { id: 'production-soundmix', label: 'Crystal clear mix', description: 'Sound mix was balanced and immersive.', sentiment: 'positive' },
  { id: 'production-feedback', label: 'Feedback issues', description: 'Persistent sound issues distracted from songs.', sentiment: 'negative' },
  { id: 'production-lag', label: 'Stage delays', description: 'Long pauses between songs killed the momentum.', sentiment: 'negative' },
];

const VENUE_SUGGESTIONS: CategoryConfig['suggestions'] = [
  { id: 'venue-staff', label: 'Staff was incredible', description: 'Friendly staff kept lines moving smoothly.', sentiment: 'positive' },
  { id: 'venue-comfort', label: 'Comfortable layout', description: 'Plenty of space and easy sightlines.', sentiment: 'positive' },
  { id: 'venue-crowded', label: 'Overcrowded', description: 'Packed to the brim with no room to breathe.', sentiment: 'negative' },
  { id: 'venue-sound', label: 'Muddy house sound', description: 'Venue acoustics made everything sound muffled.', sentiment: 'negative' },
];

const LOCATION_SUGGESTIONS: CategoryConfig['suggestions'] = [
  { id: 'location-easy', label: 'Easy transit', description: 'Quick rideshare + plenty of parking nearby.', sentiment: 'positive' },
  { id: 'location-food', label: 'Great pre-show spots', description: 'Awesome food and bars in walking distance.', sentiment: 'positive' },
  { id: 'location-traffic', label: 'Nightmare traffic', description: 'Getting there and back took forever.', sentiment: 'negative' },
  { id: 'location-safety', label: 'Felt unsafe', description: 'Area felt sketchy walking back to the car.', sentiment: 'negative' },
];

const VALUE_SUGGESTIONS: CategoryConfig['suggestions'] = [
  { id: 'value-worth-every-dollar', label: 'Worth every dollar', description: 'Totally justified the ticket price.', sentiment: 'positive' },
  { id: 'value-underpriced', label: 'Steal of a night', description: 'Felt like we paid half of what it was worth.', sentiment: 'positive' },
  { id: 'value-overpriced', label: 'Overpriced', description: 'Fun night, but tickets were overpriced.', sentiment: 'negative' },
  { id: 'value-hidden-fees', label: 'Too many fees', description: 'Fees and merch prices added up fast.', sentiment: 'negative' },
];

// Helper to get step labels based on flow
const getStepLabels = (flow: 'quick' | 'standard' | 'detailed' | null): string[] => {
  if (!flow) return ['Select time'];
  
  switch (flow) {
    case 'quick':
      return ['Select time', 'Event details', 'Quick review', 'Submit'];
    case 'standard':
      return ['Select time', 'Event details', 'Artist performance', 'Venue', 'Review content', 'Submit'];
    case 'detailed':
      return ['Select time', 'Event details', 'Artist performance', 'Production', 'Venue', 'Location', 'Value', 'Review content', 'Submit'];
    default:
      return [];
  }
};

interface EventReviewFormProps {
  event: JamBaseEvent | PublicReviewWithProfile;
  userId: string;
  onSubmitted?: (review: UserReview) => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
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
    setFormData,
    currentStep,
    nextStep,
    prevStep,
    canProceed,
    canGoBack,
    isLastStep,
    totalSteps,
    currentFlow
  } = useReviewForm();

  const [existingReview, setExistingReview] = useState<UserReview | null>(null);
  const [shows] = useState<ShowEntry[]>([]);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [submittedReview, setSubmittedReview] = useState<UserReview | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [isReviewSubmitted, setIsReviewSubmitted] = useState(false); // Track if review has been submitted
  
  // Reset submission state when event changes (form is reused for different event)
  useEffect(() => {
    setIsReviewSubmitted(false);
  }, [event?.id]);
  const isValidUUID = (value?: string | null) => {
    if (!value) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  };

  const getInitialEventId = () => {
    if (event.id?.startsWith('new-review')) {
      return event.id;
    }
    if (isValidUUID(event.id)) {
      return event.id!;
    }
    return '';
  };

  const [actualEventId, setActualEventId] = useState<string>(getInitialEventId());
  const [currentDraft, setCurrentDraft] = useState<DraftReview | null>(null);
  const [isSetlistModalOpen, setIsSetlistModalOpen] = useState(false);
  const [previousVenueReview, setPreviousVenueReview] = useState<UserReview | null>(null);

  // Check for previous venue review when venue is selected
  useEffect(() => {
    const checkPreviousVenueReview = async () => {
      if (!formData.selectedVenue?.is_from_database || !formData.selectedVenue.id || !userId || existingReview) {
        setPreviousVenueReview(null);
        return;
      }

      const venueId = formData.selectedVenue.id;
      const eventId = actualEventId || event.id || '';
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(venueId)) {
        setPreviousVenueReview(null);
        return;
      }

      try {
        const prevReview = await ReviewService.getPreviousVenueReview(userId, venueId, eventId);
        setPreviousVenueReview(prevReview);
      } catch (error) {
        console.error('Error checking for previous venue review:', error);
        setPreviousVenueReview(null);
      }
    };

    checkPreviousVenueReview();
  }, [formData.selectedVenue?.id, userId, actualEventId, event.id, existingReview]);

  const formatSetlistDate = (date?: string) => {
    if (!date) return '';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleSetlistSelect = (setlist: any) => {
    updateFormData({ selectedSetlist: setlist });
    setIsSetlistModalOpen(false);
  };

  const handleClearSetlist = () => {
    updateFormData({ selectedSetlist: null });
  };

  const handleCustomSetlistChange = (songs: any[]) => {
    updateFormData({ customSetlist: songs as any });
  };

  // Auto-save functionality (saves to database automatically on every change)
  // CRITICAL: Disable auto-save after review is submitted to prevent creating new drafts
  const { manualSave, loadDraft, clearDraft } = useAutoSave({
    userId,
    eventId: actualEventId || null,
    formData: formData as DraftReviewData,
    enabled: !isReviewSubmitted, // Disable auto-save after review is submitted
    debounceMs: 2000, // 2 second debounce
    onSave: (success) => {
      setIsSaving(false);
      if (success) {
        setLastSaveTime(new Date());
      }
    },
    onEventIdChange: (newEventId) => {
      // Update actualEventId when it becomes available
      if (newEventId && newEventId !== actualEventId) {
        setActualEventId(newEventId);
      }
    }
  });

  const categoryConfigs = useMemo<Record<number, CategoryConfig>>(() => {
    const artistName = formData.selectedArtist?.name;
    return {
      2: {
        title: 'Artist Performance',
        subtitle: artistName
          ? `How did ${artistName} deliver live? Share your honest take.`
          : 'How did the artist deliver live? Share your honest take.',
        ratingKey: 'artistPerformanceRating',
        feedbackKey: 'artistPerformanceFeedback',
        helperText: 'Tap a star (half points allowed) to capture the performance.',
        suggestions: ARTIST_SUGGESTIONS,
      },
      3: {
        title: 'Production Quality',
        subtitle: 'Lights, visuals, sound mix — did the production elevate the night?',
        ratingKey: 'productionRating',
        feedbackKey: 'productionFeedback',
        helperText: 'Think about sound clarity, lighting, visuals, and pacing.',
        suggestions: PRODUCTION_SUGGESTIONS,
      },
      4: {
        title: 'Venue Experience',
        subtitle: formData.selectedVenue?.name
          ? `What was ${formData.selectedVenue.name} like to be in?`
          : 'Consider the staff, comfort, lines, and vibe inside the venue.',
        ratingKey: 'venueRating',
        feedbackKey: 'venueFeedback',
        helperText: 'Include staff vibes, comfort, and amenities.',
        suggestions: VENUE_SUGGESTIONS,
      },
      5: {
        title: 'Location & Logistics',
        subtitle: 'Getting there, getting home, nearby spots — how easy was the night?',
        ratingKey: 'locationRating',
        feedbackKey: 'locationFeedback',
        helperText: 'Parking, transit, food options, safety — it all counts.',
        suggestions: LOCATION_SUGGESTIONS,
      },
      6: {
        title: 'Value for Ticket Price',
        subtitle: 'Given what you paid, did the experience feel worth it?',
        ratingKey: 'valueRating',
        feedbackKey: 'valueFeedback',
        helperText: 'Honest value helps fans budget for future shows.',
        suggestions: VALUE_SUGGESTIONS,
      },
    };
  }, [formData.selectedArtist?.name, formData.selectedVenue?.name]);

  // Note: Events are NOT created during form filling - they must exist in the database first
  // The review will be linked to an event when submitted, but we don't create events here
  // Disabled event creation useEffect - events must exist in DB before review submission
  /* useEffect(() => {
    const createEventForDraft = async () => {
      // Only create event if it's a new review (starts with 'new-review')
      if (!event?.id?.startsWith('new-review')) {
        return;
      }
      
      // Only create if we have both artist and venue selected
      if (!formData.selectedArtist || !formData.selectedVenue || !formData.eventDate) {
        return;
      }
      
      // Validate eventDate format
      if (formData.eventDate.trim() === '') {
        return;
      }
      
      // Don't create if we already have a valid event ID
      if (isValidUUID(actualEventId)) {
        return;
      }
      
      try {
        const eventDateTime = new Date(formData.eventDate + 'T20:00:00Z');
        
        // Validate that the date is actually valid
        if (isNaN(eventDateTime.getTime())) {
          console.error('❌ Invalid date format:', formData.eventDate);
          throw new Error(`Invalid event date format: ${formData.eventDate}`);
        }
        // resolvedVenueId is a UUID from venues.id (not jambase_venue_id)
        const resolvedVenueId =
          formData.selectedVenue?.is_from_database &&
          isValidUUID(formData.selectedVenue.id)
            ? formData.selectedVenue.id
            : null;

        const insertPayload: any = {
          title: `${formData.selectedArtist.name} at ${formData.selectedVenue.name}`,
          artist_name: formData.selectedArtist.name,
          venue_name: formData.selectedVenue.name,
          // Use venue_uuid for UUID foreign key to venues.id (not venue_id which is TEXT)
          ...(resolvedVenueId ? { venue_uuid: resolvedVenueId } : {}),
          venue_city: formData.selectedVenue.address?.addressLocality || 'Unknown',
          venue_state: formData.selectedVenue.address?.addressRegion || 'Unknown',
          event_date: eventDateTime.toISOString(),
          description: `Concert by ${formData.selectedArtist.name} at ${formData.selectedVenue.name}`
        };
        
        // Step 3: Check if event exists first, then insert if needed
        console.log('🔍 DEBUG: Checking for existing event before insert');
        
        // First, check if an event with similar details already exists
        const { data: existingEvent } = await (supabase as any)
          .from('events')
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
          
          // Users can no longer directly create events
        // Submit a request instead
        try {
          const { MissingEntityRequestService } = await import('@/services/missingEntityRequestService');
          await MissingEntityRequestService.submitRequest({
            entity_type: 'event',
            entity_name: insertPayload.title,
            entity_date: insertPayload.event_date,
            entity_location: `${insertPayload.venue_city}, ${insertPayload.venue_state}`,
            additional_info: {
              artist_name: formData.selectedArtist.name,
              venue_name: formData.selectedVenue.name,
            },
          });
          console.log('📝 Submitted request for missing event:', insertPayload.title);
          toast({
            title: "Event Request Submitted",
            description: "Your event request has been submitted for review. You can still write your review, but the event will need to be approved first.",
          });
        } catch (error) {
          console.error('❌ Error submitting event request:', error);
          // Don't throw - allow user to continue with review
        }
        }
      } catch (error) {
        console.error('❌ Exception creating event for draft:', error);
      }
    };
    
    createEventForDraft();
  }, [formData.selectedArtist, formData.selectedVenue, formData.eventDate, event?.id, actualEventId]); */

  useEffect(() => {
    const load = async () => {
      if (!event || !userId) return;
      
      // Helper to check if string is a valid UUID
      try {
        // First check if we have an existing review ID (edit mode)
        const existingReviewId = (event as any)?.existing_review_id;
        let review = null;
        
        if (existingReviewId && isValidUUID(existingReviewId)) {
          // Edit mode: fetch review by ID
          const { data, error } = await (supabase as any)
            .from('reviews')
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
          
          // Use event data from props instead of querying database
          // This avoids 406 errors from RLS policies
          // The event prop already has all the data we need
          let eventDetails = null;
          if (event) {
            // Type guard: check if event is JamBaseEvent (has artist_id/venue_id) or PublicReviewWithProfile
            const isJamBaseEvent = 'artist_id' in event || 'venue_id' in event;
            eventDetails = {
              artist_name: 'artist_name' in event ? event.artist_name : undefined,
              artist_id: isJamBaseEvent && 'artist_id' in event ? (event as JamBaseEvent).artist_id : undefined,
              venue_name: 'venue_name' in event ? event.venue_name : undefined,
              venue_id: isJamBaseEvent && 'venue_id' in event ? (event as JamBaseEvent).venue_id : undefined,
              event_date: 'event_date' in event ? event.event_date : undefined
            };
          }
          
          const eventDateFromReview = eventDetails?.event_date
            ? String(eventDetails.event_date).split('T')[0]
            : (event?.event_date ? String(event.event_date).split('T')[0] : (review.created_at || '').split('T')[0]);

          setFormData({
            selectedArtist: null,
            selectedVenue: null,
            eventDate: eventDateFromReview,
            artistPerformanceRating: review.artist_performance_rating || review.rating,
            productionRating: review.production_rating || review.artist_performance_rating || review.rating,
            venueRating: review.venue_rating || review.rating,
            locationRating: review.location_rating || review.venue_rating || review.rating,
            valueRating: review.value_rating || review.rating,
            artistPerformanceFeedback: review.artist_performance_feedback || '',
            productionFeedback: review.production_feedback || '',
            venueFeedback: review.venue_feedback || '',
            locationFeedback: review.location_feedback || '',
            valueFeedback: review.value_feedback || '',
            ticketPricePaid: review.ticket_price_paid ? String(review.ticket_price_paid) : '',
            rating: review.rating,
            reviewText: review.review_text || '',
            photos: review.photos || [],
            videos: review.videos || [],
            selectedSetlist: review.setlist || null,
            customSetlist: (review as any).custom_setlist || [],
            isPublic: review.is_public,
            reviewType: review.review_type || 'event',
          } as any);
          
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
          setIsReviewSubmitted(false); // Reset submission state for new review
          
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
    // Manual save trigger - auto-save is already happening, but this forces immediate save
    console.log('💾 Manual save triggered (auto-save is already enabled)');
    setIsSaving(true);
    try {
      await manualSave();
      toast({
        title: "Draft Saved",
        description: "Your draft has been saved! (Auto-save is also active)",
        variant: "default",
      });
      setLastSaveTime(new Date());
    } catch (error) {
      console.error('❌ Error in manual save:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save draft. Auto-save will retry automatically.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
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

    // Step 2: Ratings Validation (flow-aware)
    const flow = currentFlow || 'detailed';
    if (flow === 'quick') {
      // 1min: Only overall rating required
      if (!formData.rating || formData.rating < 0.5 || formData.rating > 5.0) {
        validationErrors.push('Please provide an overall rating (0.5 - 5 stars)');
      }
      // Review text validation for quick review
      if (!formData.reviewText || formData.reviewText.trim() === '') {
        validationErrors.push('Please share a brief description of your experience');
      } else if (formData.reviewText.length > 200) {
        validationErrors.push('Review text must be 200 characters or less for quick review');
      }
    } else if (flow === 'standard') {
      // 3min: Artist Performance and Venue ratings required
      if (!formData.artistPerformanceRating || formData.artistPerformanceRating < 0.5 || formData.artistPerformanceRating > 5.0) {
        validationErrors.push('Please rate the artist performance (0.5 - 5 stars)');
      }
      if (!formData.venueRating || formData.venueRating < 0.5 || formData.venueRating > 5.0) {
        validationErrors.push('Please rate the venue (0.5 - 5 stars)');
      }
      // Review text validation for standard review
      if (!formData.reviewText || formData.reviewText.trim() === '') {
        validationErrors.push('Please share a description of your experience');
      } else if (formData.reviewText.length > 400) {
        validationErrors.push('Review text must be 400 characters or less for standard review');
      }
    } else {
      // 5min (detailed): All 5 category ratings required
    const ratingChecks: Array<[number, string]> = [
      [formData.artistPerformanceRating, 'artist performance'],
      [formData.productionRating, 'production quality'],
      [formData.venueRating, 'venue'],
      [formData.locationRating, 'location & logistics'],
      [formData.valueRating, 'value for the ticket price'],
    ];

    ratingChecks.forEach(([value, label]) => {
      if (!value || value === 0) {
        validationErrors.push(`Please rate the ${label}`);
      } else if (value < 0.5 || value > 5.0) {
        validationErrors.push(`The ${label} rating must be between 0.5 and 5.0 stars`);
      }
    });

      // Review text validation for detailed review
    if (!formData.reviewText || formData.reviewText.trim() === '') {
      validationErrors.push('Please share a brief description of your experience');
    } else if (formData.reviewText.length > 500) {
      validationErrors.push('Review text must be 500 characters or less');
      }
    }

    // Optional field length validation
    const optionalNotes: Array<[string | undefined, string]> = [
      [formData.artistPerformanceFeedback, 'Artist performance note must be 400 characters or less'],
      [formData.productionFeedback, 'Production note must be 400 characters or less'],
      [formData.venueFeedback, 'Venue note must be 400 characters or less'],
      [formData.locationFeedback, 'Location note must be 400 characters or less'],
      [formData.valueFeedback, 'Value note must be 400 characters or less'],
    ];
    optionalNotes.forEach(([text, message]) => {
      if (text && text.length > 400) {
        validationErrors.push(message);
      }
    });

    if (formData.ticketPricePaid) {
      const numericPrice = Number(formData.ticketPricePaid);
      if (Number.isNaN(numericPrice)) {
        validationErrors.push('Ticket price must be a valid number');
      } else if (numericPrice < 0) {
        validationErrors.push('Ticket price cannot be negative');
      }
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

    let eventId = isValidUUID(actualEventId)
      ? actualEventId
      : (isValidUUID(event.id) ? event.id : actualEventId || event.id);
    // Resolve or cache artist in DB to obtain stable UUID for artists table
    let artistProfileId: string | undefined;
    try {
      const artistCandidate: any = (formData.selectedArtist || (event as any)?.artist) || null;
      const jambaseArtistId: string | undefined = artistCandidate?.id || (artistCandidate?.identifier?.split?.(':')?.[1]);
      console.log('🔍 EventReviewForm: Artist resolution - candidate:', artistCandidate, 'jambaseArtistId:', jambaseArtistId);
      if (jambaseArtistId) {
        console.log('🔍 EventReviewForm: Looking up artist with jambaseArtistId:', jambaseArtistId);
        // Try to find artist by identifier or name
        // Use identifier column or external_identifiers jsonb to find artist
        if (artistCandidate?.identifier) {
          const { data: artistByIdentifier } = await supabase
            .from('artists')
          .select('id')
            .eq('identifier', artistCandidate.identifier)
            .limit(1)
            .maybeSingle();
          
          if (artistByIdentifier) {
            artistProfileId = artistByIdentifier.id;
            console.log('🔍 EventReviewForm: Found existing artist by identifier:', artistProfileId);
          }
        }
        
        // If not found by identifier, try by name
        if (!artistProfileId && artistCandidate?.name) {
          const { data: artistByName } = await supabase
            .from('artists')
              .select('id')
            .ilike('name', artistCandidate.name)
            .limit(1)
            .maybeSingle();
          
          if (artistByName) {
            artistProfileId = artistByName.id;
            console.log('🔍 EventReviewForm: Found existing artist by name:', artistProfileId);
          }
        }
        
        if (!artistProfileId) {
          console.log('⚠️ EventReviewForm: Artist not found in database');
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

    if (venueId && !isValidUUID(venueId)) {
      venueId = undefined;
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
              .from('events')
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
                  .from('events')
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
        
        // resolvedVenueId is a UUID from venues.id (not jambase_venue_id)
        // Resolve venue_uuid only if we have a real UUID (user-created placeholders will fail Supabase)
        const resolvedVenueId =
          formData.selectedVenue?.is_from_database &&
          isValidUUID(formData.selectedVenue.id)
            ? formData.selectedVenue.id
            : null;

        // Attempt insert using normalized schema (artist_id and venue_id are UUID FKs, not names)
        // Note: selectedArtist may have is_from_database property even though it's not in the base Artist type
        const artistIsFromDatabase = (formData.selectedArtist as any)?.is_from_database;
        const resolvedArtistId = artistProfileId || (artistIsFromDatabase && isValidUUID(formData.selectedArtist?.id) ? formData.selectedArtist.id : null);
        
        let insertPayload: any = {
          title: `${formData.selectedArtist?.name || 'Concert'} at ${formData.selectedVenue?.name || 'Venue'}`,
          // Use artist_id (UUID FK) instead of artist_name (column removed)
          ...(resolvedArtistId ? { artist_id: resolvedArtistId } : {}),
          // Use venue_id (UUID FK) instead of venue_name (column removed)
          ...(resolvedVenueId ? { venue_id: resolvedVenueId } : {}),
          venue_city: formData.selectedVenue?.address?.addressLocality || 'Unknown',
          venue_state: formData.selectedVenue?.address?.addressRegion || 'Unknown',
          event_date: eventDateTime.toISOString(),
          description: `Concert by ${formData.selectedArtist?.name || ''} at ${formData.selectedVenue?.name || ''}`
        };
        // Users can no longer directly create events
        // Submit a request instead
        let ins: any = { data: null, error: null };
        try {
          const { MissingEntityRequestService } = await import('@/services/missingEntityRequestService');
          await MissingEntityRequestService.submitRequest({
            entity_type: 'event',
            entity_name: insertPayload.title,
            entity_date: insertPayload.event_date,
            entity_location: `${insertPayload.venue_city}, ${insertPayload.venue_state}`,
            additional_info: {
              artist_id: resolvedArtistId,
              venue_id: resolvedVenueId,
            },
          });
          console.log('📝 Submitted request for missing event:', insertPayload.title);
          toast({
            title: "Event Request Submitted",
            description: "Your event request has been submitted for review. You can still write your review.",
          });
          // Set a placeholder event ID so the review can proceed
          // The actual event will need to be created by an admin
          ins.data = { id: `pending-${Date.now()}` };
        } catch (error) {
          console.error('❌ Error submitting event request:', error);
          ins.error = error;
          toast({
            title: "Request Submission Failed",
            description: "Could not submit event request, but you can still write your review.",
            variant: "destructive",
          });
          // Don't throw - allow user to continue with review
        }
        
        // Note: venue_uuid column exists in events table
        // The venueId will be passed directly to ReviewService
        if (!ins.error && venueId) {
          console.log('🔍 EventReviewForm: VenueId resolved for ReviewService:', venueId);
        } else {
          console.log('⚠️ EventReviewForm: No venueId resolved:', { venueId, hasError: !!ins.error });
        }
        if (ins.error) throw ins.error;
        eventId = ins.data.id;
        setActualEventId(ins.data.id);
        
        // If we're editing an existing review and the event changed, delete the old review
        if (existingReview && (artistChanged || venueChanged)) {
          console.log('🔄 EventReviewForm: Artist/venue changed, deleting old review and creating new one');
          await supabase
            .from('reviews')
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
    
    // CRITICAL: Stop auto-save only after validation passes and we're about to submit
    // This prevents auto-save from creating drafts during/after submission
    // Setting it here (after validation) ensures auto-save remains enabled if validation fails
    setIsReviewSubmitted(true);
    
    try {
      // Individual category feedback fields are saved to their own columns
      // Do NOT combine them into review_text - they go to production_feedback, venue_feedback, etc.

      const showsRankingBlock = shows.length
        ? `\n\nShow rankings:\n${shows
            .slice()
            .sort((a, b) => (b.rating - a.rating) || (a.order - b.order))
            .map((s, idx) => `${idx + 1}. ${s.show_name || 'Show'}${s.show_date ? ` (${s.show_date})` : ''}${s.venue_name ? ` @ ${s.venue_name}` : ''} — ${s.rating}/5${(shows.filter(x => x.rating === s.rating).length > 1) ? ` [tie #${s.order}]` : ''}`)
            .join('\n')}
        `
        : '';

      // Calculate decimal average based on flow
      const flow = currentFlow || 'detailed';
      let decimalAverage: number;
      
      if (flow === 'quick') {
        // Quick flow: use overall rating directly
        decimalAverage = formData.rating || 0;
      } else if (flow === 'standard') {
        // Standard flow: average of Artist Performance and Venue
        const standardRatings = [
          formData.artistPerformanceRating,
          formData.venueRating
        ].filter((r): r is number => typeof r === 'number' && r > 0);
        decimalAverage = standardRatings.length > 0
          ? Number((standardRatings.reduce((sum, r) => sum + r, 0) / standardRatings.length).toFixed(1))
          : (formData.rating || 0);
      } else {
        // Detailed flow: average of all 5 category ratings
      const categoryRatings = [
        formData.artistPerformanceRating,
        formData.productionRating,
        formData.venueRating,
        formData.locationRating,
        formData.valueRating
      ].filter((r): r is number => typeof r === 'number' && r > 0);
      
        decimalAverage = categoryRatings.length > 0
        ? Number((categoryRatings.reduce((sum, r) => sum + r, 0) / categoryRatings.length).toFixed(1))
        : (formData.rating || 0);
      }
      
      const ticketPrice = formData.ticketPricePaid ? Number(formData.ticketPricePaid) : undefined;
      
      // Round category ratings to 1 decimal place
      const artistPerfRating = typeof formData.artistPerformanceRating === 'number' ? Number(formData.artistPerformanceRating.toFixed(1)) : undefined;
      const prodRating = typeof formData.productionRating === 'number' ? Number(formData.productionRating.toFixed(1)) : undefined;
      const venueRating = typeof formData.venueRating === 'number' ? Number(formData.venueRating.toFixed(1)) : undefined;
      const locationRating = typeof formData.locationRating === 'number' ? Number(formData.locationRating.toFixed(1)) : undefined;
      const valueRating = typeof formData.valueRating === 'number' ? Number(formData.valueRating.toFixed(1)) : undefined;
      
      // Trim feedback fields
      const artistPerfFeedback = formData.artistPerformanceFeedback?.trim() || undefined;
      const prodFeedback = formData.productionFeedback?.trim() || undefined;
      const venueFeedback = formData.venueFeedback?.trim() || undefined;
      const locationFeedback = formData.locationFeedback?.trim() || undefined;
      const valueFeedback = formData.valueFeedback?.trim() || undefined;
      
      const reviewData: ReviewData = {
        review_type: 'event',
        // Send decimal average rating (NUMERIC(3,1) supports decimals)
        rating: decimalAverage,
        artist_performance_rating: artistPerfRating,
        production_rating: prodRating,
        venue_rating: venueRating,
        location_rating: locationRating,
        value_rating: valueRating,
        artist_performance_feedback: artistPerfFeedback,
        production_feedback: prodFeedback,
        venue_feedback: venueFeedback,
        location_feedback: locationFeedback,
        value_feedback: valueFeedback,
        ticket_price_paid: typeof ticketPrice === 'number' && !Number.isNaN(ticketPrice) ? ticketPrice : undefined,
        review_text: (formData.reviewText.trim() + showsRankingBlock).trim() || undefined,
        photos: formData.photos && formData.photos.length > 0 ? formData.photos : undefined,
        videos: formData.videos && formData.videos.length > 0 ? formData.videos : undefined,
        // Preserve existing setlist when editing if not explicitly changed
        // If selectedSetlist is null, user cleared it; if undefined, preserve existing
        setlist: formData.selectedSetlist !== undefined ? formData.selectedSetlist : ((existingReview as any)?.setlist || undefined),
        custom_setlist: formData.customSetlist && formData.customSetlist.length > 0 ? formData.customSetlist : undefined,
        is_public: formData.isPublic,
      };

      console.log('🎵 EventReviewForm: Review data being saved:', {
        rating: reviewData.rating,
        decimalAverage,
        hasSetlist: !!reviewData.setlist,
        setlistData: reviewData.setlist,
        formDataSelectedSetlist: formData.selectedSetlist,
        hasCustomSetlist: !!reviewData.custom_setlist,
        customSetlistSongCount: reviewData.custom_setlist?.length || 0,
        // Debug category ratings
        categoryRatings: {
          artist_performance_rating: reviewData.artist_performance_rating,
          production_rating: reviewData.production_rating,
          venue_rating: reviewData.venue_rating,
          location_rating: reviewData.location_rating,
          value_rating: reviewData.value_rating,
        },
        categoryFeedback: {
          artist_performance_feedback: reviewData.artist_performance_feedback,
          production_feedback: reviewData.production_feedback,
          venue_feedback: reviewData.venue_feedback,
          location_feedback: reviewData.location_feedback,
          value_feedback: reviewData.value_feedback,
        },
        formDataRatings: {
          artistPerformanceRating: formData.artistPerformanceRating,
          productionRating: formData.productionRating,
          venueRating: formData.venueRating,
          locationRating: formData.locationRating,
          valueRating: formData.valueRating,
        },
        formDataFeedback: {
          artistPerformanceFeedback: formData.artistPerformanceFeedback,
          productionFeedback: formData.productionFeedback,
          venueFeedback: formData.venueFeedback,
          locationFeedback: formData.locationFeedback,
          valueFeedback: formData.valueFeedback,
        }
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
              const jambaseVenueId = `user-created-${Date.now()}`;
              const ins = await (supabase as any)
                .from('venues')
                .insert({
                  jambase_venue_id: jambaseVenueId, // Keep for backward compatibility during migration
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

      if (venueId && !isValidUUID(venueId)) {
        venueId = undefined;
      }

      // Allow reviews without event_id if we have artist_id and venue_id
      const safeEventId = isValidUUID(eventId) ? eventId : undefined;
      const safeVenueId = venueId && isValidUUID(venueId) ? venueId : undefined;
      const safeArtistId = artistProfileId && isValidUUID(artistProfileId) ? artistProfileId : undefined;
      
      // Require either event_id OR both artist_id and venue_id
      if (!safeEventId && (!safeArtistId || !safeVenueId)) {
        throw new Error('Unable to determine a valid event ID or artist+venue combination for this review.');
      }

      const review = await ReviewService.setEventReview(userId, safeEventId, reviewData, safeVenueId, safeArtistId);
      
      // Clear localStorage draft after successful submission
      if (safeEventId) {
        clearDraft(safeEventId);
      }
      
      // NUCLEAR OPTION: Delete ALL drafts for this user that match the same artist/venue/date
      // This handles the case where a new event was created, leaving an old draft with a different event_id
      try {
        console.log('🗑️ EventReviewForm: Starting NUCLEAR draft deletion:', { eventId: safeEventId, artistId: safeArtistId, venueId: safeVenueId });
        
        // First, delete drafts for this specific event (if eventId exists) or artist+venue (if no eventId)
        let deleteQuery = supabase
          .from('reviews')
          .delete()
          .eq('user_id', userId)
          .eq('is_draft', true)
          .select('id');
        
        if (safeEventId) {
          deleteQuery = deleteQuery.eq('event_id', safeEventId);
        } else if (safeArtistId && safeVenueId) {
          deleteQuery = deleteQuery
            .eq('artist_id', safeArtistId)
            .eq('venue_id', safeVenueId)
            .is('event_id', null);
        }
        
        const { error: deleteError, data: deletedData } = await deleteQuery;
        
        if (deleteError) {
          console.error('❌ EventReviewForm: First deletion failed:', deleteError);
        } else {
          const deletedCount = deletedData?.length || 0;
          console.log(`🧹 EventReviewForm: Deleted ${deletedCount} draft(s)`);
        }
        
        // CRITICAL: Also delete drafts that match the same artist/venue/date
        // This handles drafts created with a different event_id before the final event was created
        if (formData.selectedArtist?.name && formData.selectedVenue?.name && formData.eventDate) {
          console.log('🔍 EventReviewForm: Looking for matching drafts by artist/venue/date...');
          
          // Get all user's drafts
          const { data: allDrafts, error: draftsError } = await supabase
            .from('reviews')
            .select('id, event_id, draft_data, is_draft')
            .eq('user_id', userId)
            .eq('is_draft', true);
          
          if (!draftsError && allDrafts) {
            const matchingDrafts = allDrafts.filter(draft => {
              if (!draft.draft_data) return false;
              const draftData = draft.draft_data as any;
              const draftArtist = draftData?.selectedArtist?.name || draftData?.artist_name;
              const draftVenue = draftData?.selectedVenue?.name || draftData?.venue_name;
              const draftDate = draftData?.eventDate;
              
              const matches = draftArtist === formData.selectedArtist?.name &&
                             draftVenue === formData.selectedVenue?.name &&
                             draftDate === formData.eventDate;
              
              if (matches) {
                console.log(`🎯 EventReviewForm: Found matching draft ${draft.id} for same concert (different event_id)`);
              }
              return matches;
            });
            
            // Delete matching drafts
            for (const draft of matchingDrafts) {
              console.log(`🗑️ EventReviewForm: Deleting matching draft ${draft.id}`);
              await supabase
                .from('reviews')
                .delete()
                .eq('id', draft.id);
            }
            
            if (matchingDrafts.length > 0) {
              console.log(`🧹 EventReviewForm: Deleted ${matchingDrafts.length} matching draft(s) for same concert`);
            }
          }
        }
        
        // Wait a moment for database to catch up
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // VERIFY: Check if drafts still exist for this event
        const verifyResult = await supabase
          .from('reviews')
          .select('id, is_draft')
          .eq('user_id', userId)
          .eq('event_id', eventId)
          .eq('is_draft', true);
        
        if (verifyResult.data && verifyResult.data.length > 0) {
          console.error(`❌ EventReviewForm: ${verifyResult.data.length} draft(s) STILL EXIST! Force deleting...`, verifyResult.data);
          // Force delete any remaining drafts
          await supabase
            .from('reviews')
            .delete()
            .eq('user_id', userId)
            .eq('event_id', eventId)
            .eq('is_draft', true);
        } else {
          console.log('✅ EventReviewForm: Verified - all drafts for this event successfully deleted');
        }
      } catch (error) {
        console.error('❌ EventReviewForm: CRITICAL error during draft deletion:', error);
      }
      
      // Update events table with API setlist data ONLY (not custom setlist)
      // Custom setlist stays in user_reviews.custom_setlist column only
      if (formData.selectedSetlist) {
        try {
          console.log('🎵 EventReviewForm: Updating events with API setlist data:', {
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
          
          // Note: setlist_fm_id is not on the events table, only on jambase_events
          // The setlist data will be synced via trigger if needed
          
          const { error: updateError } = await supabase
            .from('events')
            .update(updateData)
            .eq('id', eventId);
          
          if (updateError) {
            console.error('🎵 Error updating events with setlist:', updateError);
          } else {
            console.log('🎵 Successfully updated events with setlist data');
          }
        } catch (error) {
          console.error('🎵 Error updating events with setlist:', error);
        }
      }
      
      try {
        const entityType = formData.reviewType === 'artist' ? 'artist' : (formData.reviewType === 'venue' ? 'venue' : 'event');
        const entityId = entityType === 'artist' ? (formData.selectedArtist?.id || eventId) : (entityType === 'venue' ? (venueId || formData.selectedVenue?.id || eventId) : eventId);
        trackInteraction.review(entityType, entityId, reviewData.rating as number, {
          artist_performance_rating: reviewData.artist_performance_rating,
          production_rating: reviewData.production_rating,
          venue_rating: reviewData.venue_rating,
          location_rating: reviewData.location_rating,
          value_rating: reviewData.value_rating,
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
              .from('users')
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
          artist_performance_rating: (review as any).artist_performance_rating,
          production_rating: (review as any).production_rating,
          venue_rating: review.venue_rating,
          location_rating: (review as any).location_rating,
          value_rating: (review as any).value_rating,
        });
        
        // Calculate the effective rating from the saved review (use decimal values if available)
        const ratingParts = [
          (review as any).artist_performance_rating,
          (review as any).production_rating,
          review.venue_rating
          (review as any).location_rating,
          (review as any).value_rating,
        ].filter((value): value is number => typeof value === 'number' && value > 0);

        const effectiveRating = ratingParts.length === 5
          ? ratingParts.reduce((sum, value) => sum + value, 0) / ratingParts.length
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
        // For edits, call onSubmitted immediately and await if async
        if (onSubmitted) {
          const result = onSubmitted(review);
          if (result instanceof Promise) {
            await result;
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Error submitting review:', e);
      toast({ title: 'Error', description: `Failed to submit review: ${msg}`, variant: 'destructive' });
      // Reset submission flag on error so auto-save can work again
      setIsReviewSubmitted(false);
    } finally {
      setLoading(false);
    }
  };

  const handleRankingModalClose = async () => {
    console.log('🚪 Ranking modal closing');
    setShowRankingModal(false);
    const reviewToSubmit = submittedReview;
    setSubmittedReview(null);
    resetForm();
    setIsReviewSubmitted(false); // Reset submission state for next review
    
    // NOW call the onSubmitted callback (which triggers navigation)
    // Await if it's async to ensure operations complete before proceeding
    if (onSubmitted && reviewToSubmit) {
      console.log('📞 Calling onSubmitted callback after modal close');
      const result = onSubmitted(reviewToSubmit);
      if (result instanceof Promise) {
        await result;
      }
    }
  };

  // Calculate effective rating for the ranking modal
  const getEffectiveRating = () => {
    const parts = [
      formData.artistPerformanceRating,
      formData.productionRating,
      formData.venueRating,
      formData.locationRating,
      formData.valueRating,
    ].filter((value): value is number => typeof value === 'number' && value > 0);

    if (parts.length > 0) {
      return parts.reduce((sum, value) => sum + value, 0) / parts.length;
    }
    return formData.rating;
  };

  const averageRatingForSummary = getEffectiveRating();
  const effectiveTotalSteps = totalSteps || REVIEW_FORM_TOTAL_STEPS;
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((currentStep / effectiveTotalSteps) * 100))
  );
  const stepLabels = getStepLabels(currentFlow || 'detailed');
  const nextStepLabel = currentStep < effectiveTotalSteps && stepLabels[currentStep] ? stepLabels[currentStep] : null;

  const categoryBreakdown = [
    {
      label: 'Artist performance',
      rating: formData.artistPerformanceRating,
      annotation: formData.artistPerformanceFeedback
    },
    {
      label: 'Production quality',
      rating: formData.productionRating,
      annotation: formData.productionFeedback
    },
    {
      label: 'Venue experience',
      rating: formData.venueRating,
      annotation: formData.venueFeedback
    },
    {
      label: 'Location & logistics',
      rating: formData.locationRating,
      annotation: formData.locationFeedback
    },
    {
      label: 'Value for ticket',
      rating: formData.valueRating,
      annotation: formData.valueFeedback
    }
  ];

  const renderSetlistSection = () => {
    const canImportSetlist = formData.selectedArtist?.name && formData.eventDate;
    
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsSetlistModalOpen(true)}
            disabled={!canImportSetlist}
            className="border-pink-200 text-pink-600 hover:bg-pink-50 w-full sm:w-auto"
          >
            <Music className="w-4 h-4 mr-2" />
            Import from setlist.fm
          </Button>
          {formData.selectedSetlist && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleClearSetlist}
              className="text-gray-500 hover:text-gray-700 w-full sm:w-auto"
            >
              Clear setlist
            </Button>
          )}
        </div>
        {!canImportSetlist && (
          <p className="text-xs text-gray-500">
            Select an artist (and date if you know it) to search official setlists.
          </p>
        )}

        {formData.selectedSetlist ? (
          <div className="rounded-xl border border-pink-100 bg-pink-50/40 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {formData.selectedSetlist.artist?.name || formData.selectedArtist?.name}
                </p>
                <p className="text-xs text-gray-600">
                  {formData.selectedSetlist.venue?.name}
                  {formData.selectedSetlist.eventDate && (
                    <> • {formatSetlistDate(formData.selectedSetlist.eventDate)}</>
                  )}
                </p>
              </div>
              <Badge variant="secondary" className="bg-white text-pink-600 border-pink-100">
                {formData.selectedSetlist.songCount} songs
              </Badge>
            </div>
            <ul className="grid gap-1 text-xs text-gray-700 sm:grid-cols-2">
              {(formData.selectedSetlist.songs || []).slice(0, 8).map((song: any, index: number) => (
                <li key={`${song.name}-${index}`} className="flex items-start gap-2">
                  <span className="font-medium text-pink-600">{index + 1}.</span>
                  <span className="flex-1">
                    {song.name}
                    {song.cover?.artist && (
                      <span className="block text-[11px] text-gray-500">Cover: {song.cover.artist}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {Array.isArray(formData.selectedSetlist.songs) && formData.selectedSetlist.songs.length > 8 && (
              <p className="text-[11px] text-gray-500">
                +{formData.selectedSetlist.songs.length - 8} more in the setlist
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            Can't find it? Add your own setlist below so other fans know what was played.
          </p>
        )}

        <CustomSetlistInput
          songs={(formData.customSetlist as any) || []}
          onChange={handleCustomSetlistChange}
          disabled={!!formData.selectedSetlist}
          className="mt-2"
        />
      </div>
    );
  };

  const renderArtistExtras = () => {
    const canImportSetlist = Boolean(formData.selectedArtist?.name);

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsSetlistModalOpen(true)}
            disabled={!canImportSetlist}
            className="border-pink-200 text-pink-600 hover:bg-pink-50 w-full sm:w-auto"
          >
            <Music className="w-4 h-4 mr-2" />
            Import from setlist.fm
          </Button>
          {formData.selectedSetlist && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleClearSetlist}
              className="text-gray-500 hover:text-gray-700 w-full sm:w-auto"
            >
              Clear setlist
            </Button>
          )}
        </div>
        {!canImportSetlist && (
          <p className="text-xs text-gray-500">
            Select an artist (and date if you know it) to search official setlists.
          </p>
        )}

        {formData.selectedSetlist ? (
          <div className="rounded-xl border border-pink-100 bg-pink-50/40 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {formData.selectedSetlist.artist?.name || formData.selectedArtist?.name}
                </p>
                <p className="text-xs text-gray-600">
                  {formData.selectedSetlist.venue?.name}
                  {formData.selectedSetlist.eventDate && (
                    <> • {formatSetlistDate(formData.selectedSetlist.eventDate)}</>
                  )}
                </p>
              </div>
              <Badge variant="secondary" className="bg-white text-pink-600 border-pink-100">
                {formData.selectedSetlist.songCount} songs
              </Badge>
            </div>
            <ul className="grid gap-1 text-xs text-gray-700 sm:grid-cols-2">
              {(formData.selectedSetlist.songs || []).slice(0, 8).map((song: any, index: number) => (
                <li key={`${song.name}-${index}`} className="flex items-start gap-2">
                  <span className="font-medium text-pink-600">{index + 1}.</span>
                  <span className="flex-1">
                    {song.name}
                    {song.cover?.artist && (
                      <span className="block text-[11px] text-gray-500">Cover: {song.cover.artist}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {Array.isArray(formData.selectedSetlist.songs) && formData.selectedSetlist.songs.length > 8 && (
              <p className="text-[11px] text-gray-500">
                +{formData.selectedSetlist.songs.length - 8} more in the setlist
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            Can’t find it? Add your own setlist below so other fans know what was played.
          </p>
        )}

        <CustomSetlistInput
          songs={(formData.customSetlist as any) || []}
          onChange={handleCustomSetlistChange}
          disabled={!!formData.selectedSetlist}
          className="mt-2"
        />
      </div>
    );
  };

  const renderStepContent = () => {
    const flow = currentFlow || 'detailed'; // Default to detailed for backward compatibility
    const stepLabels = getStepLabels(flow);

    // Step 1: Time selection (always first)
    if (currentStep === 1) {
      return (
        <TimeSelectionStep
          reviewDuration={formData.reviewDuration}
          onSelectDuration={(duration) => {
            updateFormData({ reviewDuration: duration });
            // Auto-advance to next step after selection
            setTimeout(() => nextStep(), 100);
          }}
        />
      );
    }

    // Flow-specific step rendering
    switch (flow) {
      case 'quick': // 1-minute flow
        // Step 2: Event details
        if (currentStep === 2) {
        return <EventDetailsStep formData={formData} errors={errors} onUpdateFormData={updateFormData} />;
        }
        // Step 3: Quick review (rating + text + optional setlist)
        if (currentStep === 3) {
          return (
            <QuickReviewStep
              formData={formData}
              errors={errors}
              onUpdateFormData={updateFormData}
              artistName={formData.selectedArtist?.name}
              venueName={formData.selectedVenue?.name}
              eventDate={formData.eventDate}
            />
          );
        }
        // Step 4: Submit
        if (currentStep === 4) {
          return (
            <PrivacySubmitStep
              formData={formData}
              errors={errors}
              onUpdateFormData={updateFormData}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              averageRating={formData.rating}
              categoryBreakdown={[]}
            />
          );
        }
        break;

      case 'standard': // 3-minute flow
        // Step 2: Event details
        if (currentStep === 2) {
          return <EventDetailsStep formData={formData} errors={errors} onUpdateFormData={updateFormData} />;
        }
        // Step 3: Artist Performance
        if (currentStep === 3) {
        return (
          <CategoryStep
            config={categoryConfigs[2]}
            formData={formData}
            errors={errors}
            onUpdateFormData={updateFormData}
          >
            {renderArtistExtras()}
          </CategoryStep>
        );
        }
        // Step 4: Venue
        if (currentStep === 4) {
          return (
            <CategoryStep
              config={categoryConfigs[4]}
              formData={formData}
              errors={errors}
              onUpdateFormData={updateFormData}
              previousVenueReview={previousVenueReview}
            />
          );
        }
        // Step 5: Review content (with setlist)
        if (currentStep === 5) {
          return (
            <>
              <ReviewContentStep 
                formData={formData} 
                errors={errors} 
                onUpdateFormData={updateFormData}
                maxCharacters={400}
              />
              {/* Add setlist section */}
              <div className="mt-8 space-y-4">
                <Label className="text-base font-semibold text-gray-900">Setlist (Optional)</Label>
                {renderSetlistSection()}
              </div>
            </>
          );
        }
        // Step 6: Submit
        if (currentStep === 6) {
          const avgRating = formData.artistPerformanceRating > 0 && formData.venueRating > 0
            ? (formData.artistPerformanceRating + formData.venueRating) / 2
            : formData.rating;
          return (
            <PrivacySubmitStep
              formData={formData}
              errors={errors}
              onUpdateFormData={updateFormData}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              averageRating={avgRating}
              categoryBreakdown={[
                { label: 'Artist Performance', rating: formData.artistPerformanceRating },
                { label: 'Venue', rating: formData.venueRating },
              ]}
            />
          );
        }
        break;

      case 'detailed': // 5-minute flow (original flow)
        // Step 2: Event details
        if (currentStep === 2) {
          return <EventDetailsStep formData={formData} errors={errors} onUpdateFormData={updateFormData} />;
        }
        // Step 3: Artist Performance
        if (currentStep === 3) {
          return (
            <CategoryStep
              config={categoryConfigs[2]}
              formData={formData}
              errors={errors}
              onUpdateFormData={updateFormData}
            >
              {renderArtistExtras()}
            </CategoryStep>
          );
        }
        // Step 4: Production
        if (currentStep === 4) {
        return (
          <CategoryStep
            config={categoryConfigs[3]}
            formData={formData}
            errors={errors}
            onUpdateFormData={updateFormData}
          />
        );
        }
        // Step 5: Venue
        if (currentStep === 5) {
        return (
          <CategoryStep
            config={categoryConfigs[4]}
            formData={formData}
            errors={errors}
            onUpdateFormData={updateFormData}
            previousVenueReview={previousVenueReview}
          />
        );
        }
        // Step 6: Location
        if (currentStep === 6) {
        return (
          <CategoryStep
            config={categoryConfigs[5]}
            formData={formData}
            errors={errors}
            onUpdateFormData={updateFormData}
            previousVenueReview={previousVenueReview}
          />
        );
        }
        // Step 7: Value
        if (currentStep === 7) {
        return (
          <CategoryStep
            config={categoryConfigs[6]}
            formData={formData}
            errors={errors}
            onUpdateFormData={updateFormData}
          >
            <div className="space-y-3">
              <Label htmlFor="ticketPricePaid" className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-pink-500" />
                What did you pay? (kept private)
              </Label>
              <Input
                id="ticketPricePaid"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 78.50"
                value={formData.ticketPricePaid}
                onChange={(event) => updateFormData({ ticketPricePaid: event.target.value })}
              />
              <p className="text-xs text-gray-500">
                Only you can see this number. It helps calibrate value for other fans.
              </p>
            </div>
          </CategoryStep>
        );
        }
        // Step 8: Review content (with setlist)
        if (currentStep === 8) {
          return (
            <>
              <ReviewContentStep 
                formData={formData} 
                errors={errors} 
                onUpdateFormData={updateFormData}
                maxCharacters={500}
              />
              {/* Add setlist section */}
              <div className="mt-8 space-y-4">
                <Label className="text-base font-semibold text-gray-900">Setlist (Optional)</Label>
                {renderSetlistSection()}
              </div>
            </>
          );
        }
        // Step 9: Submit
        if (currentStep === 9) {
        return (
          <PrivacySubmitStep
            formData={formData}
            errors={errors}
            onUpdateFormData={updateFormData}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            averageRating={averageRatingForSummary}
            categoryBreakdown={categoryBreakdown}
          />
        );
    }
        break;
    }
    
    return null;
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
              if (onClose) {
                onClose();
              }
            }}
            onNewReview={() => {
              setCurrentDraft(null);
              resetForm();
              setIsReviewSubmitted(false); // Reset submission state for new review
            }}
            currentMode={currentDraft ? 'draft' : 'new'}
          />
        )}

        {!existingReview && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <div className="w-2 h-2 bg-blue-400 rounded-full" />
              <span>Your progress is automatically saved locally</span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-pink-500 font-semibold">
                Step {currentStep} of {totalSteps || REVIEW_FORM_TOTAL_STEPS}
              </p>
              <h3 className="text-lg font-semibold text-gray-900 mt-1">
                {getStepLabels(currentFlow || 'detailed')[currentStep - 1] || 'Review'}
              </h3>
            </div>
            <div className="w-full md:w-72 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-pink-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {getStepLabels(currentFlow || 'detailed').map((label, index) => {
              const stepNumber = index + 1;
              const isActive = stepNumber === currentStep;
              const isComplete = stepNumber < currentStep;
              return (
                <span
                  key={`${label}-${index}`}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-pink-500 text-white shadow-sm'
                      : isComplete
                        ? 'bg-pink-100 text-pink-700'
                        : 'bg-gray-100 text-gray-500'
                  )}
                >
                  {stepNumber}. {label}
                </span>
              );
            })}
          </div>
        </div>

        <div className="min-h-[420px]">
          {renderStepContent()}
        </div>

        <div className="space-y-4 border-t pt-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <Button
              variant="ghost"
              onClick={prevStep}
              disabled={!canGoBack}
              className="md:w-auto"
            >
              Back
            </Button>

            <div className="flex items-center gap-3 text-xs text-gray-500">
              {isSaving ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  <span>Auto-saving…</span>
                </div>
              ) : lastSaveTime ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full" />
                  <span>Auto-saved {lastSaveTime.toLocaleTimeString()}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-300 rounded-full" />
                  <span>Auto-save active - your progress is saved automatically</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Manual save button removed - auto-save handles everything automatically */}
              {currentStep < (totalSteps || REVIEW_FORM_TOTAL_STEPS) && (
                <Button
                  onClick={nextStep}
                  disabled={!canProceed}
                  className="bg-pink-500 hover:bg-pink-600"
                >
                  Next
                  {nextStepLabel ? `: ${nextStepLabel}` : ''}
                </Button>
              )}
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

                    try {
                      trackInteraction.click('review', event.id, { action: 'delete', source: 'event_review_form' });
                    } catch {}

                    toast({
                      title: 'Review Deleted',
                      description: 'Your review has been deleted.'
                    });

                    setExistingReview(null);
                    resetForm();
                    setIsReviewSubmitted(false); // Reset submission state after deletion

                    if (onDeleted) {
                      console.log('📢 Calling onDeleted callback');
                      // Await the callback if it returns a Promise (async function)
                      const result = onDeleted();
                      if (result instanceof Promise) {
                        await result;
                      }
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
      </div>

      <SetlistModal
        isOpen={isSetlistModalOpen}
        onClose={() => setIsSetlistModalOpen(false)}
        artistName={formData.selectedArtist?.name || ''}
        venueName={formData.selectedVenue?.name || undefined}
        eventDate={formData.eventDate || undefined}
        onSetlistSelect={handleSetlistSelect}
      />

      {submittedReview && (
        <PostSubmitRankingModal
          isOpen={showRankingModal}
          onClose={handleRankingModalClose}
          userId={userId}
          newReview={submittedReview}
          rating={getEffectiveRating()}
        />
      )}
    </>
  );
}


