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
  maxCharacters?: number; // Allow different max characters based on flow
}

export function ReviewContentStep({ formData, errors, onUpdateFormData, maxCharacters = 500 }: ReviewContentStepProps) {
  const { user } = useAuth();

  const characterCount = formData.reviewText.length;
  const isNearLimit = characterCount > maxCharacters * 0.8;

  return (
    <div className="space-y-8">
      <header className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-pink-500 font-semibold">Almost there</p>
        <h2 className="text-2xl font-semibold text-gray-900">Share the story</h2>
        <p className="text-sm text-gray-600 max-w-xl mx-auto">
          Bring the show to life with a short recap and any photos you snapped.
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
        <div className="flex justify-between items-center" style={{
          fontFamily: 'var(--font-family)',
          fontSize: 'var(--typography-meta-size, 16px)',
          fontWeight: 'var(--typography-meta-weight, 500)',
          lineHeight: 'var(--typography-meta-line-height, 1.5)',
          color: 'var(--neutral-600)'
        }}>
          <span style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-meta-size, 16px)',
            fontWeight: 'var(--typography-meta-weight, 500)',
            lineHeight: 'var(--typography-meta-line-height, 1.5)',
            color: 'var(--neutral-900)'
          }}>Minimum 1-2 sentences is perfect.</span>
          <span style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-meta-size, 16px)',
            fontWeight: 'var(--typography-meta-weight, 500)',
            lineHeight: 'var(--typography-meta-line-height, 1.5)',
            color: isNearLimit ? 'var(--status-warning-500, #B88900)' : 'var(--neutral-600)'
          }}>
            {characterCount}/{maxCharacters}
          </span>
        </div>
        {errors.reviewText && (
          <p className="text-sm text-red-600">{errors.reviewText}</p>
        )}
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
