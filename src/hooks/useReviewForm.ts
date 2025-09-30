import { useState, useCallback } from 'react';
import type { Artist } from '@/types/concertSearch';
import type { VenueSearchResult } from '@/services/unifiedVenueSearchService';

export interface ReviewFormData {
  // Step 1: Event Details
  selectedArtist: Artist | null;
  selectedVenue: VenueSearchResult | null;
  eventDate: string;
  
  // Step 2: Rating - Three separate categories
  performanceRating: number; // Rating for artist/band performance quality (0.5-5.0)
  venueRating: number; // Rating for venue experience - sound, staff, facilities (0.5-5.0)
  overallExperienceRating: number; // Rating for overall event experience - atmosphere, crowd (0.5-5.0)
  rating: number; // Overall rating (calculated as average of the three)
  
  // Step 3: Review Content
  reviewText: string;
  reactionEmoji: string;
  performanceReviewText: string; // Optional qualitative review for performance
  venueReviewText: string; // Optional qualitative review for venue
  overallExperienceReviewText: string; // Optional qualitative review for overall experience
  artistReviewText: string; // Legacy field for backward compatibility
  
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

const initialFormData: ReviewFormData = {
  selectedArtist: null,
  selectedVenue: null,
  eventDate: '',
  performanceRating: 0,
  venueRating: 0,
  overallExperienceRating: 0,
  rating: 0,
  reviewText: '',
  reactionEmoji: '',
  performanceReviewText: '',
  venueReviewText: '',
  overallExperienceReviewText: '',
  artistReviewText: '',
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
        if (!data.selectedArtist) {
          errors.selectedArtist = 'Please select an artist';
        }
        if (!data.selectedVenue) {
          errors.selectedVenue = 'Please select a venue';
        }
        if (!data.eventDate) {
          errors.eventDate = 'Please select a date';
        }
        break;
      case 2:
        // Validate all three rating categories
        if (data.performanceRating === 0) {
          errors.performanceRating = 'Please rate the performance';
        } else if (data.performanceRating < 0.5 || data.performanceRating > 5.0) {
          errors.performanceRating = 'Performance rating must be between 0.5 and 5.0 stars';
        }
        
        if (data.venueRating === 0) {
          errors.venueRating = 'Please rate the venue';
        } else if (data.venueRating < 0.5 || data.venueRating > 5.0) {
          errors.venueRating = 'Venue rating must be between 0.5 and 5.0 stars';
        }
        
        if (data.overallExperienceRating === 0) {
          errors.overallExperienceRating = 'Please rate the overall experience';
        } else if (data.overallExperienceRating < 0.5 || data.overallExperienceRating > 5.0) {
          errors.overallExperienceRating = 'Overall experience rating must be between 0.5 and 5.0 stars';
        }
        break;
      case 3:
        // Review text is required per new design
        if (!data.reviewText) {
          errors.reviewText = 'Please share a brief description of your experience';
        } else if (data.reviewText.length > 500) {
          errors.reviewText = 'Review text must be 500 characters or less';
        }
        if (data.performanceReviewText && data.performanceReviewText.length > 300) {
          errors.performanceReviewText = 'Performance review must be 300 characters or less';
        }
        if (data.venueReviewText && data.venueReviewText.length > 300) {
          errors.venueReviewText = 'Venue review must be 300 characters or less';
        }
        if (data.overallExperienceReviewText && data.overallExperienceReviewText.length > 300) {
          errors.overallExperienceReviewText = 'Overall experience review must be 300 characters or less';
        }
        if (data.artistReviewText && data.artistReviewText.length > 300) {
          errors.artistReviewText = 'Artist review must be 300 characters or less';
        }
        break;
      case 4:
        // Privacy is always valid (has default value)
        break;
    }

    return errors;
  }, []);

  // Helper function to calculate overall rating from the three categories
  const calculateOverallRating = useCallback((performance: number, venue: number, experience: number) => {
    const parts: number[] = [];
    if (performance && performance > 0) parts.push(performance);
    if (venue && venue > 0) parts.push(venue);
    if (experience && experience > 0) parts.push(experience);
    if (parts.length === 0) return 0;
    const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
    return Math.round(avg * 2) / 2; // Round to nearest 0.5
  }, []);

  const updateFormData = useCallback((updates: Partial<ReviewFormData>) => {
    setState(prev => {
      const newFormData = { ...prev.formData, ...updates };
      
      // Auto-calculate overall rating if any of the three ratings are updated
      if (updates.performanceRating !== undefined || updates.venueRating !== undefined || updates.overallExperienceRating !== undefined) {
        newFormData.rating = calculateOverallRating(
          updates.performanceRating ?? newFormData.performanceRating,
          updates.venueRating ?? newFormData.venueRating,
          updates.overallExperienceRating ?? newFormData.overallExperienceRating
        );
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

      const nextStepNumber = Math.min(prev.currentStep + 1, 4);
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
      currentStep: Math.max(1, Math.min(step, 4)),
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
      const stepErrors = validateStep(prev.currentStep, newFormData);
      const isValid = Object.keys(stepErrors).length === 0;
      
      return {
        ...prev,
        formData: newFormData,
        errors: stepErrors,
        isValid,
      };
    });
  }, [validateStep]);

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
    isLastStep: state.currentStep === 4,
  };
}
