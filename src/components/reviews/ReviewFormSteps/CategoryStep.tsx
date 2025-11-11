import React, { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewFormData } from '@/hooks/useReviewForm';

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

type RecommendationKey =
  | 'artistPerformanceRecommendation'
  | 'productionRecommendation'
  | 'venueRecommendation'
  | 'locationRecommendation'
  | 'valueRecommendation';

export interface CategoryConfig {
  title: string;
  subtitle: string;
  ratingKey: RatingKey;
  feedbackKey: FeedbackKey;
  recommendationKey: RecommendationKey;
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
}

export function CategoryStep({ config, formData, errors, onUpdateFormData, children }: CategoryStepProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const currentRating = formData[config.ratingKey] as number;
  const currentFeedback = formData[config.feedbackKey] as string;
  const currentRecommendation = formData[config.recommendationKey] as string;

  const displayRating = hoverValue ?? currentRating ?? 0;

  const ratingLabel = useMemo(() => {
    if (!displayRating) return 'Not rated yet';
    return `${displayRating.toFixed(1)} / 5.0`;
  }, [displayRating]);

  const selectRating = (value: number) => {
    onUpdateFormData({ [config.ratingKey]: value } as Partial<ReviewFormData>);
  };

  const applyRecommendation = (suggestion: CategoryConfig['suggestions'][number]) => {
    const updates: Partial<ReviewFormData> = {
      [config.recommendationKey]: suggestion.label,
    } as Partial<ReviewFormData>;

    if (!currentFeedback || currentFeedback.trim().length === 0) {
      (updates as Record<string, unknown>)[config.feedbackKey] = suggestion.description || suggestion.label;
    }

    onUpdateFormData(updates);
  };

  const isSelected = (suggestion: CategoryConfig['suggestions'][number]) =>
    currentRecommendation === suggestion.label;

  return (
    <div className="space-y-8">
      <header className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-pink-500 font-semibold">Step</p>
        <h2 className="text-2xl font-semibold text-gray-900">{config.title}</h2>
        <p className="text-sm text-gray-600 max-w-xl mx-auto">{config.subtitle}</p>
      </header>

      <section className="bg-gradient-to-br from-pink-50 via-rose-50 to-fuchsia-50 border border-pink-200/60 rounded-2xl p-8 shadow-sm text-center space-y-6">
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm uppercase tracking-[0.2em] text-pink-600 font-semibold">Your rating</p>
          <div className="flex items-center justify-center gap-4">
            <div
              className="flex items-center"
              onMouseLeave={() => setHoverValue(null)}
            >
              {Array.from({ length: 5 }, (_, index) => {
                const starIndex = index + 1;
                const fullValue = starIndex;
                const halfValue = starIndex - 0.5;
                const isFull = displayRating >= fullValue;
                const isHalf = !isFull && displayRating === halfValue;

                return (
                  <div key={index} className="relative w-12 h-12 cursor-pointer">
                    <Star className="w-12 h-12 text-gray-300" />
                    {(isFull || isHalf) && (
                      <div className={cn('absolute left-0 top-0 h-full overflow-hidden pointer-events-none', isFull ? 'w-full' : 'w-1/2')}>
                        <Star className="w-12 h-12 text-pink-500 fill-current" />
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
            <span className="text-4xl font-extrabold text-gray-900">{ratingLabel}</span>
          </div>
          {config.helperText && (
            <p className="text-xs text-pink-500">{config.helperText}</p>
          )}
          {errors[config.ratingKey] && (
            <p className="text-sm text-red-600">{errors[config.ratingKey]}</p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <Label htmlFor={`${config.ratingKey}-feedback`} className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          Add a quick note (optional)
        </Label>
        <Textarea
          id={`${config.ratingKey}-feedback`}
          placeholder="Share any highlights or watch-outs for future fans..."
          value={currentFeedback}
          onChange={(event) => onUpdateFormData({ [config.feedbackKey]: event.target.value } as Partial<ReviewFormData>)}
          rows={4}
          className="resize-none text-base"
          maxLength={400}
        />
        <p className="text-xs text-gray-400 text-right">
          {(currentFeedback || '').length}/400
        </p>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-medium text-gray-900">Need inspiration? Tap a vibe:</p>
        <div className="flex flex-wrap gap-2">
          {config.suggestions.map((suggestion) => (
            <Button
              key={suggestion.id}
              type="button"
              variant={isSelected(suggestion) ? 'default' : 'outline'}
              className={cn(
                'px-3 py-1.5 text-sm rounded-full border',
                suggestion.sentiment === 'positive'
                  ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                  : 'border-rose-200 text-rose-700 hover:bg-rose-50',
                isSelected(suggestion) && 'bg-pink-500 text-white hover:bg-pink-600 border-transparent'
              )}
              onClick={() => applyRecommendation(suggestion)}
            >
              {suggestion.label}
            </Button>
          ))}
        </div>
      </section>

      {children && (
        <section className="space-y-4">
          {children}
        </section>
      )}
    </div>
  );
}

