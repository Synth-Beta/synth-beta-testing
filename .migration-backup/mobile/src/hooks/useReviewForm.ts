import { useState, useCallback } from 'react';
import type { CustomSetlistSong } from '../services/eventReviewSubmitService';

/** Matches web artist picker shape (catalog + manual). */
export interface ReviewArtist {
    id: string;
    name: string;
    is_from_database?: boolean;
    identifier?: string;
}

/** Matches web venue picker shape. */
export interface ReviewVenue {
    id: string;
    name: string;
    is_from_database?: boolean;
    identifier?: string;
    address?: {
        addressLocality?: string;
        addressRegion?: string;
        postalCode?: string;
        streetAddress?: string;
        addressCountry?: string;
    };
    geo?: { latitude?: number; longitude?: number };
    image_url?: string;
}

export interface ReviewCustomSetlist {
    id: string;
    title: string;
    isAutoTitle: boolean;
    songs: CustomSetlistSong[];
}

export interface ReviewThumbnailCrop {
    scale: number;
    offsetX: number;
    offsetY: number;
    aspectRatio: number;
}

export interface ReviewImageItem {
    id: string;
    url: string;
    isThumbnail: boolean;
    thumbnailCrop: ReviewThumbnailCrop | null;
}

export interface ReviewFormData {
    reviewDuration: '1min' | '3min' | '5min' | null;
    selectedArtist: ReviewArtist | null;
    selectedVenue: ReviewVenue | null;
    eventDate: string;
    selectedSetlist: any | null;
    customSetlists: ReviewCustomSetlist[];
    artistPerformanceRating: number;
    productionRating: number;
    venueRating: number;
    locationRating: number;
    valueRating: number;
    artistPerformanceFeedback: string;
    productionFeedback: string;
    venueFeedback: string;
    locationFeedback: string;
    valueFeedback: string;
    ticketPricePaid: string;
    rating: number;
    reviewText: string;
    /** Public photo URLs (matches web `formData.photos`). */
    photos: string[];
    images: ReviewImageItem[];
    videos: string[];
    thumbnailIndex: number;
    thumbnailCrop: { xPct: number; yPct: number; zoom: number } | null;
    attendees: Array<
        | { type: 'user'; user_id: string; name: string; avatar_url?: string }
        | { type: 'phone'; phone: string; name?: string }
    >;
    metOnSynth: boolean;
    isPublic: boolean;
    reviewType: 'event' | 'venue' | 'artist';
}

export interface ReviewFormState {
    currentStep: number;
    formData: ReviewFormData;
    errors: Record<string, string>;
    isLoading: boolean;
    isValid: boolean;
    maxStepReached: number;
}

export const getTotalSteps = (duration: '1min' | '3min' | '5min' | null): number => {
    switch (duration) {
        case '1min':
            return 4;
        case '3min':
            return 6;
        case '5min':
            return 9;
        default:
            return 1;
    }
};

export const REVIEW_FORM_TOTAL_STEPS = 8;

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
    images: [],
    videos: [],
    thumbnailIndex: 0,
    thumbnailCrop: null,
    attendees: [],
    metOnSynth: false,
    isPublic: true,
    reviewType: 'event',
};

export const REVIEW_FORM_INITIAL_DATA: ReviewFormData = initialFormData;

export function useReviewForm() {
    const [state, setState] = useState<ReviewFormState>({
        currentStep: 1,
        formData: initialFormData,
        errors: {},
        isLoading: false,
        isValid: false,
        maxStepReached: 1,
    });

    const getCurrentFlow = (duration: '1min' | '3min' | '5min' | null): 'quick' | 'standard' | 'detailed' | null => {
        switch (duration) {
            case '1min':
                return 'quick';
            case '3min':
                return 'standard';
            case '5min':
                return 'detailed';
            default:
                return null;
        }
    };

    const getTotalStepsForDuration = (duration: '1min' | '3min' | '5min' | null): number => getTotalSteps(duration);

    const validateStep = useCallback((step: number, data: ReviewFormData): Record<string, string> => {
        const errors: Record<string, string> = {};
        const flow = getCurrentFlow(data.reviewDuration);

        if (step === 1 && !data.reviewDuration) {
            errors.reviewDuration = 'Please select how much time you want to spend';
            return errors;
        }

        switch (flow) {
            case 'quick':
                if (step === 2) {
                    if (!data.selectedArtist) errors.selectedArtist = 'Please select an artist';
                    if (!data.selectedVenue) errors.selectedVenue = 'Please select a venue';
                    if (!data.eventDate) errors.eventDate = 'Please select a date';
                } else if (step === 3) {
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
            case 'standard':
                if (step === 2) {
                    if (!data.selectedArtist) errors.selectedArtist = 'Please select an artist';
                    if (!data.selectedVenue) errors.selectedVenue = 'Please select a venue';
                    if (!data.eventDate) errors.eventDate = 'Please select a date';
                } else if (step === 3) {
                    if (!data.artistPerformanceRating || data.artistPerformanceRating < 0.5 || data.artistPerformanceRating > 5.0) {
                        errors.artistPerformanceRating = 'Please rate the artist performance (0.5 - 5 stars)';
                    }
                } else if (step === 4) {
                    if (!data.venueRating || data.venueRating < 0.5 || data.venueRating > 5.0) {
                        errors.venueRating = 'Please rate the venue (0.5 - 5 stars)';
                    }
                } else if (step === 5) {
                    if (!data.reviewText || data.reviewText.trim() === '') {
                        errors.reviewText = 'Please share a description of your experience';
                    } else if (data.reviewText.length > 400) {
                        errors.reviewText = 'Review text must be 400 characters or less for standard review';
                    }
                }
                break;
            case 'detailed':
                if (step === 2) {
                    if (!data.selectedArtist) errors.selectedArtist = 'Please select an artist';
                    if (!data.selectedVenue) errors.selectedVenue = 'Please select a venue';
                    if (!data.eventDate) errors.eventDate = 'Please select a date';
                } else if (step === 3) {
                    if (!data.artistPerformanceRating || data.artistPerformanceRating < 0.5 || data.artistPerformanceRating > 5.0) {
                        errors.artistPerformanceRating = 'Please rate the artist performance (0.5 - 5 stars)';
                    }
                } else if (step === 4) {
                    if (!data.productionRating || data.productionRating < 0.5 || data.productionRating > 5.0) {
                        errors.productionRating = 'Please rate the production quality (0.5 - 5 stars)';
                    }
                } else if (step === 5) {
                    if (!data.venueRating || data.venueRating < 0.5 || data.venueRating > 5.0) {
                        errors.venueRating = 'Please rate the venue (0.5 - 5 stars)';
                    }
                } else if (step === 6) {
                    if (!data.locationRating || data.locationRating < 0.5 || data.locationRating > 5.0) {
                        errors.locationRating = 'Please rate the location & logistics (0.5 - 5 stars)';
                    }
                } else if (step === 7) {
                    if (!data.valueRating || data.valueRating < 0.5 || data.valueRating > 5.0) {
                        errors.valueRating = 'Please rate the value for the ticket (0.5 - 5 stars)';
                    }
                    if (data.ticketPricePaid && Number.isNaN(Number(data.ticketPricePaid))) {
                        errors.ticketPricePaid = 'Ticket price must be a valid number';
                    } else if (data.ticketPricePaid && Number(data.ticketPricePaid) < 0) {
                        errors.ticketPricePaid = 'Ticket price cannot be negative';
                    }
                } else if (step === 8) {
                    if (!data.reviewText || data.reviewText.trim() === '') {
                        errors.reviewText = 'Please share a brief description of your experience';
                    } else if (data.reviewText.length > 500) {
                        errors.reviewText = 'Review text must be 500 characters or less';
                    }
                }
                break;
            case null:
                if (step > 1) {
                    errors.reviewDuration =
                        'Please select how much time you want to spend (or go back to step 1)';
                }
                break;
        }

        return errors;
    }, []);

    const calculateOverallRating = useCallback((data: ReviewFormData) => {
        const parts: number[] = [];
        if (data.artistPerformanceRating && data.artistPerformanceRating > 0) parts.push(data.artistPerformanceRating);
        if (data.productionRating && data.productionRating > 0) parts.push(data.productionRating);
        if (data.venueRating && data.venueRating > 0) parts.push(data.venueRating);
        if (data.locationRating && data.locationRating > 0) parts.push(data.locationRating);
        if (data.valueRating && data.valueRating > 0) parts.push(data.valueRating);
        if (parts.length === 0) return 0;
        const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
        return Math.round(avg * 10) / 10;
    }, []);

    const updateFormData = useCallback(
        (updates: Partial<ReviewFormData>) => {
            setState((prev) => {
                const newFormData = { ...prev.formData, ...updates };
                if (
                    updates.artistPerformanceRating !== undefined ||
                    updates.productionRating !== undefined ||
                    updates.venueRating !== undefined ||
                    updates.locationRating !== undefined ||
                    updates.valueRating !== undefined
                ) {
                    newFormData.rating = calculateOverallRating(newFormData);
                }
                let newMaxStepReached = prev.maxStepReached;
                if (updates.reviewDuration && updates.reviewDuration !== prev.formData.reviewDuration) {
                    const totalForNewDuration = getTotalStepsForDuration(updates.reviewDuration);
                    const maxForNewDuration = totalForNewDuration > 0 ? totalForNewDuration : REVIEW_FORM_TOTAL_STEPS;
                    const clampedCurrent = Math.min(prev.currentStep, maxForNewDuration);
                    newMaxStepReached = clampedCurrent;
                }
                const stepErrors = validateStep(prev.currentStep, newFormData);
                const isValid = Object.keys(stepErrors).length === 0;
                return {
                    ...prev,
                    formData: newFormData,
                    errors: stepErrors,
                    isValid,
                    maxStepReached: newMaxStepReached,
                };
            });
        },
        [validateStep, calculateOverallRating]
    );

    const nextStep = useCallback(() => {
        setState((prev) => {
            const stepErrors = validateStep(prev.currentStep, prev.formData);
            const isValid = Object.keys(stepErrors).length === 0;
            if (!isValid) {
                return { ...prev, errors: stepErrors };
            }
            const totalSteps = getTotalStepsForDuration(prev.formData.reviewDuration);
            const maxStep = totalSteps > 0 ? totalSteps : REVIEW_FORM_TOTAL_STEPS;
            const nextStepNumber = Math.min(prev.currentStep + 1, maxStep);
            return {
                ...prev,
                currentStep: nextStepNumber,
                maxStepReached: Math.max(prev.maxStepReached, nextStepNumber),
                errors: {},
                isValid: true,
            };
        });
    }, [validateStep]);

    const prevStep = useCallback(() => {
        setState((prev) => ({
            ...prev,
            currentStep: Math.max(prev.currentStep - 1, 1),
            errors: {},
        }));
    }, []);

    const setStep = useCallback((step: number) => {
        setState((prev) => {
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
        setState((prev) => ({ ...prev, isLoading: loading }));
    }, []);

    const resetForm = useCallback(() => {
        setState({
            currentStep: 1,
            formData: initialFormData,
            errors: {},
            isLoading: false,
            isValid: false,
            maxStepReached: 1,
        });
    }, []);

    const setFormData = useCallback(
        (data: Partial<ReviewFormData>) => {
            setState((prev) => {
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
                let newMaxStepReached = prev.maxStepReached;
                if (data.reviewDuration && data.reviewDuration !== prev.formData.reviewDuration) {
                    const totalForNewDuration = getTotalStepsForDuration(data.reviewDuration);
                    const maxForNewDuration = totalForNewDuration > 0 ? totalForNewDuration : REVIEW_FORM_TOTAL_STEPS;
                    const clampedCurrent = Math.min(prev.currentStep, maxForNewDuration);
                    newMaxStepReached = clampedCurrent;
                }
                const stepErrors = validateStep(prev.currentStep, newFormData);
                const isValid = Object.keys(stepErrors).length === 0;
                return {
                    ...prev,
                    formData: newFormData,
                    errors: stepErrors,
                    isValid,
                    maxStepReached: newMaxStepReached,
                };
            });
        },
        [validateStep, calculateOverallRating]
    );

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
