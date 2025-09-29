import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

  const renderStarRating = (category: 'performanceRating' | 'venueRating' | 'overallExperienceRating', label: string, description: string, size: 'small' | 'large' = 'small') => {
    const displayRating = getHoverRating(category);
    const starSize = size === 'large' ? 'w-12 h-12' : 'w-8 h-8';
    const containerSize = size === 'large' ? 'w-14 h-14' : 'w-10 h-10';
    
    return (
      <div className="space-y-4">
        <div className="text-center">
          <Label className={cn('font-medium text-gray-900', size === 'large' ? 'text-lg' : 'text-sm')}>{label} *</Label>
          <p className={cn('text-gray-600 mt-1', size === 'large' ? 'text-sm' : 'text-xs')}>{description}</p>
        </div>
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: 5 }, (_, i) => {
            const starIndex = i + 1; // 1..5
            const thresholdFull = starIndex;
            const thresholdHalf = starIndex - 0.5;
            const isFull = (displayRating as number) >= thresholdFull;
            const isHalf = !isFull && (displayRating as number) === thresholdHalf;
            return (
              <div
                key={i}
                className={cn('relative flex items-center justify-center cursor-pointer', containerSize)}
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

  const renderQualitativeSection = (category: 'performanceReviewText' | 'venueReviewText' | 'overallExperienceReviewText', label: string, placeholder: string) => {
    const fieldName = category.replace('ReviewText', '');
    const ratingField = `${fieldName.charAt(0).toLowerCase() + fieldName.slice(1)}Rating` as keyof typeof formData;
    const ratingValue = formData[ratingField] as number;
    const hasRating = ratingValue > 0;
    
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-gray-900">{label} (Optional)</Label>
          {hasRating && (
            <span className="text-xs text-gray-500">
              {getRatingLabel(ratingValue)}
            </span>
          )}
        </div>
        <Textarea
          value={formData[category]}
          onChange={(e) => onUpdateFormData({ [category]: e.target.value })}
          placeholder={placeholder}
          className="min-h-[80px] text-sm"
          maxLength={300}
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>Share specific details about this aspect</span>
          <span>{formData[category].length}/300</span>
        </div>
        {errors[category] && (
          <p className="text-sm text-red-600">{errors[category]}</p>
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

      {/* Large Overall Rating Display at Top - always visible */}
      <div className="text-center p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
        <p className="text-sm text-blue-600 mb-2 font-medium">Overall Rating</p>
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="flex items-center">
            {Array.from({ length: 5 }, (_, i) => {
              const starIndex = i + 1;
              const displayOverall = getOverallDisplayRating();
              const isFull = (displayOverall as number) >= starIndex;
              const isHalf = !isFull && (displayOverall as number) === starIndex - 0.5;
              return (
                <div key={i} className="relative w-8 h-8">
                  <Star className="w-8 h-8 text-gray-300" />
                  {(isHalf || isFull) && (
                    <div className={cn('absolute left-0 top-0 h-full overflow-hidden pointer-events-none', isFull ? 'w-full' : 'w-1/2')}>
                      <Star className="w-8 h-8 text-yellow-400 fill-current" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <span className="text-3xl font-bold text-gray-900">{getRatingLabel(getOverallDisplayRating())}</span>
        </div>
        <p className="text-xs text-blue-500">Average of all three categories below</p>
      </div>

      {/* Three categories laid out horizontally */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-4">
          {renderStarRating('performanceRating', 'Performance', 'How was the artist/band performance?')}
          {renderQualitativeSection('performanceReviewText', 'Performance Details', 'What made the performance special? Any standout moments, energy level, or technical aspects?')}
        </div>
        <div className="space-y-4">
          {renderStarRating('venueRating', 'Venue', 'How was the venue experience (sound, staff, facilities)?')}
          {renderQualitativeSection('venueReviewText', 'Venue Details', 'How was the sound quality, staff service, facilities, or overall venue atmosphere?')}
        </div>
        <div className="space-y-4">
          {renderStarRating('overallExperienceRating', 'Overall Experience', 'How was the overall atmosphere and crowd?')}
          {renderQualitativeSection('overallExperienceReviewText', 'Overall Experience Details', 'What made the overall experience memorable? Crowd energy, atmosphere, or special moments?')}
        </div>
      </div>
    </div>
  );
}


