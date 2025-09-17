import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ReviewService, ReviewData, UserReview, PublicReviewWithProfile } from '@/services/reviewService';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import { useReviewForm } from '@/hooks/useReviewForm';
import { supabase } from '@/integrations/supabase/client';
import { StepIndicator } from '@/components/ui/step-indicator';
import { EventDetailsStep } from '@/components/ReviewFormSteps/EventDetailsStep';
import { RatingStep } from '@/components/ReviewFormSteps/RatingStep';
import { ReviewContentStep } from '@/components/ReviewFormSteps/ReviewContentStep';
import { PrivacySubmitStep } from '@/components/ReviewFormSteps/PrivacySubmitStep';

interface EventReviewModalProps {
  event: JamBaseEvent | PublicReviewWithProfile | null;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onReviewSubmitted?: (review: UserReview) => void;
}

export function EventReviewModal({
  event,
  userId,
  isOpen,
  onClose,
  onReviewSubmitted
}: EventReviewModalProps) {
  const { toast } = useToast();
  const [existingReview, setExistingReview] = useState<UserReview | null>(null);
  
  const {
    currentStep,
    formData,
    errors,
    isLoading,
    isValid,
    updateFormData,
    nextStep,
    prevStep,
    setLoading,
    resetForm,
    setFormData,
    canProceed,
    canGoBack,
    isLastStep,
  } = useReviewForm();

  // Form steps configuration
  const steps = ['Event Details', 'Rating', 'Review', 'Privacy & Submit'];

  // Load existing review when modal opens
  useEffect(() => {
    if (isOpen && event && userId) {
      loadExistingReview();
    }
  }, [isOpen, event, userId]);

  const loadExistingReview = async () => {
    if (!event) return;
    
    try {
      const review = await ReviewService.getUserEventReview(userId, event.id);
      if (review) {
        setExistingReview(review);
        // Populate form with existing review data
        setFormData({
          selectedArtist: null, // Will need to be set manually
          selectedVenue: null, // Will need to be set manually
          eventDate: review.created_at.split('T')[0], // Use creation date as fallback
          rating: review.rating,
          reviewText: review.review_text || '',
          reactionEmoji: review.reaction_emoji || '',
          isPublic: review.is_public,
        });
      } else {
        // Reset form for new review
        setExistingReview(null);
        resetForm();
      }
    } catch (error) {
      console.error('Error loading existing review:', error);
      resetForm();
    }
  };

  const handleSubmit = async () => {
    console.log('🔍 Debug: Starting review submission');
    console.log('🔍 Debug: userId:', userId);
    console.log('🔍 Debug: formData:', formData);
    console.log('🔍 Debug: event:', event);
    
    if (!userId) {
      console.log('❌ Debug: No userId found');
      toast({
        title: "Authentication Required",
        description: "Please log in to submit a review.",
        variant: "destructive",
      });
      return;
    }
    
    if (!formData.selectedArtist || !formData.selectedVenue || formData.rating === 0) {
      toast({
        title: "Incomplete Review",
        description: "Please complete all required fields before submitting.",
        variant: "destructive",
      });
      return;
    }

    // If this is a new review (mock event), create the event first
    let eventId = event.id;
    if (event?.id?.startsWith('new-review-')) {
      try {
        // Create the event in the jambase_events table first
        const eventDateTime = new Date(formData.eventDate + 'T20:00:00Z');
        const { data: newEvent, error: eventError } = await supabase
          .from('jambase_events')
          .insert({
            title: `${formData.selectedArtist.name} at ${formData.selectedVenue.name}`,
            artist_name: formData.selectedArtist.name,
            venue_name: formData.selectedVenue.name,
            venue_city: formData.selectedVenue.address?.addressLocality || 'Unknown',
            venue_state: formData.selectedVenue.address?.addressRegion || 'Unknown',
            event_date: eventDateTime.toISOString(),
            description: `Concert by ${formData.selectedArtist.name} at ${formData.selectedVenue.name}`
          })
          .select()
          .single();

        if (eventError) {
          console.error('Error creating event:', eventError);
          throw eventError;
        }

        eventId = newEvent.id;
      } catch (error) {
        console.error('Error creating event:', error);
        toast({
          title: "Error",
          description: "Failed to create event entry. Please try again.",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    try {
      const reviewData: ReviewData = {
        rating: formData.rating,
        review_text: formData.reviewText.trim() || undefined,
        reaction_emoji: formData.reactionEmoji || undefined,
        is_public: formData.isPublic
      };

      console.log('🔍 Debug: About to submit review with data:', reviewData);
      console.log('🔍 Debug: userId:', userId, 'eventId:', eventId);
      
      const review = await ReviewService.setEventReview(userId, eventId, reviewData);
      
      console.log('✅ Debug: Review submitted successfully:', review);

      toast({
        title: "Review Submitted! 🎉",
        description: existingReview ? "Your review has been updated." : "Thanks for sharing your concert experience!",
      });

      if (onReviewSubmitted) {
        onReviewSubmitted(review);
      }

      onClose();
    } catch (error) {
      console.error('❌ Debug: Error submitting review:', error);
      console.error('❌ Debug: Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      toast({
        title: "Error",
        description: "Failed to submit review. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!event || !existingReview) return;

    setLoading(true);
    try {
      await ReviewService.deleteEventReview(userId, event.id);
      toast({
        title: "Review Deleted",
        description: "Your review has been deleted.",
      });
      onClose();
    } catch (error) {
      console.error('Error deleting review:', error);
      toast({
        title: "Error",
        description: "Failed to delete review. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      resetForm();
      onClose();
    }
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <EventDetailsStep
            formData={formData}
            errors={errors}
            onUpdateFormData={updateFormData}
          />
        );
      case 2:
        return (
          <RatingStep
            formData={formData}
            errors={errors}
            onUpdateFormData={updateFormData}
          />
        );
      case 3:
        return (
          <ReviewContentStep
            formData={formData}
            errors={errors}
            onUpdateFormData={updateFormData}
          />
        );
      case 4:
        return (
          <PrivacySubmitStep
            formData={formData}
            errors={errors}
            onUpdateFormData={updateFormData}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
        );
      default:
        return null;
    }
  };

  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl h-[90vh] p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              {existingReview ? 'Edit Review' : 'Share Your Concert Experience'}
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isLoading}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Step Indicator */}
          <div className="mt-4">
            <StepIndicator
              currentStep={currentStep}
              totalSteps={steps.length}
              steps={steps}
            />
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 pb-32">
            {renderCurrentStep()}
          </div>
        </div>

        {/* Navigation Footer - Only show on steps 1-3 */}
        {currentStep < 4 && (
          <div className="px-6 py-4 border-t border-gray-200 bg-white sticky bottom-0">
            <div className="flex items-center justify-between">
              <div>
                {existingReview && currentStep === 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isLoading}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Delete Review
                  </Button>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={isLoading}
                  size="sm"
                >
                  Cancel
                </Button>
                
                {canGoBack && (
                  <Button
                    variant="outline"
                    onClick={prevStep}
                    disabled={isLoading}
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </Button>
                )}
                
                {!isLastStep && (
                  <Button
                    onClick={nextStep}
                    disabled={!canProceed || isLoading}
                    size="sm"
                    className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600"
                  >
                    Next
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
