import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Globe, Lock, Check, Info, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewFormData } from '@/hooks/useReviewForm';

interface CategorySummary {
  label: string;
  rating?: number;
  annotation?: string;
}

interface PrivacySubmitStepProps {
  formData: ReviewFormData;
  errors: Record<string, string>;
  onUpdateFormData: (updates: Partial<ReviewFormData>) => void;
  onSubmit: () => void;
  isLoading: boolean;
  averageRating: number;
  categoryBreakdown: CategorySummary[];
}

export function PrivacySubmitStep({
  formData,
  errors,
  onUpdateFormData,
  onSubmit,
  isLoading,
  averageRating,
  categoryBreakdown
}: PrivacySubmitStepProps) {
  const handlePrivacyChange = (isPublic: boolean) => {
    onUpdateFormData({ isPublic });
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Date TBD';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return 'Date TBD';
    return parsed.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getRatingStars = (rating = 0, size: 'sm' | 'md' | 'lg' = 'sm') => {
    const sizeClass =
      size === 'lg' ? 'w-6 h-6' : size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
    const baseColor = size === 'lg' ? 'text-pink-200' : 'text-gray-300';
    const fillColor = size === 'lg' ? 'text-white' : 'text-yellow-400';

    return Array.from({ length: 5 }, (_, i) => {
      const starValue = i + 1;
      const isFullStar = rating >= starValue - 0.01;
      const isHalfStar = !isFullStar && rating >= starValue - 0.5 && rating < starValue;

      return (
        <div key={i} className="relative">
          <Star
            className={cn(sizeClass, isFullStar ? `${fillColor} fill-current drop-shadow` : baseColor)}
          />
          {isHalfStar && (
            <div className="absolute inset-0 overflow-hidden w-1/2">
              <Star className={`${sizeClass} ${fillColor} fill-current`} />
            </div>
          )}
        </div>
      );
    });
  };

  const roundedAverage =
    Number.isFinite(averageRating) && averageRating > 0
      ? Math.round(averageRating * 10) / 10
      : 0;
  const averageDisplay = roundedAverage ? roundedAverage.toFixed(1) : '—';
  const ticketPriceDisplay =
    formData.ticketPricePaid && !Number.isNaN(Number(formData.ticketPricePaid))
      ? Number(formData.ticketPricePaid).toFixed(2)
      : null;

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-pink-500 font-semibold">Final Step</p>
        <h2 className="text-2xl font-semibold text-gray-900">Review & Share</h2>
        <p className="text-sm text-gray-600 max-w-2xl mx-auto">
          Take a final look at your ratings, highlight anything fans should know, and choose who can see your review.
        </p>
      </div>

      <section className="rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-purple-500 text-white shadow-lg p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-white/80">Average rating</p>
            <div className="flex items-baseline gap-4 mt-2">
              <span className="text-5xl font-bold tracking-tight">{averageDisplay}</span>
              <div className="flex items-center gap-1">
                {getRatingStars(roundedAverage, 'lg')}
              </div>
            </div>
            <p className="text-sm text-white/80 mt-2">
              Based on five categories of your concert experience.
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            {formData.selectedArtist?.name && formData.selectedVenue?.name && (
              <div className="text-sm font-medium">
                {formData.selectedArtist?.name} @ {formData.selectedVenue?.name}
              </div>
            )}
            {formData.eventDate && (
              <div className="text-xs text-white/80 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {formatDate(formData.eventDate)}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {categoryBreakdown.map((category) => (
          <div
            key={category.label}
            className="rounded-xl border border-pink-100 bg-white shadow-sm p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">{category.label}</p>
                {category.annotation && (
                  <p className="text-xs text-gray-500 mt-1">{category.annotation}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-lg font-semibold text-gray-900">
                  {category.rating ? category.rating.toFixed(1) : '—'}
                </span>
                <div className="flex gap-0.5">
                  {getRatingStars(category.rating ?? 0, 'sm')}
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-4">
          <h3 className="font-medium text-gray-900 mb-3">What you're sharing</h3>
          <div className="space-y-3 text-sm text-gray-700">
            {formData.selectedArtist?.name && formData.selectedVenue?.name && (
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>
                  <strong>{formData.selectedArtist?.name}</strong> at{' '}
                  <strong>{formData.selectedVenue?.name}</strong>
                </span>
              </div>
            )}

            {formData.eventDate && (
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>{formatDate(formData.eventDate)}</span>
              </div>
            )}

            {ticketPriceDisplay && (
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>Ticket price (kept private): ${ticketPriceDisplay}</span>
              </div>
            )}

            {formData.reactionEmoji && (
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>
                  Reaction emoji: <span className="text-base">{formData.reactionEmoji}</span>
                </span>
              </div>
            )}

            {formData.reviewText && (
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-500 mt-0.5" />
                <span>
                  Written story ({formData.reviewText.length} characters)
                </span>
              </div>
            )}

            {Array.isArray(formData.photos) && formData.photos.length > 0 && (
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>{formData.photos.length} photo{formData.photos.length !== 1 ? 's' : ''} attached</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Label className="text-sm font-medium text-gray-900">Who can see this review?</Label>

        <div className="space-y-3">
          <div className="relative">
            <input
              type="radio"
              id="public"
              name="privacy"
              checked={formData.isPublic}
              onChange={() => handlePrivacyChange(true)}
              className="sr-only"
            />
            <label
              htmlFor="public"
              className={cn(
                'flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all duration-200',
                formData.isPublic ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <div
                className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                  formData.isPublic ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                )}
              >
                {formData.isPublic && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <Globe className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-gray-900">Public</span>
                  <Badge variant="secondary" className="text-xs">
                    Recommended
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Everyone can see your review. Help the community decide where to go.
                </p>
              </div>
            </label>
          </div>

          <div className="relative">
            <input
              type="radio"
              id="private"
              name="privacy"
              checked={!formData.isPublic}
              onChange={() => handlePrivacyChange(false)}
              className="sr-only"
            />
            <label
              htmlFor="private"
              className={cn(
                'flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all duration-200',
                !formData.isPublic ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <div
                className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                  !formData.isPublic ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                )}
              >
                {!formData.isPublic && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <Lock className="w-5 h-5 text-gray-600" />
                  <span className="font-medium text-gray-900">Private</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Only you can see this review. You can always share it later.
                </p>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-start space-x-2">
          <Info className="w-4 h-4 text-gray-600 mt-0.5" />
          <div className="text-sm text-gray-600">
            <p className="font-medium mb-1">About privacy:</p>
            <ul className="space-y-1 text-xs">
              <li>• Public reviews help the community discover amazing shows</li>
              <li>• You can change the privacy setting any time in your profile</li>
              <li>• Private reviews are only visible to you</li>
              <li>• All reviews follow Synth’s community guidelines</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="pt-6 pb-4">
        <Button
          onClick={onSubmit}
          disabled={isLoading}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white py-3 text-base font-medium"
        >
          {isLoading ? (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Submitting Review...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Check className="w-5 h-5" />
              <span>Submit Review</span>
            </div>
          )}
        </Button>

        {errors.submit && (
          <p className="text-sm text-red-600 text-center mt-2">{errors.submit}</p>
        )}
      </div>

      <div className="text-center">
        <p className="text-xs text-gray-500">
          By submitting, you agree to our terms of service and community guidelines.
        </p>
      </div>
    </div>
  );
}
