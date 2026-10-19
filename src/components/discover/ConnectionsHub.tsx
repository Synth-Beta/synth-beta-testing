import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PickFiveConnection } from '@/components/partners/PickFiveConnection';
import { PICK5_LOGO_SRC } from '@/components/home/thread/pick5';
import '@/components/home/thread/thread.css';

interface CommunityReview {
  id: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  rating: number | null;
  text: string;
  subject: string;
  createdAt: string;
}

export const ConnectionsHub: React.FC<{
  currentUserId: string;
  onNavigateToProfile?: (userId: string) => void;
  onOpenMessages?: () => void;
}> = ({ onNavigateToProfile, onOpenMessages }) => {
  const [reviews, setReviews] = useState<CommunityReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  const loadReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, user_id, rating, review_text, created_at, artist_id, venue_id')
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
    const rows = data ?? [];
    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
    const artistIds = [...new Set(rows.map((r) => r.artist_id).filter(Boolean))] as string[];
    const venueIds = [...new Set(rows.map((r) => r.venue_id).filter(Boolean))] as string[];

    const [users, artists, venues] = await Promise.all([
      userIds.length
        ? supabase.from('users').select('user_id, name, avatar_url').in('user_id', userIds)
        : Promise.resolve({ data: [] as { user_id: string; name: string; avatar_url: string | null }[] }),
      artistIds.length
        ? supabase.from('artists').select('id, name').in('id', artistIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      venueIds.length
        ? supabase.from('venues').select('id, name').in('id', venueIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const userById = new Map((users.data ?? []).map((u) => [u.user_id, u]));
    const artistById = new Map((artists.data ?? []).map((a) => [a.id, a.name]));
    const venueById = new Map((venues.data ?? []).map((v) => [v.id, v.name]));

    setReviews(
      rows
        .filter((r) => {
          const text = String(r.review_text ?? '').trim();
          if (text === 'ATTENDANCE_ONLY') return false;
          return text.length > 0 || r.rating != null;
        })
        .map((r) => {
          const user = userById.get(r.user_id);
          const subject =
            (r.artist_id && artistById.get(r.artist_id)) ||
            (r.venue_id && venueById.get(r.venue_id)) ||
            'a show';
          const text = String(r.review_text ?? '').trim();
          return {
            id: r.id,
            userId: r.user_id,
            userName: user?.name || 'Synth member',
            avatarUrl: user?.avatar_url ?? null,
            rating: r.rating != null ? Number(r.rating) : null,
            text: text || `Rated ${subject}`,
            subject,
            createdAt: r.created_at,
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
      <section className="community-tile" aria-label="Pick5">
        <div style={{ padding: '14px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <img src={PICK5_LOGO_SRC} alt="" width={28} height={28} style={{ borderRadius: 7 }} />
            <div className="connection-card__name">Pick5</div>
          </div>
          <PickFiveConnection />
        </div>
      </section>

      <section className="community-tile" aria-label="Messages">
        <article className="connection-card">
          <div>
            <div className="connection-card__name">Messages</div>
            <p className="connection-card__artists" style={{ marginTop: 8, lineHeight: 1.45 }}>
              Genre communities and your chats are in Messages. Join a fan chat, then talk with the people you meet.
            </p>
          </div>
          <div>
            <button type="button" className="thread-btn thread-btn--interest" onClick={onOpenMessages}>
              <MessageCircle size={15} aria-hidden="true" />
              Open Messages
            </button>
          </div>
        </article>
      </section>

      <section className="community-tile community-tile--feed" aria-label="The community">
        <div className="feed-banner">
          <h2>The community</h2>
          <p>Recent reviews from everyone on Synth.</p>
        </div>
        {loadingReviews ? (
          <div className="community-board__empty connection-card__status connection-card__status--muted">Loading reviews…</div>
        ) : reviews.length === 0 ? (
          <div className="community-board__empty connection-card__status connection-card__status--muted">No public reviews yet.</div>
        ) : (
          <div className="community-board__reviews">
            {reviews.map((review) => (
              <button
                key={review.id}
                type="button"
                className="community-review"
                onClick={() => onNavigateToProfile?.(review.userId)}
              >
                <div className="community-review__who">
                  <span className="community-review__avatar" aria-hidden="true">
                    {review.avatarUrl ? <img src={review.avatarUrl} alt="" /> : review.userName.slice(0, 1)}
                  </span>
                  <span className="community-review__name">{review.userName}</span>
                  <span className="community-review__on">on {review.subject}</span>
                  {review.rating != null && (
                    <span className="community-review__rating">
                      <Star size={12} fill="currentColor" aria-hidden="true" />
                      {review.rating.toFixed(1)}
                    </span>
                  )}
                </div>
                <p>{review.text.length > 180 ? `${review.text.slice(0, 180).replace(/\s+\S*$/, '')}…` : review.text}</p>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
