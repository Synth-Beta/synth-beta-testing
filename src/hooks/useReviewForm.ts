import { useState, useCallback } from 'react';
import type { Artist } from '@/types/concertSearch';
import type { VenueSearchResult } from '@/services/unifiedVenueSearchService';
import type { CustomSetlistSong } from '@/services/reviewService';

export interface ReviewCustomSetlist {
  id: string;
  title: string;
  isAutoTitle: boolean;
  songs: CustomSetlistSong[];
}

export interface ReviewFormData {
  // Step 0: Time Selection
  reviewDuration: '1min' | '3min' | '5min' | null;
  
  // Step 1: Event Details
  selectedArtist: Artist | null;
  selectedVenue: VenueSearchResult | null;
  eventDate: string;
  selectedSetlist: any | null; // SetlistData from setlistService (API verified)
  // Multiple user-created custom setlists for this review
  customSetlists: ReviewCustomSetlist[];
  
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

  ticketPricePaid: string;

  rating: number; // Overall rating (calculated as average of available category ratings)
  
  // Review Content
  reviewText: string;
  photos: string[]; // Photo URLs uploaded to storage
  videos: string[]; // Video URLs uploaded to storage
  attendees: Array<{ type: 'user'; user_id: string; name: string; avatar_url?: string } | { type: 'phone'; phone: string; name?: string }>; // People who attended with the reviewer
  metOnSynth: boolean; // Track if users met/planned on Synth (for admin dashboard)
  
  // Privacy
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

// Dynamic step calculation based on review duration
export const getTotalSteps = (duration: '1min' | '3min' | '5min' | null): number => {
  switch(duration) {
    case '1min': return 4; // Time selection, Event details, Quick review (rating + text + optional setlist), Submit
    case '3min': return 6; // Time selection, Event details, Categories (2), Review content (text + optional photos + optional setlist), Submit
    case '5min': return 9; // Time selection, Event details, All 5 categories, Review content (text + optional media + optional setlist), Submit
    default: return 1; // Just time selection
  }
};

export const REVIEW_FORM_TOTAL_STEPS = 8; // Legacy constant for backward compatibility

const initialFormData: ReviewFormData = {
  reviewDuration: null,
  selectedArtist: null,
  selectedVenue: null,
  eventDate: '',
  selectedSetlist: null,
  customSetlists: [],
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
  ticketPricePaid: '',
  rating: 0,
  reviewText: '',
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

  // Helper to get current flow based on duration
  const getCurrentFlow = (duration: '1min' | '3min' | '5min' | null): 'quick' | 'standard' | 'detailed' | null => {
    switch(duration) {
      case '1min': return 'quick';
      case '3min': return 'standard';
      case '5min': return 'detailed';
      default: return null;
    }
  };

  // Get total steps based on duration
  const getTotalStepsForDuration = (duration: '1min' | '3min' | '5min' | null): number => {
    return getTotalSteps(duration);
  };

  const validateStep = useCallback((step: number, data: ReviewFormData): Record<string, string> => {
    const errors: Record<string, string> = {};
    const flow = getCurrentFlow(data.reviewDuration);
    const totalSteps = getTotalStepsForDuration(data.reviewDuration);

    // Step 0: Time selection (always first step)
    if (step === 1 && !data.reviewDuration) {
      errors.reviewDuration = 'Please select how much time you want to spend';
      return errors;
    }

    // Map steps based on flow
    // 1min flow: Step 1 (time), Step 2 (event details), Step 3 (quick review), Step 4 (submit)
    // 3min flow: Step 1 (time), Step 2 (event details), Step 3-4 (categories), Step 5 (content), Step 6 (submit)
    // 5min flow: Step 1 (time), Step 2 (event details), Step 3-7 (categories), Step 8 (content), Step 9 (submit)

    switch (flow) {
      case 'quick': // 1min flow
        if (step === 2) {
          // Event details
        if (!data.selectedArtist) {
          errors.selectedArtist = 'Please select an artist';
        }
        if (!data.selectedVenue) {
          errors.selectedVenue = 'Please select a venue';
        }
        if (!data.eventDate) {
          errors.eventDate = 'Please select a date';
        }
        } else if (step === 3) {
          // Quick review: overall rating + text
          if (!data.rating || data.rating < 0.5 || data.rating > 5.0) {
            errors.rating = 'Please provide an overall rating (0.5 - 5 stars)';
          }
          if (!data.reviewText || data.reviewText.trim() === '') {
            errors.reviewText = 'Please share a brief description of your experience';
          } else if (data.reviewText.length > 200) {
            errors.reviewText = 'Review text must be 200 characters or less for quick review';
          }
        }
        break;
      case 'standard': // 3min flow
        if (step === 2) {
          // Event details
          if (!data.selectedArtist) {
            errors.selectedArtist = 'Please select an artist';
          }
          if (!data.selectedVenue) {
            errors.selectedVenue = 'Please select a venue';
          }
          if (!data.eventDate) {
            errors.eventDate = 'Please select a date';
          }
        } else if (step === 3) {
          // Artist Performance rating
        if (!data.artistPerformanceRating || data.artistPerformanceRating < 0.5 || data.artistPerformanceRating > 5.0) {
          errors.artistPerformanceRating = 'Please rate the artist performance (0.5 - 5 stars)';
          }
        } else if (step === 4) {
          // Venue rating
          if (!data.venueRating || data.venueRating < 0.5 || data.venueRating > 5.0) {
            errors.venueRating = 'Please rate the venue (0.5 - 5 stars)';
          }
        } else if (step === 5) {
          // Review content
          if (!data.reviewText || data.reviewText.trim() === '') {
            errors.reviewText = 'Please share a description of your experience';
          } else if (data.reviewText.length > 400) {
            errors.reviewText = 'Review text must be 400 characters or less for standard review';
          }
        }
        break;
      case 'detailed': // 5min flow
        if (step === 2) {
          // Event details
          if (!data.selectedArtist) {
            errors.selectedArtist = 'Please select an artist';
          }
          if (!data.selectedVenue) {
            errors.selectedVenue = 'Please select a venue';
          }
          if (!data.eventDate) {
            errors.eventDate = 'Please select a date';
          }
        } else if (step === 3) {
          // Artist Performance rating
          if (!data.artistPerformanceRating || data.artistPerformanceRating < 0.5 || data.artistPerformanceRating > 5.0) {
            errors.artistPerformanceRating = 'Please rate the artist performance (0.5 - 5 stars)';
          }
        } else if (step === 4) {
          // Production rating
          if (!data.productionRating || data.productionRating < 0.5 || data.productionRating > 5.0) {
            errors.productionRating = 'Please rate the production quality (0.5 - 5 stars)';
          }
        } else if (step === 5) {
          // Venue rating
        if (!data.venueRating || data.venueRating < 0.5 || data.venueRating > 5.0) {
          errors.venueRating = 'Please rate the venue (0.5 - 5 stars)';
        }
        } else if (step === 6) {
          // Location rating
        if (!data.locationRating || data.locationRating < 0.5 || data.locationRating > 5.0) {
          errors.locationRating = 'Please rate the location & logistics (0.5 - 5 stars)';
        }
        } else if (step === 7) {
          // Value rating
        if (!data.valueRating || data.valueRating < 0.5 || data.valueRating > 5.0) {
          errors.valueRating = 'Please rate the value for the ticket (0.5 - 5 stars)';
        }
        if (data.ticketPricePaid && Number.isNaN(Number(data.ticketPricePaid))) {
          errors.ticketPricePaid = 'Ticket price must be a valid number';
        } else if (data.ticketPricePaid && Number(data.ticketPricePaid) < 0) {
          errors.ticketPricePaid = 'Ticket price cannot be negative';
        }
        } else if (step === 8) {
          // Review content
          if (!data.reviewText || data.reviewText.trim() === '') {
          errors.reviewText = 'Please share a brief description of your experience';
        } else if (data.reviewText.length > 500) {
          errors.reviewText = 'Review text must be 500 characters or less';
          }
        }
        break;
      default:
        // No flow selected yet or invalid flow
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

      const totalSteps = getTotalStepsForDuration(prev.formData.reviewDuration);
      const maxStep = totalSteps > 0 ? totalSteps : REVIEW_FORM_TOTAL_STEPS;
      const nextStepNumber = Math.min(prev.currentStep + 1, maxStep);
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
    setState(prev => {
      const totalSteps = getTotalStepsForDuration(prev.formData.reviewDuration);
      const maxStep = totalSteps > 0 ? totalSteps : REVIEW_FORM_TOTAL_STEPS;
      return {
      ...prev,
        currentStep: Math.max(1, Math.min(step, maxStep)),
      errors: {},
      };
    });
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

  const totalSteps = getTotalStepsForDuration(state.formData.reviewDuration);
  const maxStep = totalSteps > 0 ? totalSteps : REVIEW_FORM_TOTAL_STEPS;

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
    isLastStep: state.currentStep === maxStep,
    totalSteps: maxStep,
    currentFlow: getCurrentFlow(state.formData.reviewDuration),
  };
}
