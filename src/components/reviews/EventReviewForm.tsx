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
import { trackInteraction } from '@/services/interactionTrackingService';

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
        // First check if we have an existing review ID (edit mode)
        const existingReviewId = (event as any)?.existing_review_id;
        let review = null;
        
        if (existingReviewId) {
          // Edit mode: fetch review by ID
          const { data, error } = await (supabase as any)
            .from('user_reviews')
            .select('*')
            .eq('id', existingReviewId)
            .maybeSingle();
          if (data && !error) {
            review = data;
          }
        } else {
          // Create mode: try to fetch by event ID
          review = await ReviewService.getUserEventReview(userId, event.id);
        }

        if (review) {
          setExistingReview(review);
          // Prefill form data from existing review
          setFormData({
            selectedArtist: null,
            selectedVenue: null,
            eventDate: (review.event_date || review.created_at || '').split('T')[0],
            performanceRating: review.performance_rating || review.rating,
            venueRating: review.venue_rating || review.venue_rating_new || review.rating,
            overallExperienceRating: review.overall_experience_rating || review.rating,
            rating: review.rating,
            reviewText: review.review_text || '',
            reactionEmoji: review.reaction_emoji || '',
            performanceReviewText: review.performance_review_text || '',
            venueReviewText: review.venue_review_text || '',
            overallExperienceReviewText: review.overall_experience_review_text || '',
            artistReviewText: '',
            isPublic: review.is_public,
            reviewType: review.review_type || 'event',
          });
          
          // Pre-populate selected artist and venue
          try {
            const approxArtist = (event as any)?.artist_name || (event as any)?.artist?.name || review.artist_name;
            const approxVenue = (event as any)?.venue_name || (event as any)?.venue?.name || review.venue_name;
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
          // No existing review - create new one
          setExistingReview(null);
          resetForm();
          
          // Prefill from the provided event context (artist, venue, date)
          try {
            const approxArtist = (event as any)?.artist_name || (event as any)?.artist?.name;
            const approxArtistId = (event as any)?.artist_id || (event as any)?.artist?.id || undefined;
            const approxVenue = (event as any)?.venue_name || (event as any)?.venue?.name;
            const approxVenueId = (event as any)?.venue_id || (event as any)?.venue?.id || undefined;
            const approxDate = (event as any)?.event_date || (event as any)?.date || undefined;

            const selectedArtist = approxArtist
              ? ({ id: approxArtistId || `manual-${approxArtist}`, name: approxArtist, is_from_database: !!approxArtistId } as any)
              : null;
            const selectedVenue = approxVenue
              ? ({ id: approxVenueId || `manual-${approxVenue}`, name: approxVenue, is_from_database: !!approxVenueId } as any)
              : null;
            const eventDate = approxDate ? String(approxDate).split('T')[0] : '';

            setFormData({
              reviewType: 'event',
              ...(selectedArtist ? { selectedArtist } : {}),
              ...(selectedVenue ? { selectedVenue } : {}),
              ...(eventDate ? { eventDate } : {}),
            });
          } catch {
            setFormData({ reviewType: 'event' });
          }
        }
      } catch (e) {
        console.error('Error loading review for single page form', e);
      }
    };
    load();
    // run strictly on event.id change
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
        formData.artistReviewText.trim() ? `Artist: ${formData.artistReviewText.trim()}` : ''
      ].filter(Boolean).join('\n\n');

      const showsRankingBlock = shows.length
        ? `\n\nShow rankings:\n${shows
            .slice()
            .sort((a, b) => (b.rating - a.rating) || (a.order - b.order))
            .map((s, idx) => `${idx + 1}. ${s.show_name || 'Show'}${s.show_date ? ` (${s.show_date})` : ''}${s.venue_name ? ` @ ${s.venue_name}` : ''} — ${s.rating}/5${(shows.filter(x => x.rating === s.rating).length > 1) ? ` [tie #${s.order}]` : ''}`)
            .join('\n')}
        `
        : '';

      // Ensure overall rating is saved on a 1..5 integer scale without halving
      const integerOverall = Math.max(1, Math.min(5, Math.round(formData.rating))) as any;
      const reviewData: ReviewData = {
        review_type: 'event',
        // Send integer overall rating to satisfy NOT NULL integer column; decimals go to category columns
        rating: integerOverall,
        performance_rating: formData.performanceRating || undefined,
        venue_rating: formData.venueRating || undefined,
        overall_experience_rating: formData.overallExperienceRating || undefined,
        performance_review_text: formData.performanceReviewText || undefined,
        venue_review_text: formData.venueReviewText || undefined,
        overall_experience_review_text: formData.overallExperienceReviewText || undefined,
        review_text: (combinedReviewText + showsRankingBlock).trim() || undefined,
        reaction_emoji: formData.reactionEmoji || undefined,
        is_public: formData.isPublic,
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
      try {
        const entityType = formData.reviewType === 'artist' ? 'artist' : (formData.reviewType === 'venue' ? 'venue' : 'event');
        const entityId = entityType === 'artist' ? (formData.selectedArtist?.id || eventId) : (entityType === 'venue' ? (venueId || formData.selectedVenue?.id || eventId) : eventId);
        trackInteraction.review(entityType, entityId, reviewData.rating as number, {
          performance_rating: reviewData.performance_rating,
          venue_rating: reviewData.venue_rating,
          overall_experience_rating: reviewData.overall_experience_rating,
          is_public: reviewData.is_public,
          has_text: !!reviewData.review_text,
          text_length: reviewData.review_text?.length || 0,
          reviewType: formData.reviewType
        });
        trackInteraction.formSubmit('event_review', entityId, true, { reviewType: formData.reviewType });
      } catch {}
      toast({ title: existingReview ? 'Review Updated' : 'Review Submitted! 🎉', description: existingReview ? 'Your review has been updated.' : 'Thanks for sharing your concert experience!' });
      if (onSubmitted) onSubmitted(review);
      // Do not reset on edit; keep state if the user reopens
      if (!existingReview) {
        resetForm();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Error submitting review:', e);
      toast({ title: 'Error', description: `Failed to submit review: ${msg}`, variant: 'destructive' });
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
                      try { trackInteraction.click('review', event.id, { action: 'delete', source: 'event_review_form' }); } catch {}
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


