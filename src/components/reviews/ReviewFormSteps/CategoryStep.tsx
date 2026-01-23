import React, { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Star, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewFormData } from '@/hooks/useReviewForm';
import type { UserReview } from '@/services/reviewService';

type RatingKey =
  | 'artistPerformanceRating'
  | 'productionRating'
  | 'venueRating'
  | 'locationRating'
  | 'valueRating';

type FeedbackKey =
  | 'artistPerformanceFeedback'
  | 'productionFeedback'
  | 'venueFeedback'
  | 'locationFeedback'
  | 'valueFeedback';

export interface CategoryConfig {
  title: string;
  subtitle: string;
  ratingKey: RatingKey;
  feedbackKey: FeedbackKey;
  helperText?: string;
  suggestions: Array<{
    id: string;
    label: string;
    description?: string;
    sentiment: 'positive' | 'negative';
  }>;
}

interface CategoryStepProps {
  config: CategoryConfig;
  formData: ReviewFormData;
  errors: Record<string, string>;
  onUpdateFormData: (updates: Partial<ReviewFormData>) => void;
  children?: React.ReactNode;
  previousVenueReview?: UserReview | null; // Previous review at same venue (for venue/location steps)
}

export function CategoryStep({ config, formData, errors, onUpdateFormData, children, previousVenueReview }: CategoryStepProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const currentRating = formData[config.ratingKey] as number;
  const currentFeedback = formData[config.feedbackKey] as string;

  const displayRating = hoverValue ?? currentRating ?? 0;

  // Check if this is a venue or location step that can copy from previous review
  const canCopyFromPrevious = previousVenueReview && (config.ratingKey === 'venueRating' || config.ratingKey === 'locationRating');
  
  const handleCopyFromPrevious = () => {
    if (!previousVenueReview || !canCopyFromPrevious) return;

    const updates: Partial<ReviewFormData> = {};

    if (config.ratingKey === 'venueRating') {
      // Copy venue rating and feedback (use only 5-category column)
      const venueRating = (previousVenueReview as any).venue_rating;
      if (venueRating) {
        const ratingValue = typeof venueRating === 'number' ? venueRating : parseFloat(String(venueRating));
        if (!isNaN(ratingValue) && ratingValue > 0) {
          updates.venueRating = ratingValue;
        }
      }
      if ((previousVenueReview as any).venue_feedback) {
        updates.venueFeedback = (previousVenueReview as any).venue_feedback;
      }
    } else if (config.ratingKey === 'locationRating') {
      // Copy location rating and feedback (use only 5-category column)
      const locationRating = (previousVenueReview as any).location_rating;
      if (locationRating) {
        const ratingValue = typeof locationRating === 'number' ? locationRating : parseFloat(String(locationRating));
        if (!isNaN(ratingValue) && ratingValue > 0) {
          updates.locationRating = ratingValue;
        }
      }
      if ((previousVenueReview as any).location_feedback) {
        updates.locationFeedback = (previousVenueReview as any).location_feedback;
      }
    }

    onUpdateFormData(updates);
  };

  const ratingLabel = useMemo(() => {
    if (!displayRating) return 'Not rated yet';
    return `${displayRating.toFixed(1)} / 5.0`;
  }, [displayRating]);

  const selectRating = (value: number) => {
    onUpdateFormData({ [config.ratingKey]: value } as Partial<ReviewFormData>);
  };

  const applyRecommendation = (suggestion: CategoryConfig['suggestions'][number]) => {
    const updates: Partial<ReviewFormData> = {};

    if (!currentFeedback || currentFeedback.trim().length === 0) {
      (updates as Record<string, unknown>)[config.feedbackKey] = suggestion.description || suggestion.label;
    } else {
      // If feedback exists, append the suggestion description
      const existingFeedback = currentFeedback.trim();
      const suggestionText = suggestion.description || suggestion.label;
      (updates as Record<string, unknown>)[config.feedbackKey] = existingFeedback + (existingFeedback ? ' ' : '') + suggestionText;
    }

    onUpdateFormData(updates);
  };

  const isSelected = (suggestion: CategoryConfig['suggestions'][number]) =>
    currentFeedback && (currentFeedback.includes(suggestion.label) || currentFeedback.includes(suggestion.description || ''));

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <header className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-pink-500 font-semibold">Step</p>
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 break-words">{config.title}</h2>
        <p className="text-xs sm:text-sm text-gray-600 max-w-full mx-auto break-words">{config.subtitle}</p>
      </header>

      <section className="bg-gradient-to-br from-pink-50 via-rose-50 to-fuchsia-50 border border-pink-200/60 rounded-2xl p-4 sm:p-6 shadow-sm text-center space-y-4 w-full max-w-full overflow-x-hidden">
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs uppercase tracking-[0.2em] text-pink-600 font-semibold">Your rating</p>
          <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
            <div
              className="flex items-center flex-shrink-0"
              onMouseLeave={() => setHoverValue(null)}
            >
              {Array.from({ length: 5 }, (_, index) => {
                const starIndex = index + 1;
                const fullValue = starIndex;
                const halfValue = starIndex - 0.5;
                const isFull = displayRating >= fullValue;
                const isHalf = !isFull && displayRating === halfValue;

                return (
                  <div key={index} className="relative w-8 h-8 sm:w-10 sm:h-10 cursor-pointer flex-shrink-0">
                    <Star className="w-8 h-8 sm:w-10 sm:h-10 text-gray-300" />
                    {(isFull || isHalf) && (
                      <div className={cn('absolute left-0 top-0 h-full overflow-hidden pointer-events-none', isFull ? 'w-full' : 'w-1/2')}>
                        <Star className="w-8 h-8 sm:w-10 sm:h-10 text-pink-500 fill-current" />
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label={`Set ${config.title} rating to ${(halfValue).toFixed(1)} stars`}
                      className="absolute left-0 top-0 h-full w-1/2"
                      onMouseEnter={() => setHoverValue(halfValue)}
                      onFocus={() => setHoverValue(halfValue)}
                      onBlur={() => setHoverValue(null)}
                      onClick={() => selectRating(halfValue)}
                    />
                    <button
                      type="button"
                      aria-label={`Set ${config.title} rating to ${fullValue.toFixed(1)} stars`}
                      className="absolute right-0 top-0 h-full w-1/2"
                      onMouseEnter={() => setHoverValue(fullValue)}
                      onFocus={() => setHoverValue(fullValue)}
                      onBlur={() => setHoverValue(null)}
                      onClick={() => selectRating(fullValue)}
                    />
                  </div>
                );
              })}
            </div>
            <span className="text-2xl sm:text-3xl font-extrabold text-gray-900 break-words">{ratingLabel}</span>
          </div>
          {config.helperText && (
            <p className="text-xs text-pink-500 break-words">{config.helperText}</p>
          )}
          {errors[config.ratingKey] && (
            <p className="text-xs sm:text-sm text-red-600 break-words">{errors[config.ratingKey]}</p>
          )}
        </div>
      </section>

      {canCopyFromPrevious && (
        <section className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 w-full max-w-full overflow-x-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-blue-900 break-words">Copy from previous review at this venue?</p>
              <p className="text-xs text-blue-700 mt-1 break-words">
                You've reviewed this venue before. Copy your venue and location ratings and feedback.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyFromPrevious}
              className="sm:ml-4 border-blue-300 text-blue-700 hover:bg-blue-100 flex-shrink-0"
            >
              <Copy className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Copy
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-3 w-full max-w-full overflow-x-hidden">
        <Label htmlFor={`${config.ratingKey}-feedback`} className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          Add a quick note (optional)
        </Label>
        <Textarea
          id={`${config.ratingKey}-feedback`}
          placeholder="Share any highlights or watch-outs for future fans..."
          value={currentFeedback}
          onChange={(event) => onUpdateFormData({ [config.feedbackKey]: event.target.value } as Partial<ReviewFormData>)}
          rows={4}
          className="resize-none text-sm sm:text-base w-full max-w-full min-w-0"
          maxLength={400}
        />
        <p className="text-xs text-gray-400 text-right">
          {(currentFeedback || '').length}/400
        </p>
      </section>

      <section className="space-y-3 w-full max-w-full overflow-x-hidden">
        <p className="text-sm font-medium text-gray-900">Need inspiration? Tap a vibe:</p>
        <div className="flex flex-wrap gap-2">
          {config.suggestions
            .sort((a, b) => {
              // Sort: positive (green) first, then negative (red)
              if (a.sentiment === 'positive' && b.sentiment === 'negative') return -1;
              if (a.sentiment === 'negative' && b.sentiment === 'positive') return 1;
              return 0;
            })
            .map((suggestion) => (
            <Button
              key={suggestion.id}
              type="button"
              variant="tertiary"
              className={cn(
                'flex-shrink-0',
                isSelected(suggestion) && suggestion.sentiment === 'positive' && 'bg-emerald-500 text-white hover:bg-emerald-600 border-emerald-500',
                isSelected(suggestion) && suggestion.sentiment === 'negative' && 'bg-rose-500 text-white hover:bg-rose-600 border-rose-500'
              )}
              style={!isSelected(suggestion) ? {
                height: '25px',
                paddingLeft: 'var(--spacing-small, 12px)',
                paddingRight: 'var(--spacing-small, 12px)',
                backgroundColor: suggestion.sentiment === 'positive' ? '#ECFDF5' : '#FFF1F2',
                color: suggestion.sentiment === 'positive' ? '#047857' : '#BE123C',
                border: suggestion.sentiment === 'positive' ? '2px solid #10B981' : '2px solid #F43F5E',
                borderRadius: '999px',
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                boxShadow: 'none'
              } : {
                height: '25px',
                paddingLeft: 'var(--spacing-small, 12px)',
                paddingRight: 'var(--spacing-small, 12px)',
                borderRadius: '999px',
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
              }}
              onClick={() => applyRecommendation(suggestion)}
            >
              {suggestion.label}
            </Button>
          ))}
        </div>
      </section>

      {children && (
        <section className="space-y-4 w-full max-w-full overflow-x-hidden">
          {children}
        </section>
      )}
    </div>
  );
}

