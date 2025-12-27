import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewFormData } from '@/hooks/useReviewForm';
import { SetlistModal } from '@/components/reviews/SetlistModal';
import { CustomSetlistInput } from '@/components/reviews/CustomSetlistInput';
import { Button } from '@/components/ui/button';
import { Music, X } from 'lucide-react';

interface QuickReviewStepProps {
  formData: ReviewFormData;
  errors: Record<string, string>;
  onUpdateFormData: (updates: Partial<ReviewFormData>) => void;
  artistName?: string;
  venueName?: string;
  eventDate?: string;
}

export function QuickReviewStep({ formData, errors, onUpdateFormData, artistName, venueName, eventDate }: QuickReviewStepProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [isSetlistModalOpen, setIsSetlistModalOpen] = useState(false);

  const displayRating = hoverValue ?? formData.rating ?? 0;
  const characterCount = formData.reviewText.length;
  const maxCharacters = 200;
  const isNearLimit = characterCount > maxCharacters * 0.8;

  const handleSetlistSelect = (setlist: any) => {
    onUpdateFormData({ selectedSetlist: setlist });
    setIsSetlistModalOpen(false);
  };

  const handleClearSetlist = () => {
    onUpdateFormData({ selectedSetlist: null });
  };

  const handleCustomSetlistChange = (songs: any[]) => {
    onUpdateFormData({ customSetlist: songs });
  };

  const selectRating = (value: number) => {
    onUpdateFormData({ rating: value });
  };

  const formatSetlistDate = (date?: string) => {
    if (!date) return '';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-8">
      <header className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-pink-500 font-semibold">Quick Review</p>
        <h2 className="text-2xl font-semibold text-gray-900">Share your experience</h2>
        <p className="text-sm text-gray-600 max-w-xl mx-auto">
          Rate the overall experience and share a brief recap.
        </p>
      </header>

      {/* Overall Rating */}
      <section className="bg-gradient-to-br from-pink-50 via-rose-50 to-fuchsia-50 border border-pink-200/60 rounded-2xl p-8 shadow-sm text-center space-y-6">
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm uppercase tracking-[0.2em] text-pink-600 font-semibold">Overall Rating</p>
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
                      className="absolute inset-0"
                      onMouseEnter={() => setHoverValue(fullValue)}
                      onClick={() => selectRating(fullValue)}
                      aria-label={`Rate ${fullValue} stars`}
                    />
                    <button
                      type="button"
                      className="absolute inset-0 left-0 w-1/2"
                      onMouseEnter={() => setHoverValue(halfValue)}
                      onClick={() => selectRating(halfValue)}
                      aria-label={`Rate ${halfValue} stars`}
                    />
                  </div>
                );
              })}
            </div>
            <span className="text-lg font-semibold text-gray-700 min-w-[80px]">
              {displayRating > 0 ? `${displayRating.toFixed(1)} / 5.0` : 'Not rated yet'}
            </span>
          </div>
          {errors.rating && (
            <p className="text-sm text-red-600">{errors.rating}</p>
          )}
        </div>
      </section>

      {/* Review Text */}
      <div className="space-y-4">
        <Label htmlFor="reviewText" className="text-base font-semibold text-gray-900">
          Brief Review *
        </Label>
        <Textarea
          id="reviewText"
          placeholder="What made this night memorable? Share a quick recap."
          value={formData.reviewText}
          onChange={(event) => onUpdateFormData({ reviewText: event.target.value })}
          rows={4}
          className="resize-none text-base"
          maxLength={maxCharacters}
        />
        <div className="flex justify-between items-center text-xs text-gray-500">
          <span>Keep it brief - 1-2 sentences is perfect.</span>
          <span className={cn(isNearLimit ? 'text-orange-600' : 'text-gray-500')}>
            {characterCount}/{maxCharacters}
          </span>
        </div>
        {errors.reviewText && (
          <p className="text-sm text-red-600">{errors.reviewText}</p>
        )}
      </div>

      {/* Optional Setlist */}
      <div className="space-y-4">
        <Label className="text-base font-semibold text-gray-900">Setlist (Optional)</Label>
        <p className="text-sm text-gray-600">Add the setlist if you remember it</p>
        
        {formData.selectedSetlist ? (
          <div className="p-4 bg-pink-50 rounded-lg border border-pink-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Music className="w-5 h-5 text-pink-600" />
                <span className="font-semibold text-gray-900">Setlist Selected</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearSetlist}
                className="h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-gray-600">
              {formData.selectedSetlist.artist?.name} - {formatSetlistDate(formData.selectedSetlist.eventDate)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {formData.selectedSetlist.sets?.[0]?.song?.length || 0} songs
            </p>
          </div>
        ) : formData.customSetlist.length > 0 ? (
          <div className="p-4 bg-pink-50 rounded-lg border border-pink-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Music className="w-5 h-5 text-pink-600" />
                <span className="font-semibold text-gray-900">Custom Setlist</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onUpdateFormData({ customSetlist: [] })}
                className="h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-gray-600">{formData.customSetlist.length} songs</p>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSetlistModalOpen(true)}
              className="flex items-center gap-2"
            >
              <Music className="w-4 h-4" />
              Find Setlist
            </Button>
            <CustomSetlistInput
              songs={formData.customSetlist}
              onChange={handleCustomSetlistChange}
              artistName={artistName}
            />
          </div>
        )}

        {isSetlistModalOpen && artistName && (
          <SetlistModal
            isOpen={isSetlistModalOpen}
            onClose={() => setIsSetlistModalOpen(false)}
            artistName={artistName}
            venueName={venueName}
            eventDate={eventDate}
            onSetlistSelect={handleSetlistSelect}
          />
        )}
      </div>
    </div>
  );
}

