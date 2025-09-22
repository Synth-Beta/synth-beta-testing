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
  const getRatingLabel = (rating: number) => {
    const labels = [
      '', 'Terrible', 'Poor', 'Below Average', 'Average', 'Good', 
      'Very Good', 'Great', 'Excellent', 'Outstanding', 'Best Ever'
    ];
    return labels[rating] || 'Not Rated';
  };

  const handleArtistRatingChange = (rating: number) => {
    const newArtistRating = rating;
    const newVenueRating = formData.venueRating;
    const newOverallRating = newVenueRating > 0 ? Math.round((newArtistRating + newVenueRating) / 2) : newArtistRating;
    
    onUpdateFormData({ 
      artistRating: newArtistRating, 
      rating: newOverallRating 
    });
  };

  const handleVenueRatingChange = (rating: number) => {
    const newVenueRating = rating;
    const newArtistRating = formData.artistRating;
    const newOverallRating = newArtistRating > 0 ? Math.round((newArtistRating + newVenueRating) / 2) : newVenueRating;
    
    onUpdateFormData({ 
      venueRating: newVenueRating, 
      rating: newOverallRating 
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Rate Your Experience</h2>
        <p className="text-sm text-gray-600">Rate both the artist performance and the venue experience</p>
      </div>

      {/* Artist Rating */}
      <div className="space-y-4">
        <Label className="text-sm font-medium text-center block">
          Artist/Performance Rating *
        </Label>
        
        {/* Artist Star Display */}
        <div className="flex items-center justify-center space-x-2">
          {Array.from({ length: 5 }, (_, i) => {
            const starValue = i + 1;
            const isActive = formData.artistRating >= starValue;
            
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleArtistRatingChange(starValue)}
                className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-full p-1 transition-all duration-150 hover:scale-110"
              >
                <Star
                  className={cn(
                    "w-10 h-10 transition-colors duration-150",
                    isActive ? "text-yellow-400 fill-current" : "text-gray-300 hover:text-yellow-200"
                  )}
                />
              </button>
            );
          })}
        </div>
        
        {/* Artist Rating Label */}
        <div className="text-center">
          <p className={cn(
            "text-lg font-medium transition-colors duration-150",
            formData.artistRating > 0 ? "text-gray-900" : "text-gray-400"
          )}>
            {formData.artistRating > 0 ? getRatingLabel(formData.artistRating) : "Tap a star to rate the artist"}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {formData.artistRating > 0 ? `${formData.artistRating} out of 5 stars` : "Not rated yet"}
          </p>
        </div>

        {errors.artistRating && (
          <p className="text-sm text-red-600 text-center">{errors.artistRating}</p>
        )}
      </div>

      {/* Venue Rating */}
      <div className="space-y-4">
        <Label className="text-sm font-medium text-center block">
          Venue Experience Rating *
        </Label>
        
        {/* Venue Star Display */}
        <div className="flex items-center justify-center space-x-2">
          {Array.from({ length: 5 }, (_, i) => {
            const starValue = i + 1;
            const isActive = formData.venueRating >= starValue;
            
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleVenueRatingChange(starValue)}
                className="focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 rounded-full p-1 transition-all duration-150 hover:scale-110"
              >
                <Star
                  className={cn(
                    "w-10 h-10 transition-colors duration-150",
                    isActive ? "text-green-400 fill-current" : "text-gray-300 hover:text-green-200"
                  )}
                />
              </button>
            );
          })}
        </div>
        
        {/* Venue Rating Label */}
        <div className="text-center">
          <p className={cn(
            "text-lg font-medium transition-colors duration-150",
            formData.venueRating > 0 ? "text-gray-900" : "text-gray-400"
          )}>
            {formData.venueRating > 0 ? getRatingLabel(formData.venueRating) : "Tap a star to rate the venue"}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {formData.venueRating > 0 ? `${formData.venueRating} out of 5 stars` : "Not rated yet"}
          </p>
        </div>

        {errors.venueRating && (
          <p className="text-sm text-red-600 text-center">{errors.venueRating}</p>
        )}
      </div>

      {/* Overall Rating Display */}
      {formData.artistRating > 0 && formData.venueRating > 0 && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="text-sm font-medium text-blue-900 mb-2 text-center">Overall Experience</h3>
          <div className="flex items-center justify-center space-x-2">
            <div className="flex">
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "w-6 h-6",
                    i < formData.rating ? "text-blue-400 fill-current" : "text-gray-300"
                  )}
                />
              ))}
            </div>
            <span className="text-sm font-medium text-blue-800">
              {getRatingLabel(formData.rating)} ({formData.rating}/5)
            </span>
          </div>
          <p className="text-xs text-blue-600 text-center mt-1">
            Based on Artist: {formData.artistRating}/5 + Venue: {formData.venueRating}/5
          </p>
        </div>
      )}

      {/* Rating Guidelines */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Rating Guidelines</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h5 className="text-xs font-semibold text-yellow-700 mb-2">🎤 Artist Performance</h5>
            <div className="space-y-1 text-xs text-gray-600">
              <p><strong>5:</strong> Incredible performance, amazing energy</p>
              <p><strong>4:</strong> Great show, very entertaining</p>
              <p><strong>3:</strong> Good performance, met expectations</p>
              <p><strong>2:</strong> Below average, some issues</p>
              <p><strong>1:</strong> Poor performance, disappointing</p>
            </div>
          </div>
          <div>
            <h5 className="text-xs font-semibold text-green-700 mb-2">🏟️ Venue Experience</h5>
            <div className="space-y-1 text-xs text-gray-600">
              <p><strong>5:</strong> Perfect venue, great facilities</p>
              <p><strong>4:</strong> Good venue, minor issues</p>
              <p><strong>3:</strong> Average venue experience</p>
              <p><strong>2:</strong> Below average, several problems</p>
              <p><strong>1:</strong> Terrible venue, major issues</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
