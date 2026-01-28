import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewFormData } from '@/hooks/useReviewForm';
import { SetlistModal } from '@/components/reviews/SetlistModal';
import { CustomSetlistInput } from '@/components/reviews/CustomSetlistInput';
import { Button } from '@/components/ui/button';
import { Music, X, Plus } from 'lucide-react';
import type { ReviewCustomSetlist } from '@/hooks/useReviewForm';
import { PhotoUpload, VideoUpload } from '@/components/ui/photo-upload';
import { useAuth } from '@/hooks/useAuth';

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
  const { user } = useAuth();

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

  const handleCustomSetlistsChange = (setlists: ReviewFormData['customSetlists']) => {
    onUpdateFormData({ customSetlists: setlists });
  };

  const handleAddSetlist = () => {
    const autoTitled = formData.customSetlists.filter((s) => s.isAutoTitle);
    const nextNumber = autoTitled.length + 1;
    const newSetlist: ReviewCustomSetlist = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: `Setlist ${nextNumber}`,
      isAutoTitle: true,
      songs: [],
    };
    onUpdateFormData({ customSetlists: [...formData.customSetlists, newSetlist] });
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
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <header className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-pink-500 font-semibold">Quick Review</p>
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 break-words">Share your experience</h2>
        <p className="text-xs sm:text-sm text-gray-600 max-w-full mx-auto break-words">
          Rate the overall experience and share a brief recap.
        </p>
      </header>

      {/* Overall Rating */}
      <section className="bg-gradient-to-br from-pink-50 via-rose-50 to-fuchsia-50 border border-pink-200/60 rounded-2xl p-4 sm:p-6 shadow-sm text-center space-y-4 w-full max-w-full overflow-x-hidden">
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs uppercase tracking-[0.2em] text-pink-600 font-semibold">Overall Rating</p>
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
            <span className="text-base sm:text-lg font-semibold text-gray-700 break-words">
              {displayRating > 0 ? `${displayRating.toFixed(1)} / 5.0` : 'Not rated yet'}
            </span>
          </div>
          {errors.rating && (
            <p className="text-xs sm:text-sm text-red-600 break-words">{errors.rating}</p>
          )}
        </div>
      </section>

      {/* Brief Review + Media */}
      <div className="space-y-6 w-full max-w-full overflow-x-hidden">
        <div className="space-y-3">
          <Label htmlFor="quick-review-text" className="text-sm sm:text-base font-semibold text-gray-900">
            Brief Review *
          </Label>
          <Textarea
            id="quick-review-text"
            placeholder="What made this night memorable? Share a quick recap."
            value={formData.reviewText}
            onChange={(event) => onUpdateFormData({ reviewText: event.target.value })}
            rows={4}
            className="resize-none text-sm sm:text-base w-full max-w-full min-w-0"
            maxLength={maxCharacters}
          />
          <div
            className="flex justify-between items-center"
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              fontWeight: 'var(--typography-meta-weight, 500)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)',
              color: 'var(--neutral-600)',
            }}
          >
            <span
              className="break-words"
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--neutral-900)',
              }}
            >
              Keep it brief – 1–2 sentences is perfect.
            </span>
            <span
              className={cn('flex-shrink-0 ml-2')}
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: isNearLimit ? 'var(--status-warning-500, #B88900)' : 'var(--neutral-600)',
              }}
            >
              {characterCount}/{maxCharacters}
            </span>
          </div>
          {errors.reviewText && (
            <p className="text-xs sm:text-sm text-red-600 break-words">{errors.reviewText}</p>
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

      </div>

      {/* Optional Setlist */}
        <div className="space-y-3 w-full max-w-full overflow-x-hidden">
        <p className="text-sm sm:text-base font-semibold text-gray-900">Setlist (Optional)</p>
        <p className="text-xs sm:text-sm text-gray-600 break-words">
          Option to upload photos &amp; video, plus add the setlist if you remember it.
        </p>
        
        {formData.selectedSetlist ? (
          <div className="p-3 sm:p-4 bg-pink-50 rounded-lg border border-pink-200 w-full max-w-full overflow-x-hidden">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Music className="w-4 h-4 sm:w-5 sm:h-5 text-pink-600 flex-shrink-0" />
                <span className="font-semibold text-gray-900 text-sm sm:text-base truncate">Setlist Selected</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearSetlist}
                className="h-8 w-8 p-0 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 break-words">
              {formData.selectedSetlist.artist?.name} - {formatSetlistDate(formData.selectedSetlist.eventDate)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {formData.selectedSetlist.songCount || (formData.selectedSetlist.songs?.length || 0)} songs
            </p>
          </div>
        ) : (
          <div className="flex flex-col w-full">
            <div className="flex flex-col" style={{ gap: '6px' }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSetlistModalOpen(true)}
                className="flex items-center justify-center gap-2 w-full flex-shrink-0"
            >
              <Music className="w-4 h-4" />
              Import from setlist.fm
            </Button>
              <button
                type="button"
                onClick={handleAddSetlist}
                className="btn-synth-primary flex items-center justify-center gap-2 w-full"
                style={{
                  backgroundColor: 'var(--brand-pink-500, #FF3399)',
                  borderColor: 'var(--brand-pink-500, #FF3399)',
                  color: 'white',
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--brand-pink-500, #FF3399)';
                }}
              >
                <Plus style={{ width: 24, height: 24, color: 'white' }} />
                <span style={{ 
                  color: 'white',
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                }}>
                  {formData.customSetlists.length > 0 ? 'Add Another Setlist' : 'Add Setlist'}
                </span>
              </button>
            </div>
            <div style={{ marginTop: '12px' }}>
            <CustomSetlistInput
                setlists={formData.customSetlists}
                onChange={handleCustomSetlistsChange}
            />
            </div>
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

