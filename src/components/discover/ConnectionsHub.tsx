import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { PickFiveConnection } from '@/components/partners/PickFiveConnection';
import { PICK5_LOGO_SRC } from '@/components/home/thread/pick5';
import { ThreadReviewCard } from '@/components/home/thread/ThreadReviewCard';
import { ReviewDetailView } from '@/components/reviews/ReviewDetailView';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { ReviewWithEngagement } from '@/services/reviewService';
import '@/components/home/thread/thread.css';

interface CommunityReview {
  review: ReviewWithEngagement;
  author: { name: string; avatar_url?: string };
  artistImageUrl?: string;
}

/** Community: Pick5 linking + recent public reviews from everyone on Synth. */
export const ConnectionsHub: React.FC<{
  currentUserId: string;
  onNavigateToProfile?: (userId: string) => void;
}> = ({ currentUserId, onNavigateToProfile }) => {
  const [reviews, setReviews] = useState<CommunityReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, user_id, event_id, rating, review_text, photos, created_at, artist_id, venue_id, likes_count, comments_count, "Event_date"')
      .or('is_public.eq.true,is_public.is.null')
      .or('is_draft.eq.false,is_draft.is.null')
      .or('review_text.is.null,review_text.neq.ATTENDANCE_ONLY')
      .order('created_at', { ascending: false })
      .limit(24);
    if (error) {
      console.warn('[ConnectionsHub] reviews:', error.message);
      setLoadingReviews(false);
      return;
    }
    const rows = (data ?? []) as any[];
    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
    const artistIds = [...new Set(rows.map((r) => r.artist_id).filter(Boolean))] as string[];
    const venueIds = [...new Set(rows.map((r) => r.venue_id).filter(Boolean))] as string[];

    const [users, artists, venues] = await Promise.all([
      userIds.length
        ? supabase.from('users').select('user_id, name, avatar_url').in('user_id', userIds)
        : Promise.resolve({ data: [] as { user_id: string; name: string; avatar_url: string | null }[] }),
      artistIds.length
        ? supabase.from('artists').select('id, name, image_url').in('id', artistIds)
        : Promise.resolve({ data: [] as { id: string; name: string; image_url: string | null }[] }),
      venueIds.length
        ? supabase.from('venues').select('id, name').in('id', venueIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const userById = new Map((users.data ?? []).map((u: any) => [u.user_id, u]));
    const artistById = new Map((artists.data ?? []).map((a: any) => [a.id, a]));
    const venueById = new Map((venues.data ?? []).map((v: any) => [v.id, v.name as string]));

    setReviews(
      rows
        .filter((r) => {
          const text = String(r.review_text ?? '').trim();
          if (text === 'ATTENDANCE_ONLY') return false;
          return text.length > 0 || r.rating != null;
        })
        .map((r) => {
          const user = userById.get(r.user_id);
          const artist = r.artist_id ? artistById.get(r.artist_id) : undefined;
          return {
            review: {
              id: r.id,
              user_id: r.user_id,
              event_id: r.event_id || '',
              artist_id: r.artist_id,
              rating: r.rating != null ? Number(r.rating) : undefined,
              review_text: String(r.review_text ?? '').trim(),
              is_public: true,
              created_at: r.created_at,
              updated_at: r.created_at,
              likes_count: r.likes_count ?? 0,
              comments_count: r.comments_count ?? 0,
              shares_count: 0,
              is_liked_by_user: false,
              reaction_emoji: '',
              photos: r.photos || [],
              videos: [],
              mood_tags: [],
              genre_tags: [],
              context_tags: [],
              artist_name: artist?.name,
              venue_name: r.venue_id ? venueById.get(r.venue_id) : undefined,
              Event_date: r.Event_date,
            } as ReviewWithEngagement,
            author: { name: user?.name || 'Synth member', avatar_url: user?.avatar_url || undefined },
            artistImageUrl: artist?.image_url || undefined,
          };
        })
    );
    setLoadingReviews(false);
  }, []);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  return (
    <div className="community-board" data-tour="discover-vibes">
      <section className="community-tile community-tile--wide" aria-label="Pick5">
        <div style={{ padding: '14px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <img src={PICK5_LOGO_SRC} alt="" width={28} height={28} style={{ borderRadius: 7 }} />
            <div className="connection-card__name">Pick5</div>
          </div>
          <PickFiveConnection />
        </div>
      </section>

      <section className="community-tile community-tile--feed" aria-label="The community">
        <div className="feed-banner">
          <h2>The community</h2>
          <p>What people on Synth are saying about the shows they went to. Tap one to read it and join in.</p>
        </div>
        {loadingReviews ? (
          <div className="community-board__empty connection-card__status connection-card__status--muted">Loading reviews…</div>
        ) : reviews.length === 0 ? (
          <div className="community-board__empty connection-card__status connection-card__status--muted">No public reviews yet.</div>
        ) : (
          <div className="community-board__reviews community-board__reviews--cards">
            {reviews.map(({ review, author, artistImageUrl }) => (
              <ThreadReviewCard
                key={review.id}
                review={review}
                author={author}
                artistImageUrl={artistImageUrl}
                currentUserId={currentUserId}
                chipLabel="Review"
                onOpen={() => setOpenReviewId(review.id)}
              />
            ))}
          </div>
        )}
      </section>

      {openReviewId &&
        createPortal(
          <Dialog open onOpenChange={(open) => !open && setOpenReviewId(null)}>
            <DialogContent
              className="fixed inset-0 z-[100] max-w-none w-full h-full m-0 p-0 overflow-hidden rounded-none"
              style={{
                left: 0,
                top: 0,
                transform: 'none',
                width: '100vw',
                height: '100vh',
                maxWidth: '100vw',
                maxHeight: '100vh',
                borderRadius: 0,
                border: 'none',
                boxShadow: 'none',
                backgroundColor: 'var(--neutral-50)',
              }}
            >
              <DialogTitle className="sr-only">Review Details</DialogTitle>
              <DialogDescription className="sr-only">Full review with comments and likes</DialogDescription>
              <ReviewDetailView
                reviewId={openReviewId}
                currentUserId={currentUserId}
                onBack={() => setOpenReviewId(null)}
                onEdit={() => {
                  const id = openReviewId;
                  setOpenReviewId(null);
                  window.dispatchEvent(new CustomEvent('synth-open-review-edit', { detail: { reviewId: id } }));
                }}
                onDelete={async () => {
                  setOpenReviewId(null);
                  await loadReviews();
                }}
                onOpenProfile={(userId) => {
                  setOpenReviewId(null);
                  onNavigateToProfile?.(userId);
                }}
              />
            </DialogContent>
          </Dialog>,
          document.body
        )}
    </div>
  );
};
