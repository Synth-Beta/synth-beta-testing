import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewFormData } from '@/hooks/useReviewForm';

interface RatingStepProps {
  formData: ReviewFormData;
  errors: Record<string, string>;
  onUpdateFormData: (updates: Partial<ReviewFormData>) => void;
}

export function RatingStep({ formData, errors, onUpdateFormData }: RatingStepProps) {
  const [hoverHalfSteps, setHoverHalfSteps] = useState<number | null>(null);
  const getRatingLabel = (rating: number) => {
    if (!rating) return 'Not Rated';
    return `${(rating / 2).toFixed(1)} / 5.0`;
  };

  const setOverall = (halfSteps: number) => {
    // Store overall in 0..10 (half-star increments), keep artist/venue split unused
    onUpdateFormData({ rating: halfSteps });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Rate the Performance</h2>
        <p className="text-sm text-gray-600">Overall event rating (half-star increments)</p>
      </div>

      {/* Unified Overall Rating rendered as 5 stars with half selection */}
      <div className="space-y-4">
        <Label className="text-sm font-medium text-center block">Overall Rating *</Label>
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: 5 }, (_, i) => {
            const starIndex = i + 1; // 1..5
            const thresholdFull = starIndex * 2;
            const thresholdHalf = thresholdFull - 1;
            const displayRating = hoverHalfSteps ?? formData.rating;
            const isFull = displayRating >= thresholdFull;
            const isHalf = !isFull && displayRating === thresholdHalf;
            return (
              <div
                key={i}
                className="relative w-10 h-10 flex items-center justify-center cursor-pointer"
                onMouseLeave={() => setHoverHalfSteps(null)}
              >
                <Star className="w-10 h-10 text-gray-300" />
                {(isHalf || isFull) && (
                  <div className={cn('absolute left-0 top-0 h-full overflow-hidden pointer-events-none', isFull ? 'w-full' : 'w-1/2')}>
                    <Star className="w-10 h-10 text-yellow-400 fill-current" />
                  </div>
                )}
                <button
                  aria-label={`Rate ${(thresholdHalf/2).toFixed(1)} stars`}
                  className="absolute left-0 top-0 h-full w-1/2"
                  onMouseEnter={() => setHoverHalfSteps(thresholdHalf)}
                  onClick={() => setOverall(thresholdHalf)}
                />
                <button
                  aria-label={`Rate ${(thresholdFull/2).toFixed(1)} stars`}
                  className="absolute right-0 top-0 h-full w-1/2"
                  onMouseEnter={() => setHoverHalfSteps(thresholdFull)}
                  onClick={() => setOverall(thresholdFull)}
                />
              </div>
            );
          })}
        </div>
        <div className="text-center">
          <p className={cn('text-lg font-medium', (hoverHalfSteps ?? formData.rating) > 0 ? 'text-gray-900' : 'text-gray-400')}>
            {(hoverHalfSteps ?? formData.rating) > 0 ? getRatingLabel(hoverHalfSteps ?? formData.rating) : 'Hover to preview, click to select'}
          </p>
        </div>
        {errors.rating && (
          <p className="text-sm text-red-600 text-center">{errors.rating}</p>
        )}
      </div>

    </div>
  );
}


