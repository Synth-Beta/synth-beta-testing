import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Smile, Image, Video, Music, Heart, Zap, Fire, Star, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VENUE_TAGS, ARTIST_TAGS } from '@/services/reviewService';
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
  const [selectedVenueTags, setSelectedVenueTags] = useState<string[]>([]);
  const [selectedArtistTags, setSelectedArtistTags] = useState<string[]>([]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateFormData({ reviewText: e.target.value });
  };

  const handleVenueTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateFormData({ venueReviewText: e.target.value });
  };

  const handleArtistTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateFormData({ artistReviewText: e.target.value });
  };

  const toggleVenueTag = (tag: string) => {
    const newTags = selectedVenueTags.includes(tag)
      ? selectedVenueTags.filter(t => t !== tag)
      : [...selectedVenueTags, tag];
    setSelectedVenueTags(newTags);
    // We'll update this when we implement the venue tags in the form data
  };

  const toggleArtistTag = (tag: string) => {
    const newTags = selectedArtistTags.includes(tag)
      ? selectedArtistTags.filter(t => t !== tag)
      : [...selectedArtistTags, tag];
    setSelectedArtistTags(newTags);
    // We'll update this when we implement the artist tags in the form data
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
        <p className="text-sm text-gray-600">Tell others about the artist performance and venue experience</p>
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

      {/* Tabbed Review Content */}
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="artist" className="flex items-center gap-1">
            <Star className="w-3 h-3" />
            Artist
          </TabsTrigger>
          <TabsTrigger value="venue" className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            Venue
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="general" className="space-y-3">
          <Label htmlFor="reviewText" className="text-sm font-medium">
            Overall Experience (Optional)
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
        </TabsContent>
        
        <TabsContent value="artist" className="space-y-4">
          <div className="space-y-3">
            <Label htmlFor="artistReviewText" className="text-sm font-medium">
              Artist Performance Review (Optional)
            </Label>
            <Textarea
              id="artistReviewText"
              placeholder="How was the artist's performance? Energy, vocals, stage presence, setlist..."
              value={formData.artistReviewText}
              onChange={handleArtistTextChange}
              rows={3}
              className="resize-none"
              maxLength={300}
            />
            <div className="flex justify-end">
              <span className="text-xs text-gray-500">
                {formData.artistReviewText.length}/300
              </span>
            </div>
            {errors.artistReviewText && (
              <p className="text-sm text-red-600">{errors.artistReviewText}</p>
            )}
          </div>
          
          {/* Artist Tags */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Artist Performance Tags</Label>
            <div className="flex flex-wrap gap-2">
              {ARTIST_TAGS.slice(0, 10).map((tag) => (
                <Button
                  key={tag}
                  type="button"
                  variant={selectedArtistTags.includes(tag) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleArtistTag(tag)}
                  className="text-xs h-7"
                >
                  {tag.replace('-', ' ')}
                </Button>
              ))}
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="venue" className="space-y-4">
          <div className="space-y-3">
            <Label htmlFor="venueReviewText" className="text-sm font-medium">
              Venue Experience Review (Optional)
            </Label>
            <Textarea
              id="venueReviewText"
              placeholder="How was the venue? Sound quality, staff, facilities, accessibility, parking..."
              value={formData.venueReviewText}
              onChange={handleVenueTextChange}
              rows={3}
              className="resize-none"
              maxLength={300}
            />
            <div className="flex justify-end">
              <span className="text-xs text-gray-500">
                {formData.venueReviewText.length}/300
              </span>
            </div>
            {errors.venueReviewText && (
              <p className="text-sm text-red-600">{errors.venueReviewText}</p>
            )}
          </div>
          
          {/* Venue Tags */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Venue Experience Tags</Label>
            <div className="flex flex-wrap gap-2">
              {VENUE_TAGS.slice(0, 10).map((tag) => (
                <Button
                  key={tag}
                  type="button"
                  variant={selectedVenueTags.includes(tag) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleVenueTag(tag)}
                  className="text-xs h-7"
                >
                  {tag.replace('-', ' ')}
                </Button>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Writing Tips */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">💡 Review Tips</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h5 className="text-xs font-semibold text-yellow-700 mb-1">🎤 Artist Performance</h5>
            <div className="space-y-1 text-xs text-blue-800">
              <p>• Energy and stage presence</p>
              <p>• Vocal quality and sound</p>
              <p>• Setlist and song choices</p>
              <p>• Interaction with audience</p>
            </div>
          </div>
          <div>
            <h5 className="text-xs font-semibold text-green-700 mb-1">🏟️ Venue Experience</h5>
            <div className="space-y-1 text-xs text-blue-800">
              <p>• Sound quality and acoustics</p>
              <p>• Staff friendliness and service</p>
              <p>• Facilities and cleanliness</p>
              <p>• Accessibility and parking</p>
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      {(formData.reactionEmoji || formData.reviewText || formData.artistReviewText || formData.venueReviewText) && (
        <div className="p-4 bg-gray-50 rounded-lg border">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Review Preview</h4>
          <div className="space-y-3">
            {formData.reactionEmoji && (
              <div className="flex items-center space-x-2">
                <span className="text-xl">{formData.reactionEmoji}</span>
                <span className="text-sm font-medium text-gray-700">
                  {emojiOptions.find(opt => opt.emoji === formData.reactionEmoji)?.label}
                </span>
              </div>
            )}
            {formData.reviewText && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Overall Experience:</p>
                <p className="text-sm text-gray-700 leading-relaxed">{formData.reviewText}</p>
              </div>
            )}
            {formData.artistReviewText && (
              <div>
                <p className="text-xs font-semibold text-yellow-600 mb-1">🎤 Artist Performance:</p>
                <p className="text-sm text-gray-700 leading-relaxed">{formData.artistReviewText}</p>
              </div>
            )}
            {formData.venueReviewText && (
              <div>
                <p className="text-xs font-semibold text-green-600 mb-1">🏟️ Venue Experience:</p>
                <p className="text-sm text-gray-700 leading-relaxed">{formData.venueReviewText}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Skip Option */}
      <div className="text-center">
        <p className="text-sm text-gray-500">
          Written reviews are optional! Your ratings alone are valuable feedback.
        </p>
      </div>
    </div>
  );
}
