import { useState, useCallback } from 'react';
import type { Artist } from '@/types/concertSearch';
import type { VenueSearchResult } from '@/services/unifiedVenueSearchService';
import type { CustomSetlistSong } from '@/services/reviewService';

export interface ReviewFormData {
  // Step 1: Event Details
  selectedArtist: Artist | null;
  selectedVenue: VenueSearchResult | null;
  eventDate: string;
  selectedSetlist: any | null; // SetlistData from setlistService (API verified)
  customSetlist: CustomSetlistSong[]; // User-created custom setlist
  
  // Category steps: five independent rating sections
  artistPerformanceRating: number; // Artist performance quality (0.5-5.0)
  productionRating: number; // Production quality (sound, lights, visuals)
  venueRating: number; // Venue staff, amenities, comfort
  locationRating: number; // Neighborhood, transportation, logistics
  valueRating: number; // Value for the price paid

  artistPerformanceFeedback: string;
  productionFeedback: string;
  venueFeedback: string;
  locationFeedback: string;
  valueFeedback: string;

  artistPerformanceRecommendation: string;
  productionRecommendation: string;
  venueRecommendation: string;
  locationRecommendation: string;
  valueRecommendation: string;

  ticketPricePaid: string;

  rating: number; // Overall rating (calculated as average of the three)
  
  // Step 3: Review Content
  reviewText: string;
  reactionEmoji: string;
  photos: string[]; // Photo URLs uploaded to storage
  videos: string[]; // Video URLs uploaded to storage
  attendees: Array<{ type: 'user'; user_id: string; name: string; avatar_url?: string } | { type: 'phone'; phone: string; name?: string }>; // People who attended with the reviewer
  metOnSynth: boolean; // Track if users met/planned on Synth (for admin dashboard)
  
  // Step 4: Privacy
  isPublic: boolean;
  
  // Review type
  reviewType: 'event' | 'venue' | 'artist';
}

export interface ReviewFormState {
  currentStep: number;
  formData: ReviewFormData;
  errors: Record<string, string>;
  isLoading: boolean;
  isValid: boolean;
}

export const REVIEW_FORM_TOTAL_STEPS = 8;

const initialFormData: ReviewFormData = {
  selectedArtist: null,
  selectedVenue: null,
  eventDate: '',
  selectedSetlist: null,
  customSetlist: [],
  artistPerformanceRating: 0,
  productionRating: 0,
  venueRating: 0,
  locationRating: 0,
  valueRating: 0,
  artistPerformanceFeedback: '',
  productionFeedback: '',
  venueFeedback: '',
  locationFeedback: '',
  valueFeedback: '',
  artistPerformanceRecommendation: '',
  productionRecommendation: '',
  venueRecommendation: '',
  locationRecommendation: '',
  valueRecommendation: '',
  ticketPricePaid: '',
  rating: 0,
  reviewText: '',
  reactionEmoji: '',
  photos: [],
  videos: [],
  attendees: [],
  metOnSynth: false,
  isPublic: true,
  reviewType: 'event',
};

export function useReviewForm() {
  const [state, setState] = useState<ReviewFormState>({
    currentStep: 1,
    formData: initialFormData,
    errors: {},
    isLoading: false,
    isValid: false,
  });

  const validateStep = useCallback((step: number, data: ReviewFormData): Record<string, string> => {
    const errors: Record<string, string> = {};

    switch (step) {
      case 1:
        console.log('🔍 validateStep 1 - checking:', {
          selectedArtist: !!data.selectedArtist,
          selectedVenue: !!data.selectedVenue,
          eventDate: !!data.eventDate,
          selectedVenueName: data.selectedVenue?.name
        });
        
        if (!data.selectedArtist) {
          errors.selectedArtist = 'Please select an artist';
        }
        if (!data.selectedVenue) {
          errors.selectedVenue = 'Please select a venue';
        }
        if (!data.eventDate) {
          errors.eventDate = 'Please select a date';
        }
        
        console.log('🔍 validateStep 1 - errors:', errors);
        break;
      case 2:
        if (!data.artistPerformanceRating || data.artistPerformanceRating < 0.5 || data.artistPerformanceRating > 5.0) {
          errors.artistPerformanceRating = 'Please rate the artist performance (0.5 - 5 stars)';
        }
        break;
      case 3:
        if (!data.productionRating || data.productionRating < 0.5 || data.productionRating > 5.0) {
          errors.productionRating = 'Please rate the production quality (0.5 - 5 stars)';
        }
        break;
      case 4:
        if (!data.venueRating || data.venueRating < 0.5 || data.venueRating > 5.0) {
          errors.venueRating = 'Please rate the venue (0.5 - 5 stars)';
        }
        break;
      case 5:
        if (!data.locationRating || data.locationRating < 0.5 || data.locationRating > 5.0) {
          errors.locationRating = 'Please rate the location & logistics (0.5 - 5 stars)';
        }
        break;
      case 6:
        if (!data.valueRating || data.valueRating < 0.5 || data.valueRating > 5.0) {
          errors.valueRating = 'Please rate the value for the ticket (0.5 - 5 stars)';
        }
        if (data.ticketPricePaid && Number.isNaN(Number(data.ticketPricePaid))) {
          errors.ticketPricePaid = 'Ticket price must be a valid number';
        } else if (data.ticketPricePaid && Number(data.ticketPricePaid) < 0) {
          errors.ticketPricePaid = 'Ticket price cannot be negative';
        }
        break;
      case 7:
        // Review text is required per new design
        if (!data.reviewText) {
          errors.reviewText = 'Please share a brief description of your experience';
        } else if (data.reviewText.length > 500) {
          errors.reviewText = 'Review text must be 500 characters or less';
        }
        break;
      case 8:
        // Privacy is always valid (has default value)
        break;
    }

    return errors;
  }, []);

  // Helper function to calculate overall rating from five categories
  const calculateOverallRating = useCallback((data: ReviewFormData) => {
    const parts: number[] = [];
    if (data.artistPerformanceRating && data.artistPerformanceRating > 0) parts.push(data.artistPerformanceRating);
    if (data.productionRating && data.productionRating > 0) parts.push(data.productionRating);
    if (data.venueRating && data.venueRating > 0) parts.push(data.venueRating);
    if (data.locationRating && data.locationRating > 0) parts.push(data.locationRating);
    if (data.valueRating && data.valueRating > 0) parts.push(data.valueRating);
    if (parts.length === 0) return 0;
    const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
    return Math.round(avg * 10) / 10; // Round to nearest 0.1 for finer UX display
  }, []);

  const updateFormData = useCallback((updates: Partial<ReviewFormData>) => {
    console.log('🔄 useReviewForm: updateFormData called with:', updates);
    setState(prev => {
      const newFormData = { ...prev.formData, ...updates };
      
      console.log('🔄 useReviewForm: Previous formData:', prev.formData);
      console.log('🔄 useReviewForm: New formData:', newFormData);
      
      // Auto-calculate overall rating if any of the five ratings are updated
      if (
        updates.artistPerformanceRating !== undefined ||
        updates.productionRating !== undefined ||
        updates.venueRating !== undefined ||
        updates.locationRating !== undefined ||
        updates.valueRating !== undefined
      ) {
        newFormData.rating = calculateOverallRating(newFormData);
      }
      
      const stepErrors = validateStep(prev.currentStep, newFormData);
      const isValid = Object.keys(stepErrors).length === 0;
      
      console.log('🔄 useReviewForm: Step validation errors:', stepErrors);
      console.log('🔄 useReviewForm: Form is valid:', isValid);
      
      return {
        ...prev,
        formData: newFormData,
        errors: stepErrors,
        isValid,
      };
    });
  }, [validateStep, calculateOverallRating]);

  const nextStep = useCallback(() => {
    setState(prev => {
      const stepErrors = validateStep(prev.currentStep, prev.formData);
      const isValid = Object.keys(stepErrors).length === 0;
      
      if (!isValid) {
        return {
          ...prev,
          errors: stepErrors,
        };
      }

      const nextStepNumber = Math.min(prev.currentStep + 1, REVIEW_FORM_TOTAL_STEPS);
      return {
        ...prev,
        currentStep: nextStepNumber,
        errors: {},
        isValid: true,
      };
    });
  }, [validateStep]);

  const prevStep = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 1),
      errors: {},
    }));
  }, []);

  const setStep = useCallback((step: number) => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(1, Math.min(step, REVIEW_FORM_TOTAL_STEPS)),
      errors: {},
    }));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }));
  }, []);

  const resetForm = useCallback(() => {
    setState({
      currentStep: 1,
      formData: initialFormData,
      errors: {},
      isLoading: false,
      isValid: false,
    });
  }, []);

  const setFormData = useCallback((data: Partial<ReviewFormData>) => {
    setState(prev => {
      const newFormData = { ...prev.formData, ...data };
      if (
        data.artistPerformanceRating !== undefined ||
        data.productionRating !== undefined ||
        data.venueRating !== undefined ||
        data.locationRating !== undefined ||
        data.valueRating !== undefined
      ) {
        newFormData.rating = calculateOverallRating(newFormData as ReviewFormData);
      }
      const stepErrors = validateStep(prev.currentStep, newFormData);
      const isValid = Object.keys(stepErrors).length === 0;
      
      return {
        ...prev,
        formData: newFormData,
        errors: stepErrors,
        isValid,
      };
    });
  }, [validateStep, calculateOverallRating]);

  return {
    ...state,
    updateFormData,
    nextStep,
    prevStep,
    setStep,
    setLoading,
    resetForm,
    setFormData,
    canProceed: state.isValid,
    canGoBack: state.currentStep > 1,
    isLastStep: state.currentStep === REVIEW_FORM_TOTAL_STEPS,
  };
}
