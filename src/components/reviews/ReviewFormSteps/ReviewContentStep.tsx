import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReviewFormData } from '@/hooks/useReviewForm';
import { PhotoUpload, VideoUpload } from '@/components/ui/photo-upload';
import { useAuth } from '@/hooks/useAuth';
import { Users } from 'lucide-react';
import { AttendeeSelector } from '@/components/reviews/AttendeeSelector';
import { Card, CardContent } from '@/components/ui/card';

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
  const { user } = useAuth();

  const characterCount = formData.reviewText.length;
  const maxCharacters = 500;
  const isNearLimit = characterCount > maxCharacters * 0.8;

  const handleEmojiSelect = (emoji: string) => {
    onUpdateFormData({
      reactionEmoji: formData.reactionEmoji === emoji ? '' : emoji,
    });
  };

  return (
    <div className="space-y-8">
      <header className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-pink-500 font-semibold">Almost there</p>
        <h2 className="text-2xl font-semibold text-gray-900">Share the story</h2>
        <p className="text-sm text-gray-600 max-w-xl mx-auto">
          Bring the show to life with a short recap, a reaction emoji, and any photos you snapped.
        </p>
      </header>

      <div className="space-y-4">
        <Label htmlFor="reviewText" className="text-base font-semibold text-gray-900">
          Overall Experience *
        </Label>
        <Textarea
          id="reviewText"
          placeholder="What made this night unforgettable? Any standout moments future fans should know?"
          value={formData.reviewText}
          onChange={(event) => onUpdateFormData({ reviewText: event.target.value })}
          rows={6}
          className="resize-none text-base"
          maxLength={maxCharacters}
        />
        <div className="flex justify-between items-center text-xs text-gray-500">
          <span>Minimum 1-2 sentences is perfect.</span>
          <span className={cn(isNearLimit ? 'text-orange-600' : 'text-gray-500')}>
            {characterCount}/{maxCharacters}
          </span>
        </div>
        {errors.reviewText && (
          <p className="text-sm text-red-600">{errors.reviewText}</p>
        )}
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-semibold text-gray-900">Set the vibe (optional)</Label>
        <div className="flex flex-wrap gap-2">
          {emojiOptions.map((option) => {
            const isActive = formData.reactionEmoji === option.emoji;
            return (
              <Button
                key={option.emoji}
                type="button"
                variant={isActive ? 'default' : 'outline'}
                className={cn(
                  'h-auto py-2 px-3 rounded-full text-base border border-pink-200/60',
                  isActive ? 'bg-pink-500 text-white hover:bg-pink-600' : 'bg-white text-gray-700 hover:bg-pink-50'
                )}
                onClick={() => handleEmojiSelect(option.emoji)}
              >
                <span className="mr-2 text-lg">{option.emoji}</span>
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>

      {user && (
        <PhotoUpload
          value={formData.photos || []}
          onChange={(urls) => onUpdateFormData({ photos: urls })}
          userId={user.id}
          bucket="review-photos"
          maxPhotos={5}
          maxSizeMB={5}
          label="Photos (Optional)"
          helperText="Add up to 5 photos to give fans a feel for the night."
        />
      )}

      {user && (
        <VideoUpload
          value={formData.videos || []}
          onChange={(videos) => onUpdateFormData({ videos })}
          userId={user.id}
          bucket="review-videos"
          maxVideos={3}
          maxSizeMB={100}
          label="Videos (Optional)"
          helperText="Add videos from the event (max 100MB per video)"
        />
      )}

      {user && (
        <Card className="border-2 border-pink-100 bg-gradient-to-br from-pink-50/50 to-purple-50/30">
          <CardContent className="p-8 pb-12">
            <div className="flex items-center gap-2 mb-6">
              <Users className="w-6 h-6 text-pink-600" />
              <h3 className="text-lg font-semibold text-gray-900">Who tagged along? (Optional)</h3>
            </div>
            <AttendeeSelector
              value={formData.attendees}
              onChange={(attendees) => onUpdateFormData({ attendees })}
              userId={user.id}
              metOnSynth={formData.metOnSynth}
              onMetOnSynthChange={(metOnSynth) => onUpdateFormData({ metOnSynth })}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
