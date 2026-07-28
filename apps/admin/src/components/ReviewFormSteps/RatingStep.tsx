import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewFormData } from '@/hooks/useReviewForm';

interface RatingStepProps {
  formData: ReviewFormData;
  errors: Record<string, string>;
  onUpdateFormData: (updates: Partial<ReviewFormData>) => void;
}

export function RatingStep({ formData, errors, onUpdateFormData }: RatingStepProps) {
  const [hoverRating, setHoverRating] = useState(0);

  const getRatingLabel = (rating: number) => {
    const labels = [
      '', 'Terrible', 'Poor', 'Below Average', 'Average', 'Good', 
      'Very Good', 'Great', 'Excellent', 'Outstanding', 'Best Ever'
    ];
    return labels[rating] || 'Not Rated';
  };

  const handleRatingChange = (rating: number) => {
    onUpdateFormData({ rating });
  };

  const displayRating = hoverRating || formData.rating;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Rate Your Experience</h2>
        <p className="text-sm text-gray-600">How would you rate this concert overall?</p>
      </div>

      {/* Star Rating */}
      <div className="space-y-4">
        <Label className="text-sm font-medium text-center block">
          Overall Rating *
        </Label>
        
        {/* Star Display */}
        <div className="flex items-center justify-center space-x-2">
          {Array.from({ length: 5 }, (_, i) => {
            const starValue = i + 1;
            const halfStarValue = i + 0.5;
            const isActive = displayRating >= starValue;
            const isHalfActive = displayRating >= halfStarValue && displayRating < starValue;
            
            return (
              <div key={i} className="relative">
                <button
                  type="button"
                  onClick={() => handleRatingChange(starValue)}
                  onMouseEnter={() => setHoverRating(starValue)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-full p-1 transition-all duration-150 hover:scale-110"
                >
                  <Star
                    className={cn(
                      "w-12 h-12 transition-colors duration-150",
                      isActive ? "text-yellow-400 fill-current" : "text-gray-300 hover:text-yellow-200"
                    )}
                  />
                </button>
                
                {/* Half Star Button */}
                <button
                  type="button"
                  onClick={() => handleRatingChange(halfStarValue)}
                  onMouseEnter={() => setHoverRating(halfStarValue)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="absolute inset-0 left-0 w-1/2 overflow-hidden focus:outline-none"
                >
                  <Star
                    className={cn(
                      "w-12 h-12 transition-colors duration-150",
                      isHalfActive ? "text-yellow-400 fill-current" : "text-gray-300 hover:text-yellow-200"
                    )}
                  />
                </button>
              </div>
            );
          })}
        </div>
        
        {/* Rating Label */}
        <div className="text-center">
          <p className={cn(
            "text-lg font-medium transition-colors duration-150",
            displayRating > 0 ? "text-gray-900" : "text-gray-400"
          )}>
            {displayRating > 0 ? getRatingLabel(displayRating) : "Tap a star to rate"}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {displayRating > 0 ? `${displayRating} out of 5 stars` : "Not rated yet"}
          </p>
        </div>

        {errors.rating && (
          <p className="text-sm text-red-600 text-center">{errors.rating}</p>
        )}
      </div>

      {/* Quick Rating Buttons */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-center block">
          Quick Rating
        </Label>
        <div className="flex justify-center space-x-2">
          {[
            { rating: 1, label: "Terrible", emoji: "😞" },
            { rating: 2, label: "Poor", emoji: "😕" },
            { rating: 3, label: "Average", emoji: "😐" },
            { rating: 4, label: "Good", emoji: "😊" },
            { rating: 5, label: "Amazing", emoji: "🤩" }
          ].map(({ rating, label, emoji }) => (
            <Button
              key={rating}
              type="button"
              variant={formData.rating === rating ? "default" : "outline"}
              size="sm"
              onClick={() => handleRatingChange(rating)}
              className={cn(
                "flex flex-col items-center space-y-1 px-3 py-2 h-auto",
                formData.rating === rating && "bg-blue-500 text-white hover:bg-blue-600"
              )}
            >
              <span className="text-lg">{emoji}</span>
              <span className="text-xs font-medium">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Rating Guidelines */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Rating Guidelines</h4>
        <div className="space-y-1 text-xs text-gray-600">
          <p><strong>5 stars (Amazing):</strong> One of the best concerts you've ever been to</p>
          <p><strong>4 stars (Good):</strong> Great concert, would definitely go again</p>
          <p><strong>3 stars (Average):</strong> Decent show, nothing special but not bad</p>
          <p><strong>2 stars (Poor):</strong> Below expectations, several issues</p>
          <p><strong>1 star (Terrible):</strong> Major problems, would not recommend</p>
        </div>
      </div>

      {/* Selected Rating Summary */}
      {formData.rating > 0 && (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-center space-x-2">
            <div className="flex">
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "w-4 h-4",
                    i < formData.rating ? "text-yellow-400 fill-current" : "text-gray-300"
                  )}
                />
              ))}
            </div>
            <span className="text-sm font-medium text-green-800">
              {getRatingLabel(formData.rating)} ({formData.rating}/5)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
