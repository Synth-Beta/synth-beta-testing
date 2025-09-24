import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import { useReviewForm } from '@/hooks/useReviewForm';
import { ReviewService, type ReviewData, type UserReview, type PublicReviewWithProfile } from '@/services/reviewService';
import { EventDetailsStep } from './ReviewFormSteps/EventDetailsStep';
import { RatingStep } from './ReviewFormSteps/RatingStep';
import { ReviewContentStep } from './ReviewFormSteps/ReviewContentStep';
import { PrivacySubmitStep } from './ReviewFormSteps/PrivacySubmitStep';
import { supabase } from '@/integrations/supabase/client';
import { ShowRanking, type ShowEntry } from './ShowRanking';

interface EventReviewFormProps {
  event: JamBaseEvent | PublicReviewWithProfile;
  userId: string;
  onSubmitted?: (review: UserReview) => void;
}

export function EventReviewForm({ event, userId, onSubmitted }: EventReviewFormProps) {
  const { toast } = useToast();
  const {
    formData,
    errors,
    isLoading,
    updateFormData,
    setLoading,
    resetForm,
    setFormData
  } = useReviewForm();

  const [existingReview, setExistingReview] = useState<UserReview | null>(null);
  const [shows, setShows] = useState<ShowEntry[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!event || !userId) return;
      try {
        const review = await ReviewService.getUserEventReview(userId, event.id);
        if (review) {
          setExistingReview(review);
          setFormData({
            selectedArtist: null,
            selectedVenue: null,
            eventDate: review.created_at.split('T')[0],
            artistRating: review.artist_rating || review.rating,
            venueRating: review.venue_rating || review.rating,
            rating: review.rating,
            reviewText: review.review_text || '',
            reactionEmoji: review.reaction_emoji || '',
            venueReviewText: '',
            artistReviewText: '',
            isPublic: review.is_public,
            reviewType: review.review_type || 'event',
          });
          try {
            // Pre-populate selected artist and venue for locked view-by-default editing
            const approxArtist = (event as any)?.artist_name || (event as any)?.artist?.name;
            const approxVenue = (event as any)?.venue_name || (event as any)?.venue?.name;
            const approxVenueId = review.venue_id;
            const selectedArtist = approxArtist
              ? ({ id: (event as any)?.artist?.id || `manual-${approxArtist}`, name: approxArtist, is_from_database: false } as any)
              : null;
            const selectedVenue = approxVenue
              ? ({ id: approxVenueId || (event as any)?.venue?.id || `manual-${approxVenue}`, name: approxVenue, is_from_database: !!approxVenueId } as any)
              : null;
            const updates: any = {};
            if (selectedArtist) updates.selectedArtist = selectedArtist;
            if (selectedVenue) updates.selectedVenue = selectedVenue;
            if (Object.keys(updates).length > 0) setFormData(updates);
          } catch {}
        } else {
          setExistingReview(null);
          resetForm();
          setFormData({ reviewType: 'event' });
        }
      } catch (e) {
        console.error('Error loading review for single page form', e);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, userId]);

  const handleSubmit = async () => {
    if (!userId) {
      toast({ title: 'Authentication Required', description: 'Please log in to submit a review.', variant: 'destructive' });
      return;
    }

    // Basic guard validation (unified overall rating)
    if (formData.reviewType === 'event') {
      if (!formData.selectedArtist || !formData.selectedVenue || formData.rating === 0) {
        toast({ title: 'Incomplete Review', description: 'Please select an artist, a venue, and provide an overall rating.', variant: 'destructive' });
        return;
      }
    } else if (formData.reviewType === 'venue') {
      if (!formData.selectedVenue || formData.rating === 0) {
        toast({ title: 'Incomplete Review', description: 'Please select a venue and provide an overall rating.', variant: 'destructive' });
        return;
      }
    } else if (formData.reviewType === 'artist') {
      if (!formData.selectedArtist || formData.rating === 0) {
        toast({ title: 'Incomplete Review', description: 'Please select an artist and provide an overall rating.', variant: 'destructive' });
        return;
      }
    }

    let eventId = event.id;
    // Resolve or cache artist in DB to obtain stable UUID for artist_profile
    let artistProfileId: string | undefined;
    try {
      const artistCandidate: any = (formData.selectedArtist || (event as any)?.artist) || null;
      const jambaseArtistId: string | undefined = artistCandidate?.id || (artistCandidate?.identifier?.split?.(':')?.[1]);
      if (jambaseArtistId) {
        // Try DB first
        const byId = await (supabase as any)
          .from('artist_profile')
          .select('id')
          .eq('jambase_artist_id', jambaseArtistId)
          .limit(1);
        if (Array.isArray(byId.data) && byId.data.length > 0) {
          artistProfileId = byId.data[0].id;
        } else {
          // Populate cache via search (this populates DB), then re-select
          try {
            const { UnifiedArtistSearchService } = await import('@/services/unifiedArtistSearchService');
            await UnifiedArtistSearchService.searchArtists(artistCandidate?.name || '');
            const reSel = await (supabase as any)
              .from('artist_profile')
              .select('id')
              .eq('jambase_artist_id', jambaseArtistId)
              .limit(1);
            if (Array.isArray(reSel.data) && reSel.data.length > 0) {
              artistProfileId = reSel.data[0].id;
            }
          } catch {}
        }
      }
    } catch {}
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId);
    if (!looksLikeUuid || event?.id?.startsWith('new-review')) {
      try {
        const eventDateTime = new Date(formData.eventDate + 'T20:00:00Z');
        // Attempt insert; if it fails due to schema, degrade to minimal payload
        let insertPayload: any = {
          title: `${formData.selectedArtist?.name || 'Concert'} at ${formData.selectedVenue?.name || 'Venue'}`,
          artist_name: formData.selectedArtist?.name || '',
          venue_name: formData.selectedVenue?.name || '',
          venue_id: formData.selectedVenue?.is_from_database ? formData.selectedVenue.id : null,
          venue_city: formData.selectedVenue?.address?.addressLocality || 'Unknown',
          venue_state: formData.selectedVenue?.address?.addressRegion || 'Unknown',
          event_date: eventDateTime.toISOString(),
          description: `Concert by ${formData.selectedArtist?.name || ''} at ${formData.selectedVenue?.name || ''}`
        };
        let ins = await (supabase as any)
          .from('jambase_events')
          .insert(insertPayload)
          .select()
          .single();
        if (ins.error) {
          insertPayload = {
            title: insertPayload.title,
            artist_name: insertPayload.artist_name,
            venue_name: insertPayload.venue_name,
            event_date: insertPayload.event_date,
          };
          ins = await (supabase as any)
            .from('jambase_events')
            .insert(insertPayload)
            .select()
            .single();
        }
        // If we resolved artist_profile, update event row with artist_id for future accuracy
        if (!ins.error && artistProfileId) {
          try {
            await (supabase as any)
              .from('jambase_events')
              .update({ artist_id: artistProfileId })
              .eq('id', ins.data.id);
          } catch {}
        }
        if (ins.error) throw ins.error;
        eventId = ins.data.id;
      } catch (e) {
        console.error('Error creating event:', e);
        toast({ title: 'Error', description: 'Failed to create event entry. Please try again.', variant: 'destructive' });
        return;
      }
    }

    setLoading(true);
    try {
      const combinedReviewText = [
        formData.reviewText.trim(),
        formData.artistReviewText.trim() ? `Artist: ${formData.artistReviewText.trim()}` : '',
        formData.venueReviewText.trim() ? `Venue: ${formData.venueReviewText.trim()}` : ''
      ].filter(Boolean).join('\n\n');

      const showsRankingBlock = shows.length
        ? `\n\nShow rankings:\n${shows
            .slice()
            .sort((a, b) => (b.rating - a.rating) || (a.order - b.order))
            .map((s, idx) => `${idx + 1}. ${s.show_name || 'Show'}${s.show_date ? ` (${s.show_date})` : ''}${s.venue_name ? ` @ ${s.venue_name}` : ''} — ${s.rating}/5${(shows.filter(x => x.rating === s.rating).length > 1) ? ` [tie #${s.order}]` : ''}`)
            .join('\n')}
        `
        : '';

      const reviewData: ReviewData = {
        review_type: 'event',
        // overall rating stored in half steps; convert to 1..5 scale for DB
        rating: Math.max(1, Math.min(5, Math.round((formData.rating / 2) * 10) / 10)) as any,
        review_text: (combinedReviewText + showsRankingBlock).trim() || undefined,
        reaction_emoji: formData.reactionEmoji || undefined,
        is_public: formData.isPublic,
        venue_tags: [],
        artist_tags: [],
      };

      // Ensure venue exists in DB to save venue_id if possible
      let venueId: string | undefined = formData.selectedVenue?.is_from_database ? formData.selectedVenue.id : undefined;
      if (!venueId && formData.selectedVenue) {
        try {
          const candidateIdentifier = formData.selectedVenue.identifier;
          const idLooksLikeUuid = typeof candidateIdentifier === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidateIdentifier);

          // Prefer UUID identifier lookup if value is a UUID; otherwise skip identifier equality to avoid 400s
          let foundId: string | undefined = undefined;
          if (idLooksLikeUuid) {
            const selByIdentifier = await (supabase as any)
              .from('venue_profile')
              .select('id')
              .eq('identifier', candidateIdentifier)
              .limit(1);
            foundId = Array.isArray(selByIdentifier.data) && selByIdentifier.data.length > 0 ? selByIdentifier.data[0].id : undefined;
          }
          if (foundId) {
            venueId = foundId;
          } else {
            // Fallback: try name search with wildcards
            const byName = await (supabase as any)
              .from('venue_profile')
              .select('id')
              .ilike('name', `%${formData.selectedVenue.name}%`)
              .limit(1);
            const nameId = Array.isArray(byName.data) && byName.data.length > 0 ? byName.data[0].id : undefined;
            if (nameId) {
              venueId = nameId;
            } else {
              // Insert minimal row; handle unique race by selecting on conflict
              const ins = await (supabase as any)
                .from('venue_profile')
                .insert({
                  name: formData.selectedVenue.name,
                  ...(idLooksLikeUuid ? { identifier: candidateIdentifier } : {}),
                  address: formData.selectedVenue.address || null,
                  geo: formData.selectedVenue.geo || null,
                  image_url: formData.selectedVenue.image_url || null,
                  last_synced_at: new Date().toISOString()
                });
              // After insert, always resolve id via safe lookup (identifier if UUID else name ilike)
              if (!ins.error) {
                if (idLooksLikeUuid) {
                  const reSelByIdentifier = await (supabase as any)
                    .from('venue_profile')
                    .select('id')
                    .eq('identifier', candidateIdentifier)
                    .limit(1);
                  if (Array.isArray(reSelByIdentifier.data) && reSelByIdentifier.data.length > 0) {
                    venueId = reSelByIdentifier.data[0].id;
                  }
                }
                if (!venueId) {
                  const reSelByName = await (supabase as any)
                    .from('venue_profile')
                    .select('id')
                    .ilike('name', `%${formData.selectedVenue.name}%`)
                    .limit(1);
                  if (Array.isArray(reSelByName.data) && reSelByName.data.length > 0) {
                    venueId = reSelByName.data[0].id;
                  }
                }
              }
            }
          }
        } catch {}
      }

      const review = await ReviewService.setEventReview(userId, eventId, reviewData, venueId);
      toast({ title: existingReview ? 'Review Updated' : 'Review Submitted! 🎉', description: existingReview ? 'Your review has been updated.' : 'Thanks for sharing your concert experience!' });
      if (onSubmitted) onSubmitted(review);
      resetForm();
    } catch (e) {
      console.error('Error submitting review:', e);
      toast({ title: 'Error', description: 'Failed to submit review. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-gray-200">
      <CardContent className="p-0">
        <div className="px-6 py-6 space-y-8">
          <EventDetailsStep formData={formData} errors={errors} onUpdateFormData={updateFormData} />
          <RatingStep formData={formData} errors={errors} onUpdateFormData={updateFormData} />
          <ReviewContentStep formData={formData} errors={errors} onUpdateFormData={updateFormData} />

          {/* Submit inline */}
          <div className="pt-3">
            <div className="flex justify-end">
              <Button onClick={handleSubmit} disabled={isLoading} className="bg-pink-500 hover:bg-pink-600">
                {isLoading ? 'Submitting...' : 'Submit Review'}
              </Button>
            </div>
          </div>

          {existingReview && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await ReviewService.deleteEventReview(userId, event.id);
                    toast({ title: 'Review Deleted', description: 'Your review has been deleted.' });
                    setExistingReview(null);
                    resetForm();
                  } catch (e) {
                    toast({ title: 'Error', description: 'Failed to delete review. Please try again.', variant: 'destructive' });
                  }
                }}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Delete Review
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


