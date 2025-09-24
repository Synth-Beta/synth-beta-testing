import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { VENUE_TAGS } from '@/services/reviewService';
import type { ReviewFormData } from '@/hooks/useReviewForm';

interface ReviewContentStepProps {
  formData: ReviewFormData;
  errors: Record<string, string>;
  onUpdateFormData: (updates: Partial<ReviewFormData>) => void;
}

const emojiOptions = [
  { emoji: '🔥', label: 'Fire', description: 'Incredible energy' },
  { emoji: '🤩', label: 'Starstruck', description: 'Mind-blowing' },
  { emoji: '🎵', label: 'Musical', description: 'Perfect music' },
  { emoji: '💯', label: 'Perfect', description: 'Absolutely amazing' },
  { emoji: '⚡', label: 'Electric', description: 'High energy' },
  { emoji: '❤️', label: 'Love', description: 'Loved every moment' },
  { emoji: '🎉', label: 'Party', description: 'Great party vibes' },
  { emoji: '✨', label: 'Magical', description: 'Magical experience' },
];

export function ReviewContentStep({ formData, errors, onUpdateFormData }: ReviewContentStepProps) {
  const [selectedVenueTags, setSelectedVenueTags] = useState<string[]>([]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateFormData({ reviewText: e.target.value });
  };

  const handleVenueTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateFormData({ venueReviewText: e.target.value });
  };

  // artist review removed

  const toggleVenueTag = (tag: string) => {
    const newTags = selectedVenueTags.includes(tag)
      ? selectedVenueTags.filter(t => t !== tag)
      : [...selectedVenueTags, tag];
    setSelectedVenueTags(newTags);
    // We'll update this when we implement the venue tags in the form data
  };

  // artist tags removed

  // reactions removed per design

  const characterCount = formData.reviewText.length;
  const maxCharacters = 500;
  const isNearLimit = characterCount > maxCharacters * 0.8;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Share Your Experience</h2>
        <p className="text-sm text-gray-600">Tell others about the artist performance and venue experience</p>
      </div>

      {/* Reactions removed */}

      {/* Event qualitative review (required) */}
      <div className="space-y-3">
          <Label htmlFor="reviewText" className="text-sm font-medium">
            Overall Experience (Required)
          </Label>
          <Textarea
            id="reviewText"
            placeholder="Share your overall thoughts about the concert experience..."
            value={formData.reviewText}
            onChange={handleTextChange}
            rows={4}
            className="resize-none"
            maxLength={maxCharacters}
          />
          <div className="flex justify-end items-center">
            <span className={cn(
              "text-xs",
              isNearLimit ? "text-orange-600" : "text-gray-500"
            )}>
              {characterCount}/{maxCharacters}
            </span>
          </div>
          {errors.reviewText && (
            <p className="text-sm text-red-600">{errors.reviewText}</p>
          )}
      </div>

      {/* Optional Venue section: Rating, Notes, Tags */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Optional: Venue Rating</Label>
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }, (_, i) => {
            const starVal = i + 1;
            const active = (formData.venueRating || 0) >= starVal;
            return (
              <button key={i} type="button" className="p-0.5" onClick={() => onUpdateFormData({ venueRating: starVal })} aria-label={`Venue ${starVal} stars`}>
                <Star className={cn('w-6 h-6', active ? 'text-yellow-400 fill-current' : 'text-gray-300')} />
              </button>
            );
          })}
        </div>

        <Label htmlFor="venueReviewText" className="text-sm font-medium">Optional: Venue Notes</Label>
        <Textarea id="venueReviewText" placeholder="How was the venue? Sound, staff, facilities, accessibility, parking..." value={formData.venueReviewText} onChange={handleVenueTextChange} rows={3} className="resize-none" maxLength={300} />
        <div className="flex justify-end"><span className="text-xs text-gray-500">{formData.venueReviewText.length}/300</span></div>
        {errors.venueReviewText && (<p className="text-sm text-red-600">{errors.venueReviewText}</p>)}

        <div className="space-y-2">
          <Label className="text-sm font-medium">Optional: Venue Tags</Label>
          <div className="flex flex-wrap gap-2">
            {VENUE_TAGS.slice(0, 10).map((tag) => (
              <Button key={tag} type="button" variant={selectedVenueTags.includes(tag) ? 'default' : 'outline'} size="sm" onClick={() => toggleVenueTag(tag)} className="text-xs h-7">
                {tag.replace('-', ' ')}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Tips removed per design */}

      {/* Preview removed */}

      {/* Footer removed */}
    </div>
  );
}
