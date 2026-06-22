import React, { useState, useEffect } from 'react';
import { Star, Calendar, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import type { ReviewWithEngagement } from '@/services/reviewService';

interface ReviewMessageCardProps {
  reviewId: string;
  customMessage?: string;
  onReviewClick?: (review: ReviewWithEngagement) => void;
  currentUserId?: string;
  className?: string;
  metadata?: { review_text?: string; rating?: number; artist_name?: string; venue_name?: string; };
}

interface ReviewData {
  id: string;
  user_id: string;
  event_id: string;
  rating: number;
  review_text: string;
  created_at: string;
  likes_count: number;
  comments_count: number;
  artist_name?: string;
  venue_name?: string;
  event_title?: string;
  event_date?: string;
  venue_city?: string;
  venue_state?: string;
}

export function ReviewMessageCard({
  reviewId,
  customMessage,
  onReviewClick,
  currentUserId,
  className = '',
  metadata,
}: ReviewMessageCardProps) {
  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const metaArtist = metadata?.artist_name;
  const metaVenue = metadata?.venue_name;

  useEffect(() => { loadReview(); }, [reviewId, metaArtist, metaVenue]);

  const loadReview = async () => {
    try {
      setLoading(true);
      const { data: reviewData, error: reviewError } = await supabase
        .from('reviews')
        .select('id, user_id, event_id, rating, review_text, created_at, likes_count, comments_count')
        .eq('id', reviewId)
        .maybeSingle();

      if (reviewError || !reviewData) return;

      let eventData: any = {};
      if (reviewData.event_id) {
        // Use same join pattern as EventMessageCard so artist/venue names resolve correctly
        const { data: event } = await supabase
          .from('events')
          .select('title, event_date, venue_city, venue_state, artists(name), venues(name)')
          .eq('id', reviewData.event_id)
          .maybeSingle();
        if (event) {
          eventData = {
            ...event,
            artist_name: (event.artists as any)?.name ?? null,
            venue_name: (event.venues as any)?.name ?? null,
          };
        }
      }

      setReview({
        id: reviewData.id,
        user_id: reviewData.user_id,
        event_id: reviewData.event_id || '',
        rating: reviewData.rating,
        review_text: reviewData.review_text || '',
        created_at: reviewData.created_at,
        likes_count: reviewData.likes_count || 0,
        comments_count: reviewData.comments_count || 0,
        artist_name: eventData.artist_name || metadata?.artist_name,
        venue_name: eventData.venue_name || metadata?.venue_name,
        event_title: eventData.title,
        event_date: eventData.event_date,
        venue_city: eventData.venue_city,
        venue_state: eventData.venue_state,
      });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try { return format(parseISO(dateString), 'EEE, MMM d, yyyy'); }
    catch { return dateString; }
  };

  const handleClick = () => {
    if (!review) return;
    onReviewClick?.({
      id: review.id,
      user_id: review.user_id,
      event_id: review.event_id,
      rating: review.rating,
      review_text: review.review_text,
      is_public: true,
      created_at: review.created_at,
      updated_at: review.created_at,
      likes_count: review.likes_count,
      comments_count: review.comments_count,
      shares_count: 0,
      is_liked_by_user: false,
      reaction_emoji: '',
      photos: [],
      videos: [],
      mood_tags: [],
      genre_tags: [],
      context_tags: [],
      artist_name: review.artist_name,
      venue_name: review.venue_name,
    });
  };

  if (loading) {
    return (
      <div
        className={`w-full rounded-2xl overflow-hidden animate-pulse ${className}`}
        style={{ height: 160, background: 'var(--neutral-100)' }}
      />
    );
  }

  if (!review) {
    return (
      <div className={`w-full rounded-2xl p-4 text-sm ${className}`} style={{ background: 'var(--neutral-100)', color: 'var(--neutral-500)' }}>
        Review not found
      </div>
    );
  }

  const filledStars = Math.round(review.rating);
  const snippet = review.review_text.length > 110
    ? review.review_text.slice(0, 110) + '…'
    : review.review_text;

  return (
    <div
      className={`w-full rounded-2xl overflow-hidden cursor-pointer ${className}`}
      style={{ background: 'var(--neutral-900)', boxShadow: '0 2px 16px rgba(0,0,0,0.18)' }}
      onClick={handleClick}
    >
      {/* Gradient header band with star rating */}
      <div style={{
        background: 'linear-gradient(135deg, #EC4899 0%, #9333EA 100%)',
        padding: '12px 14px 10px',
        position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 10, right: 10 }}>
          <span style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            background: 'rgba(255,255,255,0.2)',
            color: '#fff',
            backdropFilter: 'blur(4px)',
          }}>
            Concert Review
          </span>
        </div>
        <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <Star
              key={i}
              size={15}
              fill={i < filledStars ? '#fff' : 'none'}
              stroke="#fff"
              strokeWidth={1.5}
              style={{ opacity: i < filledStars ? 1 : 0.4 }}
            />
          ))}
        </div>
        <p style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1 }}>
          {review.rating.toFixed(1)}
          <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.7, marginLeft: 4 }}>/&nbsp;5</span>
        </p>
      </div>

      {/* Card body — matches EventMessageCard info section */}
      <div style={{ padding: '12px 14px 12px' }}>
        {customMessage && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6, fontStyle: 'italic' }}>
            "{customMessage}"
          </p>
        )}
        <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.2, marginBottom: 2 }}>
          {review.artist_name || review.event_title || 'Concert Review'}
        </p>
        {review.artist_name && review.event_title && review.event_title !== review.artist_name && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>{review.event_title}</p>
        )}
        {snippet && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', fontStyle: 'italic', marginBottom: 8, lineHeight: 1.4 }}>
            "{snippet}"
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {review.event_date && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
              <Calendar size={11} />
              {formatDate(review.event_date)}
            </span>
          )}
          {(review.venue_name || review.venue_city) && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
              <MapPin size={11} />
              {review.venue_name || review.venue_city}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
