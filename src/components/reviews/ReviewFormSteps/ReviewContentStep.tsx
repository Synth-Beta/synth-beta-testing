import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReviewFormData } from '@/hooks/useReviewForm';
import { PhotoUpload } from '@/components/ui/photo-upload';
import { useAuth } from '@/hooks/useAuth';
import { CustomSetlistInput, type CustomSetlistSong } from '@/components/reviews/CustomSetlistInput';
import { Music, Users } from 'lucide-react';
import { SetlistModal } from '@/components/reviews/SetlistModal';
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
  const [showSetlistModal, setShowSetlistModal] = useState(false);
  
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateFormData({ reviewText: e.target.value });
  };

  const handleVenueReviewTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateFormData({ venueReviewText: e.target.value });
  };

  const handlePhotosChange = (urls: string[]) => {
    onUpdateFormData({ photos: urls });
  };

  const handleCustomSetlistChange = (songs: CustomSetlistSong[]) => {
    onUpdateFormData({ customSetlist: songs });
  };

  const handleSetlistSelect = (setlist: any) => {
    console.log('🎵 ReviewContentStep: Setlist selected:', setlist);
    onUpdateFormData({ selectedSetlist: setlist });
  };

  const handleAttendeesChange = (attendees: any[]) => {
    onUpdateFormData({ attendees });
  };

  const handleMetOnSynthChange = (metOnSynth: boolean) => {
    onUpdateFormData({ metOnSynth });
  };

  console.log('🎵 ReviewContentStep: Modal data being passed:', {
    artistName: formData.selectedArtist?.name,
    venueName: formData.selectedVenue?.name,
    eventDate: formData.eventDate,
    hasSelectedSetlist: !!formData.selectedSetlist
  });

  const characterCount = formData.reviewText.length;
  const venueReviewCharacterCount = formData.venueReviewText.length;
  const maxCharacters = 500;
  const maxVenueCharacters = 300;
  const isNearLimit = characterCount > maxCharacters * 0.8;
  const isVenueNearLimit = venueReviewCharacterCount > maxVenueCharacters * 0.8;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Share Your Experience</h2>
        <p className="text-sm text-gray-600">Tell others about the artist performance and venue experience</p>
      </div>

      {/* Venue qualitative review (optional) */}
      <div className="space-y-3">
          <Label htmlFor="venueReviewText" className="text-sm font-medium">
            Venue Experience (Optional)
          </Label>
          <Textarea
            id="venueReviewText"
            placeholder="Share your thoughts about the venue - sound quality, staff, facilities, atmosphere..."
            value={formData.venueReviewText}
            onChange={handleVenueReviewTextChange}
            rows={3}
            className="resize-none"
            maxLength={maxVenueCharacters}
          />
          <div className="flex justify-end items-center">
            <span className={cn(
              "text-xs",
              isVenueNearLimit ? "text-orange-600" : "text-gray-500"
            )}>
              {venueReviewCharacterCount}/{maxVenueCharacters}
            </span>
          </div>
          {errors.venueReviewText && (
            <p className="text-sm text-red-600">{errors.venueReviewText}</p>
          )}
      </div>

      {/* Event qualitative review (required) */}
      <div className="space-y-3">
          <Label htmlFor="reviewText" className="text-sm font-medium">
            Overall Experience *
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

      {/* Setlist Options - API and Custom Together */}
      <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <Music className="w-5 h-5 text-purple-600" />
          <h3 className="text-sm font-semibold text-gray-900">Setlist (Optional)</h3>
          {formData.selectedSetlist && (
            <span className="text-xs text-green-600 font-medium">✓ Setlist Added</span>
          )}
        </div>
        
        {!formData.selectedSetlist ? (
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowSetlistModal(true)}
              className="w-full flex items-center justify-center gap-2"
            >
              <Music className="w-4 h-4" />
              Find Setlist from Setlist.fm
            </Button>
            <CustomSetlistInput
              songs={formData.customSetlist}
              onChange={handleCustomSetlistChange}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Setlist added from Setlist.fm ({formData.selectedSetlist.songCount || 0} songs)
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onUpdateFormData({ selectedSetlist: null })}
              className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Clear setlist
            </Button>
          </div>
        )}
      </div>

      {/* Setlist Modal */}
      <SetlistModal
        isOpen={showSetlistModal}
        onClose={() => setShowSetlistModal(false)}
        artistName={formData.selectedArtist?.name || ''}
        venueName={formData.selectedVenue?.name}
        eventDate={formData.eventDate}
        onSetlistSelect={handleSetlistSelect}
      />

      {/* Photo Upload */}
      {user && (
        <PhotoUpload
          value={formData.photos || []}
          onChange={handlePhotosChange}
          userId={user.id}
          bucket="review-photos"
          maxPhotos={5}
          maxSizeMB={5}
          label="Photos (Optional)"
          helperText="Add photos from the event to make your review more engaging"
        />
      )}
    </div>
  );
}
