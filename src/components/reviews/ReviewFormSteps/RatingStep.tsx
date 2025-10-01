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
  const [hoverHalfSteps, setHoverHalfSteps] = useState<{ [key: string]: number | null }>({});
  const [isHoveringOverall, setIsHoveringOverall] = useState<boolean>(false);
  
  const getRatingLabel = (rating: number) => {
    if (!rating) return 'Not Rated';
    return `${rating.toFixed(1)} / 5.0`;
  };

  const setRating = (category: 'performanceRating' | 'venueRating' | 'overallExperienceRating', halfSteps: number) => {
    onUpdateFormData({ [category]: halfSteps });
  };

  const getHoverRating = (category: string) => {
    return hoverHalfSteps[category] ?? formData[category as keyof typeof formData];
  };

  const setHover = (category: string, halfSteps: number | null) => {
    setHoverHalfSteps(prev => ({ ...prev, [category]: halfSteps }));
  };

  // Compute overall display rating using hovered values when present
  const getOverallDisplayRating = () => {
    const perf = (hoverHalfSteps['performanceRating'] ?? formData.performanceRating) as number;
    const venue = (hoverHalfSteps['venueRating'] ?? formData.venueRating) as number;
    const exp = (hoverHalfSteps['overallExperienceRating'] ?? formData.overallExperienceRating) as number;
    const parts: number[] = [];
    if (perf && perf > 0) parts.push(perf);
    if (venue && venue > 0) parts.push(venue);
    if (exp && exp > 0) parts.push(exp);
    if (parts.length === 0) return 0;
    const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
    return Math.round(avg * 2) / 2; // nearest 0.5
  };

  const setAllCategoriesFromOverall = (halfSteps: number) => {
    onUpdateFormData({
      performanceRating: halfSteps,
      venueRating: halfSteps,
      overallExperienceRating: halfSteps,
    });
  };

  const renderStarRating = (category: 'performanceRating' | 'venueRating' | 'overallExperienceRating', label: string, description: string, size: 'small' | 'large' = 'small') => {
    const displayRating = getHoverRating(category);
    const starSize = size === 'large' ? 'w-12 h-12' : 'w-7 h-7 md:w-8 md:h-8';
    // Slightly tighter containers to ensure five fit on one row on small screens
    const containerSize = size === 'large' ? 'w-14 h-14' : 'w-8 h-8 md:w-9 md:h-9';
    
    return (
      <div className="space-y-4">
        <div className="text-center min-h-[84px] md:min-h-[96px] flex flex-col items-center justify-end">
          <Label className={cn('font-medium text-gray-900', size === 'large' ? 'text-lg' : 'text-sm')}>{label} *</Label>
          <p className={cn('text-gray-600 mt-1', size === 'large' ? 'text-sm' : 'text-xs')}>{description}</p>
        </div>
        <div className="flex items-center justify-center gap-2 md:gap-2 flex-nowrap">
          {Array.from({ length: 5 }, (_, i) => {
            const starIndex = i + 1; // 1..5
            const thresholdFull = starIndex;
            const thresholdHalf = starIndex - 0.5;
            const isFull = (displayRating as number) >= thresholdFull;
            const isHalf = !isFull && (displayRating as number) === thresholdHalf;
            return (
              <div
                key={i}
                className={cn('relative flex items-center justify-center cursor-pointer shrink-0', containerSize)}
                onMouseLeave={() => setHover(category, null)}
              >
                <Star className={cn('text-gray-300', starSize)} />
                {(isHalf || isFull) && (
                  <div className={cn('absolute left-0 top-0 h-full overflow-hidden pointer-events-none', isFull ? 'w-full' : 'w-1/2')}>
                    <Star className={cn('text-yellow-400 fill-current', starSize)} />
                  </div>
                )}
                <button
                  aria-label={`Rate ${thresholdHalf.toFixed(1)} stars`}
                  className="absolute left-0 top-0 h-full w-1/2"
                  onMouseEnter={() => setHover(category, thresholdHalf)}
                  onClick={() => setRating(category, thresholdHalf)}
                />
                <button
                  aria-label={`Rate ${thresholdFull.toFixed(1)} stars`}
                  className="absolute right-0 top-0 h-full w-1/2"
                  onMouseEnter={() => setHover(category, thresholdFull)}
                  onClick={() => setRating(category, thresholdFull)}
                />
              </div>
            );
          })}
        </div>
        <div className="text-center">
          <p className={cn('font-medium', (displayRating as number) > 0 ? 'text-gray-900' : 'text-gray-400', size === 'large' ? 'text-xl' : 'text-sm')}>
            {(displayRating as number) > 0 ? getRatingLabel(displayRating as number) : 'Hover to preview, click to select'}
          </p>
        </div>
        {errors[category] && (
          <p className="text-sm text-red-600 text-center">{errors[category]}</p>
        )}
      </div>
    );
  };


  return (
    <div className="space-y-8">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Rate Your Experience</h2>
        <p className="text-sm text-gray-600">Rate each aspect of the event and share your thoughts</p>
      </div>

      {/* Large Overall Rating Display at Top - now interactive */}
      <div className="text-center p-7 md:p-8 bg-gradient-to-r from-pink-50 via-rose-50 to-fuchsia-50 rounded-2xl border border-pink-200 shadow-sm">
        <p className="text-sm text-pink-600 mb-3 font-medium tracking-wide">Overall Rating</p>
        <div className="flex items-center justify-center gap-4 mb-2">
          <div
            className="flex items-center"
            onMouseLeave={() => {
              setIsHoveringOverall(false);
              setHover('performanceRating', null);
              setHover('venueRating', null);
              setHover('overallExperienceRating', null);
            }}
          >
            {Array.from({ length: 5 }, (_, i) => {
              const starIndex = i + 1;
              const displayOverall = isHoveringOverall
                ? (hoverHalfSteps['performanceRating'] ?? hoverHalfSteps['venueRating'] ?? hoverHalfSteps['overallExperienceRating'] ?? getOverallDisplayRating())
                : getOverallDisplayRating();
              const isFull = (displayOverall as number) >= starIndex;
              const isHalf = !isFull && (displayOverall as number) === starIndex - 0.5;
              return (
                <div key={i} className="relative w-12 h-12 md:w-14 md:h-14 cursor-pointer">
                  <Star className="w-12 h-12 md:w-14 md:h-14 text-gray-300" />
                  {(isHalf || isFull) && (
                    <div className={cn('absolute left-0 top-0 h-full overflow-hidden pointer-events-none', isFull ? 'w-full' : 'w-1/2')}>
                      <Star className="w-12 h-12 md:w-14 md:h-14 text-pink-500 fill-current" />
                    </div>
                  )}
                  {/* left half */}
                  <button
                    aria-label={`Set overall to ${(starIndex - 0.5).toFixed(1)}`}
                    className="absolute left-0 top-0 h-full w-1/2"
                    onMouseEnter={() => {
                      setIsHoveringOverall(true);
                      setHover('performanceRating', starIndex - 0.5);
                      setHover('venueRating', starIndex - 0.5);
                      setHover('overallExperienceRating', starIndex - 0.5);
                    }}
                    onClick={() => setAllCategoriesFromOverall(starIndex - 0.5)}
                  />
                  {/* right half */}
                  <button
                    aria-label={`Set overall to ${starIndex.toFixed(1)}`}
                    className="absolute right-0 top-0 h-full w-1/2"
                    onMouseEnter={() => {
                      setIsHoveringOverall(true);
                      setHover('performanceRating', starIndex);
                      setHover('venueRating', starIndex);
                      setHover('overallExperienceRating', starIndex);
                    }}
                    onClick={() => setAllCategoriesFromOverall(starIndex)}
                  />
                </div>
              );
            })}
          </div>
          <span className="text-4xl font-extrabold text-gray-900">{getRatingLabel(getOverallDisplayRating())}</span>
        </div>
        <p className="text-xs text-pink-600">Average of categories • Click stars to set all</p>
      </div>

      {/* Three categories laid out horizontally with subtle separators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-4">
          {renderStarRating('performanceRating', 'Performance', 'How was the artist/band performance?')}
        </div>
        <div className="space-y-4 border-t md:border-t-0 md:border-l md:border-gray-200 md:pl-6 pt-6 md:pt-0">
          {renderStarRating('venueRating', 'Venue', 'How was the venue experience (sound, staff, facilities)?')}
        </div>
        <div className="space-y-4 border-t md:border-t-0 md:border-l md:border-gray-200 md:pl-6 pt-6 md:pt-0">
          {renderStarRating('overallExperienceRating', 'Overall Experience', 'How was the overall atmosphere and crowd?')}
        </div>
      </div>
    </div>
  );
}


