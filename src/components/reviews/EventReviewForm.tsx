import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import { useReviewForm, REVIEW_FORM_TOTAL_STEPS } from '@/hooks/useReviewForm';
import { ReviewService, type ReviewData, type UserReview, type PublicReviewWithProfile } from '@/services/reviewService';
import { EventDetailsStep } from './ReviewFormSteps/EventDetailsStep';
import { CategoryStep, type CategoryConfig } from './ReviewFormSteps/CategoryStep';
import { ReviewContentStep } from './ReviewFormSteps/ReviewContentStep';
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

const STEP_LABELS = [
  'Event details',
  'Artist performance',
  'Production quality',
  'Venue experience',
  'Location & logistics',
  'Value for ticket',
  'Story & media',
  'Privacy & submit',
];

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
    setFormData,
    currentStep,
    nextStep,
    prevStep,
    canProceed,
    canGoBack,
    isLastStep
  } = useReviewForm();

  const [existingReview, setExistingReview] = useState<UserReview | null>(null);
  const [shows] = useState<ShowEntry[]>([]);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [submittedReview, setSubmittedReview] = useState<UserReview | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
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
        recommendationKey: 'artistPerformanceRecommendation',
        helperText: 'Tap a star (half points allowed) to capture the performance.',
        suggestions: ARTIST_SUGGESTIONS,
      },
      3: {
        title: 'Production Quality',
        subtitle: 'Lights, visuals, sound mix — did the production elevate the night?',
        ratingKey: 'productionRating',
        feedbackKey: 'productionFeedback',
        recommendationKey: 'productionRecommendation',
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
        recommendationKey: 'venueRecommendation',
        helperText: 'Include staff vibes, comfort, and amenities.',
        suggestions: VENUE_SUGGESTIONS,
      },
      5: {
        title: 'Location & Logistics',
        subtitle: 'Getting there, getting home, nearby spots — how easy was the night?',
        ratingKey: 'locationRating',
        feedbackKey: 'locationFeedback',
        recommendationKey: 'locationRecommendation',
        helperText: 'Parking, transit, food options, safety — it all counts.',
        suggestions: LOCATION_SUGGESTIONS,
      },
      6: {
        title: 'Value for Ticket Price',
        subtitle: 'Given what you paid, did the experience feel worth it?',
        ratingKey: 'valueRating',
        feedbackKey: 'valueFeedback',
        recommendationKey: 'valueRecommendation',
        helperText: 'Honest value helps fans budget for future shows.',
        suggestions: VALUE_SUGGESTIONS,
      },
    };
  }, [formData.selectedArtist?.name, formData.selectedVenue?.name]);

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
      if (isValidUUID(actualEventId)) {
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
        const resolvedVenueId =
          formData.selectedVenue?.is_from_database &&
          isValidUUID(formData.selectedVenue.id)
            ? formData.selectedVenue.id
            : null;

        const insertPayload: any = {
          title: `${formData.selectedArtist.name} at ${formData.selectedVenue.name}`,
          artist_name: formData.selectedArtist.name,
          venue_name: formData.selectedVenue.name,
          ...(resolvedVenueId ? { venue_id: resolvedVenueId } : {}),
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
            if (isValidUUID(review.event_id)) {
              const { data: eventData } = await (supabase as any)
                .from('jambase_events')
                .select('artist_name, artist_id, venue_name, venue_id, event_date')
                .eq('id', review.event_id)
                .single();
              
              if (eventData) {
                eventDetails = eventData;
                console.log('🎯 Fetched event details for review:', eventDetails);
              }
            } else {
              console.warn('⚠️ review.event_id is not a valid UUID, skipping jambase_events lookup', review.event_id);
            }
          }
          
          const eventDateFromReview = eventDetails?.event_date
            ? String(eventDetails.event_date).split('T')[0]
            : (review.created_at || '').split('T')[0];

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
            artistPerformanceRecommendation: review.artist_performance_recommendation || '',
            productionRecommendation: review.production_recommendation || '',
            venueRecommendation: review.venue_recommendation || '',
            locationRecommendation: review.location_recommendation || '',
            valueRecommendation: review.value_recommendation || '',
            ticketPricePaid: review.ticket_price_paid ? String(review.ticket_price_paid) : '',
            rating: review.rating,
            reviewText: review.review_text || '',
            reactionEmoji: review.reaction_emoji || '',
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

    // Step 3: Review Text Validation
    if (!formData.reviewText || formData.reviewText.trim() === '') {
      validationErrors.push('Please share a brief description of your experience');
    } else if (formData.reviewText.length > 500) {
      validationErrors.push('Review text must be 500 characters or less');
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
        
        // Resolve venue_id only if we have a real UUID (user-created placeholders will fail Supabase)
        const resolvedVenueId =
          formData.selectedVenue?.is_from_database &&
          isValidUUID(formData.selectedVenue.id)
            ? formData.selectedVenue.id
            : null;

        // Attempt insert; if it fails due to schema, degrade to minimal payload
        let insertPayload: any = {
          title: `${formData.selectedArtist?.name || 'Concert'} at ${formData.selectedVenue?.name || 'Venue'}`,
          artist_name: formData.selectedArtist?.name || '',
          venue_name: formData.selectedVenue?.name || '',
          ...(resolvedVenueId ? { venue_id: resolvedVenueId } : {}),
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
        setActualEventId(ins.data.id);
        
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
      const categoryNotes = [
        formData.artistPerformanceFeedback?.trim() || formData.artistPerformanceRecommendation
          ? `Artist performance: ${formData.artistPerformanceFeedback?.trim() || formData.artistPerformanceRecommendation}`
          : '',
        formData.productionFeedback?.trim() || formData.productionRecommendation
          ? `Production: ${formData.productionFeedback?.trim() || formData.productionRecommendation}`
          : '',
        formData.venueFeedback?.trim() || formData.venueRecommendation
          ? `Venue: ${formData.venueFeedback?.trim() || formData.venueRecommendation}`
          : '',
        formData.locationFeedback?.trim() || formData.locationRecommendation
          ? `Location: ${formData.locationFeedback?.trim() || formData.locationRecommendation}`
          : '',
        formData.valueFeedback?.trim() || formData.valueRecommendation
          ? `Value: ${formData.valueFeedback?.trim() || formData.valueRecommendation}`
          : '',
      ].filter(Boolean).join('\n');

      const combinedReviewText = [
        formData.reviewText.trim(),
        categoryNotes
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
      const decimalAverage = formData.rating || 0;
      const integerOverall = Math.max(1, Math.min(5, Math.round(decimalAverage))) as any;
      const ticketPrice = formData.ticketPricePaid ? Number(formData.ticketPricePaid) : undefined;
      const reviewData: ReviewData = {
        review_type: 'event',
        // Send integer overall rating to satisfy NOT NULL integer column; decimals go to category columns
        rating: integerOverall,
        artist_performance_rating: formData.artistPerformanceRating || undefined,
        production_rating: formData.productionRating || undefined,
        venue_rating: formData.venueRating || undefined,
        location_rating: formData.locationRating || undefined,
        value_rating: formData.valueRating || undefined,
        artist_performance_feedback: formData.artistPerformanceFeedback || undefined,
        production_feedback: formData.productionFeedback || undefined,
        venue_feedback: formData.venueFeedback || undefined,
        location_feedback: formData.locationFeedback || undefined,
        value_feedback: formData.valueFeedback || undefined,
        artist_performance_recommendation: formData.artistPerformanceRecommendation || undefined,
        production_recommendation: formData.productionRecommendation || undefined,
        venue_recommendation: formData.venueRecommendation || undefined,
        location_recommendation: formData.locationRecommendation || undefined,
        value_recommendation: formData.valueRecommendation || undefined,
        ticket_price_paid: typeof ticketPrice === 'number' && !Number.isNaN(ticketPrice) ? ticketPrice : undefined,
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

      if (venueId && !isValidUUID(venueId)) {
        venueId = undefined;
      }

    if (!isValidUUID(eventId)) {
      throw new Error('Unable to determine a valid event ID for this review.');
    }

      const safeVenueId = venueId && isValidUUID(venueId) ? venueId : undefined;
      const review = await ReviewService.setEventReview(userId, eventId, reviewData, safeVenueId);
      
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
          review.venue_rating,
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
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((currentStep / REVIEW_FORM_TOTAL_STEPS) * 100))
  );
  const nextStepLabel = currentStep < REVIEW_FORM_TOTAL_STEPS ? STEP_LABELS[currentStep] : null;

  const categoryBreakdown = [
    {
      label: 'Artist performance',
      rating: formData.artistPerformanceRating,
      annotation: formData.artistPerformanceRecommendation || formData.artistPerformanceFeedback
    },
    {
      label: 'Production quality',
      rating: formData.productionRating,
      annotation: formData.productionRecommendation || formData.productionFeedback
    },
    {
      label: 'Venue experience',
      rating: formData.venueRating,
      annotation: formData.venueRecommendation || formData.venueFeedback
    },
    {
      label: 'Location & logistics',
      rating: formData.locationRating,
      annotation: formData.locationRecommendation || formData.locationFeedback
    },
    {
      label: 'Value for ticket',
      rating: formData.valueRating,
      annotation: formData.valueRecommendation || formData.valueFeedback
    }
  ];

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
    switch (currentStep) {
      case 1:
        return <EventDetailsStep formData={formData} errors={errors} onUpdateFormData={updateFormData} />;
      case 2:
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
      case 3:
        return (
          <CategoryStep
            config={categoryConfigs[3]}
            formData={formData}
            errors={errors}
            onUpdateFormData={updateFormData}
          />
        );
      case 4:
        return (
          <CategoryStep
            config={categoryConfigs[4]}
            formData={formData}
            errors={errors}
            onUpdateFormData={updateFormData}
          />
        );
      case 5:
        return (
          <CategoryStep
            config={categoryConfigs[5]}
            formData={formData}
            errors={errors}
            onUpdateFormData={updateFormData}
          />
        );
      case 6:
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
      case 7:
        return <ReviewContentStep formData={formData} errors={errors} onUpdateFormData={updateFormData} />;
      case 8:
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
      default:
        return null;
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
                Step {currentStep} of {REVIEW_FORM_TOTAL_STEPS}
              </p>
              <h3 className="text-lg font-semibold text-gray-900 mt-1">
                {STEP_LABELS[currentStep - 1]}
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
            {STEP_LABELS.map((label, index) => {
              const stepNumber = index + 1;
              const isActive = stepNumber === currentStep;
              const isComplete = stepNumber < currentStep;
              return (
                <span
                  key={label}
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
                  <span>Saving…</span>
                </div>
              ) : lastSaveTime ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full" />
                  <span>Saved {lastSaveTime.toLocaleTimeString()}</span>
                </div>
              ) : (
                <span>Progress auto-saves at each step</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!existingReview && (
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={isLoading}
                  className="border-gray-300"
                >
                  Save as Draft
                </Button>
              )}
              {currentStep < REVIEW_FORM_TOTAL_STEPS && (
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


