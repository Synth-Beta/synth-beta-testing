import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smile, Image, Video, Music, Heart, Zap, Fire } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateFormData({ reviewText: e.target.value });
  };

  const handleEmojiSelect = (emoji: string) => {
    onUpdateFormData({ reactionEmoji: emoji });
    setShowEmojiPicker(false);
  };

  const characterCount = formData.reviewText.length;
  const maxCharacters = 500;
  const isNearLimit = characterCount > maxCharacters * 0.8;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Share Your Experience</h2>
        <p className="text-sm text-gray-600">Tell others about your concert experience (optional)</p>
      </div>

      {/* Emoji Reaction */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Quick Reaction</Label>
        <div className="flex items-center space-x-3">
          {formData.reactionEmoji ? (
            <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <span className="text-2xl">{formData.reactionEmoji}</span>
              <span className="text-sm font-medium text-blue-800">
                {emojiOptions.find(opt => opt.emoji === formData.reactionEmoji)?.label}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onUpdateFormData({ reactionEmoji: '' })}
                className="text-blue-600 hover:text-blue-800"
              >
                ×
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="flex items-center space-x-2"
            >
              <Smile className="w-4 h-4" />
              <span>Add Reaction</span>
            </Button>
          )}
        </div>

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="grid grid-cols-4 gap-2 p-3 bg-gray-50 rounded-lg border">
            {emojiOptions.map(({ emoji, label, description }) => (
              <Button
                key={emoji}
                type="button"
                variant="ghost"
                onClick={() => handleEmojiSelect(emoji)}
                className="flex flex-col items-center space-y-1 p-2 h-auto hover:bg-white"
              >
                <span className="text-xl">{emoji}</span>
                <span className="text-xs text-gray-600">{label}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Review Text */}
      <div className="space-y-3">
        <Label htmlFor="reviewText" className="text-sm font-medium">
          Written Review (Optional)
        </Label>
        <Textarea
          id="reviewText"
          placeholder="Share your thoughts about the concert... What made it special? How was the sound, crowd, venue, etc.?"
          value={formData.reviewText}
          onChange={handleTextChange}
          rows={6}
          className="resize-none"
          maxLength={maxCharacters}
        />
        <div className="flex justify-between items-center">
          <div className="flex space-x-2">
            <Badge variant="outline" className="text-xs">
              <Image className="w-3 h-3 mr-1" />
              Photos coming soon
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Video className="w-3 h-3 mr-1" />
              Videos coming soon
            </Badge>
          </div>
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

      {/* Writing Tips */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">💡 Writing Tips</h4>
        <div className="space-y-1 text-xs text-blue-800">
          <p>• <strong>Sound quality:</strong> How was the audio and acoustics?</p>
          <p>• <strong>Crowd energy:</strong> What was the atmosphere like?</p>
          <p>• <strong>Setlist:</strong> Did they play your favorite songs?</p>
          <p>• <strong>Venue:</strong> How was the location and facilities?</p>
          <p>• <strong>Overall experience:</strong> What made it memorable?</p>
        </div>
      </div>

      {/* Preview */}
      {(formData.reactionEmoji || formData.reviewText) && (
        <div className="p-4 bg-gray-50 rounded-lg border">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Review Preview</h4>
          <div className="flex items-start space-x-2">
            {formData.reactionEmoji && (
              <span className="text-xl">{formData.reactionEmoji}</span>
            )}
            <div className="flex-1">
              {formData.reviewText ? (
                <p className="text-sm text-gray-700 leading-relaxed">{formData.reviewText}</p>
              ) : (
                <p className="text-sm text-gray-500 italic">No written review yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Skip Option */}
      <div className="text-center">
        <p className="text-sm text-gray-500">
          Don't want to write a review? That's okay! You can always add one later.
        </p>
      </div>
    </div>
  );
}
