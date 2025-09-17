import { useState, useCallback } from 'react';
import type { Artist } from '@/types/concertSearch';
import type { VenueSearchResult } from '@/services/unifiedVenueSearchService';

export interface ReviewFormData {
  // Step 1: Event Details
  selectedArtist: Artist | null;
  selectedVenue: VenueSearchResult | null;
  eventDate: string;
  
  // Step 2: Rating
  rating: number; // Can be decimal values like 1.5, 2.5, etc.
  
  // Step 3: Review Content
  reviewText: string;
  reactionEmoji: string;
  
  // Step 4: Privacy
  isPublic: boolean;
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
  rating: 0,
  reviewText: '',
  reactionEmoji: '',
  isPublic: true,
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
        if (data.rating === 0) {
          errors.rating = 'Please provide a rating';
        } else if (data.rating < 1 || data.rating > 5) {
          errors.rating = 'Rating must be between 1 and 5 stars';
        }
        break;
      case 3:
        // Review text is optional, but if provided, should be reasonable length
        if (data.reviewText && data.reviewText.length > 500) {
          errors.reviewText = 'Review text must be 500 characters or less';
        }
        break;
      case 4:
        // Privacy is always valid (has default value)
        break;
    }

    return errors;
  }, []);

  const updateFormData = useCallback((updates: Partial<ReviewFormData>) => {
    setState(prev => {
      const newFormData = { ...prev.formData, ...updates };
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
      const newFormData = { ...initialFormData, ...data };
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
