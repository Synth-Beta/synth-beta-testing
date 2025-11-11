import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, Share2, MoreHorizontal, Star, Edit, Trash2, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewWithEngagement, ReviewService, CommentWithUser } from '@/services/reviewService';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send } from 'lucide-react';
import { ShareService } from '@/services/shareService';
import { formatDistanceToNow } from 'date-fns';
import { SetlistDisplay } from './SetlistDisplay';
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';
import { VenueFollowButton } from '@/components/venues/VenueFollowButton';
import { ReportContentModal } from '@/components/moderation/ReportContentModal';
import { Phone } from 'lucide-react';
import type { Attendee } from '@/components/reviews/AttendeeSelector';

interface ReviewCardProps {
  review: ReviewWithEngagement;
  currentUserId?: string;
  onLike?: (reviewId: string, isLiked: boolean) => void;
  onComment?: (reviewId: string) => void;
  onShare?: (reviewId: string) => void;
  onEdit?: (review: ReviewWithEngagement) => void;
  onDelete?: (reviewId: string) => void;
  showEventInfo?: boolean;
  onReport?: (reviewId: string) => void;
}

export function ReviewCard({
  review,
  currentUserId,
  onLike,
  onComment,
  onShare,
  onEdit,
  onDelete,
  showEventInfo = false,
  onReport
}: ReviewCardProps) {
  const [isLiked, setIsLiked] = useState(review.is_liked_by_user || false);
  const [likesCount, setLikesCount] = useState(review.likes_count);
  const [isLiking, setIsLiking] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentWithUser[]>([]);
  const [commentsCount, setCommentsCount] = useState<number>(review.comments_count || 0);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const photos: string[] = Array.isArray((review as any)?.photos) ? (review as any).photos : [];
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const categoryMetrics = [
    {
      key: 'artist_performance_rating',
      label: 'Artist performance',
      rating: (review as any).artist_performance_rating,
      feedback: (review as any).artist_performance_feedback,
      recommendation: (review as any).artist_performance_recommendation,
      color: 'border-pink-400 bg-pink-50/70 text-pink-900'
    },
    {
      key: 'production_rating',
      label: 'Production',
      rating: (review as any).production_rating,
      feedback: (review as any).production_feedback,
      recommendation: (review as any).production_recommendation,
      color: 'border-purple-400 bg-purple-50/70 text-purple-900'
    },
    {
      key: 'venue_rating',
      label: 'Venue',
      rating: (review as any).venue_rating,
      feedback: (review as any).venue_feedback,
      recommendation: (review as any).venue_recommendation,
      color: 'border-blue-400 bg-blue-50/70 text-blue-900'
    },
    {
      key: 'location_rating',
      label: 'Location',
      rating: (review as any).location_rating,
      feedback: (review as any).location_feedback,
      recommendation: (review as any).location_recommendation,
      color: 'border-emerald-400 bg-emerald-50/70 text-emerald-900'
    },
    {
      key: 'value_rating',
      label: 'Value',
      rating: (review as any).value_rating,
      feedback: (review as any).value_feedback,
      recommendation: (review as any).value_recommendation,
      color: 'border-amber-400 bg-amber-50/70 text-amber-900'
    }
  ];

  const categoryRatings = categoryMetrics
    .map(metric => (typeof metric.rating === 'number' && metric.rating > 0 ? metric.rating : undefined))
    .filter((rating): rating is number => typeof rating === 'number');

  const calculatedAverage =
    categoryRatings.length > 0
      ? categoryRatings.reduce((total, rating) => total + rating, 0) / categoryRatings.length
      : 0;

  const averageRating =
    typeof review.rating === 'number' && !Number.isNaN(review.rating)
      ? review.rating
      : calculatedAverage;

  const handleLike = async () => {
    console.log('🔍 ReviewCard: handleLike called', {
      currentUserId,
      reviewId: review.id,
      isLiked,
      isLiking,
      likesCount
    });
    
    if (!currentUserId || isLiking) {
      console.log('❌ ReviewCard: Early return - no userId or already liking', { currentUserId, isLiking });
      return;
    }
    
    setIsLiking(true);
    try {
      if (isLiked) {
        console.log('🔍 ReviewCard: Unliking review...');
        await ReviewService.unlikeReview(currentUserId, review.id);
        setLikesCount(prev => Math.max(0, prev - 1));
        setIsLiked(false);
        console.log('✅ ReviewCard: Review unliked successfully');
      } else {
        console.log('🔍 ReviewCard: Liking review...');
        const result = await ReviewService.likeReview(currentUserId, review.id);
        console.log('🔍 ReviewCard: Like result:', result);
        setLikesCount(prev => prev + 1);
        setIsLiked(true);
        console.log('✅ ReviewCard: Review liked successfully');
      }
      
      if (onLike) {
        console.log('🔍 ReviewCard: Calling onLike callback');
        onLike(review.id, !isLiked);
      }
    } catch (error) {
      console.error('❌ ReviewCard: Error toggling like:', error);
      // Revert optimistic update on error
      if (isLiked) {
        setLikesCount(prev => prev + 1);
        setIsLiked(true);
      } else {
        setLikesCount(prev => Math.max(0, prev - 1));
        setIsLiked(false);
      }
    } finally {
      setIsLiking(false);
    }
  };

  const handleComment = async () => {
    // Toggle open; when opening, load comments
    const next = !showComments;
    setShowComments(next);
    if (next && comments.length === 0) {
      try {
        setLoadingComments(true);
        const result = await ReviewService.getReviewComments(review.id);
        setComments(result);
        // Update comment count to match actual comments
        setCommentsCount(result.length);
      } catch (error) {
        console.error('Error loading comments:', error);
      } finally {
        setLoadingComments(false);
      }
    }
    // Intentionally do not notify parents; keep comment flow self-contained
  };

  const handleAddComment = async () => {
    if (!currentUserId || !newComment.trim() || submitting) return;
    try {
      setSubmitting(true);
      const created = await ReviewService.addComment(currentUserId, review.id, newComment.trim());
      setComments(prev => [
        ...prev,
        {
          ...created,
          user: {
            id: created.user_id,
            name: 'You',
            avatar_url: undefined
          }
        } as CommentWithUser
      ]);
      setNewComment('');
      setCommentsCount(prev => prev + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    await ShareService.shareReview(review.id, 'PlusOne Review', review.review_text || undefined);
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(review);
    }
  };

  const handleDelete = async () => {
    if (onDelete && window.confirm('Are you sure you want to delete this review?')) {
      onDelete(review.id);
    }
  };

  const isOwner = currentUserId && review.user_id === currentUserId;

  const renderStars = (rating: number) => {
    const safeRating = Number.isFinite(rating) ? rating : 0;
    return Array.from({ length: 5 }, (_, i) => {
      const starIndex = i + 1;
      const isFull = safeRating >= starIndex;
      const isHalf = !isFull && safeRating >= starIndex - 0.5;
      
      return (
        <div key={i} className="relative w-4 h-4">
          <Star className="w-4 h-4 text-gray-300" />
          {(isHalf || isFull) && (
            <div className={cn('absolute left-0 top-0 h-full overflow-hidden pointer-events-none', isFull ? 'w-full' : 'w-1/2')}>
              <Star className="w-4 h-4 text-yellow-400 fill-current" />
            </div>
          )}
        </div>
      );
    });
  };


  useEffect(() => {
    const listener = (e: Event) => {
      e.stopPropagation();
      handleComment();
    };
    const el = document.getElementById(`review-card-${review.id}`);
    el?.addEventListener('toggle-review-comments', listener as EventListener);
    return () => el?.removeEventListener('toggle-review-comments', listener as EventListener);
  }, [review.id, showComments, comments.length]);

  // Refresh engagement data when component mounts
  useEffect(() => {
    const refreshEngagement = async () => {
      console.log('🔍 ReviewCard: Refreshing engagement data', { reviewId: review.id, currentUserId });
      
      if (currentUserId) {
        try {
          const engagement = await ReviewService.getReviewEngagement(review.id, currentUserId);
          console.log('🔍 ReviewCard: Engagement data received:', engagement);
          
          if (engagement) {
            setLikesCount(engagement.likes_count);
            setCommentsCount(engagement.comments_count);
            setIsLiked(engagement.is_liked_by_user);
            console.log('✅ ReviewCard: Engagement state updated', {
              likesCount: engagement.likes_count,
              commentsCount: engagement.comments_count,
              isLiked: engagement.is_liked_by_user
            });
          } else {
            console.log('⚠️ ReviewCard: No engagement data received');
          }
        } catch (error) {
          console.error('❌ ReviewCard: Error refreshing engagement data:', error);
        }
      } else {
        console.log('⚠️ ReviewCard: No currentUserId, skipping engagement refresh');
      }
    };

    refreshEngagement();
  }, [review.id, currentUserId]);

  const openImageViewer = (index: number) => {
    setImageIndex(index);
    setImageViewerOpen(true);
  };

  const closeImageViewer = () => setImageViewerOpen(false);
  const prevImage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!photos.length) return;
    setImageIndex((idx) => (idx - 1 + photos.length) % photos.length);
  };
  const nextImage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!photos.length) return;
    setImageIndex((idx) => (idx + 1) % photos.length);
  };

  return (
    <Card className="w-full border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 bg-white" id={`review-card-${review.id}`}>
      <CardHeader className="pb-3 bg-gradient-to-r from-gray-50 to-white border-b">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10 ring-2 ring-pink-100">
              <AvatarImage src={undefined} />
              <AvatarFallback>
                {review.user_id?.slice(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                You
              </p>
              <p className="text-xs text-gray-500">
                Review
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            {isOwner && (
              <>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleEdit}
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleDelete}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {/* Prominent Star Rating Display */}
        <div className="mb-4 p-4 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-lg border-2 border-yellow-300 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {renderStars(averageRating)}
          </div>
          <span className="text-3xl font-bold text-gray-900">{averageRating.toFixed(1)}</span>
              <span className="text-sm text-gray-600 font-medium">stars</span>
            </div>
            <div className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
            </div>
          </div>
        </div>

        {/* Hero image showcasing user's experience */}
        {photos.length > 0 && (
          <div className="mb-3 overflow-hidden rounded-lg border bg-gray-50">
            <img
              src={photos[0]}
              alt={`${(review as any).event_name || 'Event'} photo 1`}
              className="w-full h-64 object-cover cursor-zoom-in"
              loading="lazy"
              onClick={(e) => { e.stopPropagation(); openImageViewer(0); }}
            />
          </div>
        )}

        {/* Secondary media grid */}
        {photos.length > 1 && (
          <div className="mb-4">
            <div className="grid grid-cols-3 gap-2">
              {photos.slice(1, 7).map((src: string, idx: number) => (
                <div key={`pf-${idx}`} className="aspect-square rounded overflow-hidden bg-gray-100 border">
                  <img 
                    src={src} 
                    alt={`${(review as any).event_name || 'Event'} photo ${idx + 2}`} 
                    className="h-full w-full object-cover cursor-zoom-in" 
                    loading="lazy"
                    onClick={(e) => { e.stopPropagation(); openImageViewer(idx + 1); }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Ticket Price */}
        {typeof (review as any).ticket_price_paid === 'number' && (review as any).ticket_price_paid > 0 && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700">
            Ticket price (private): ${(review as any).ticket_price_paid.toFixed(2)}
          </div>
        )}

        {/* Review Text */}
        {review.review_text && (
          <p className="text-[15px] leading-6 text-gray-800 mb-3">
            {review.review_text}
          </p>
        )}

        {/* Tagged Attendees */}
        {(review as any).attendees && Array.isArray((review as any).attendees) && (review as any).attendees.length > 0 && (
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600">Went with:</span>
            {(review as any).attendees.map((attendee: any, index: number) => (
              <div
                key={index}
                className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-full border border-gray-200"
              >
                {attendee.type === 'user' ? (
                  <>
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={attendee.avatar_url} alt={attendee.name} />
                      <AvatarFallback className="text-xs">{attendee.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-gray-700">{attendee.name}</span>
                  </>
                ) : (
                  <>
                    <Phone className="h-3 w-3 text-gray-400" />
                    <span className="text-xs text-gray-700">{attendee.name || 'Friend'}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Setlist Display - API Verified */}
        {(() => {
          console.log('🎵 ReviewCard: Full review object:', review);
          console.log('🎵 ReviewCard: Checking setlist for review:', review.id, 'setlist:', (review as any).setlist);
          console.log('🎵 ReviewCard: Setlist exists?', !!(review as any).setlist);
          console.log('🎵 ReviewCard: Custom setlist exists?', !!(review as any).custom_setlist);
          return null;
        })()}
        {(review as any).setlist && (
          <div className="mb-3">
            <SetlistDisplay setlist={(review as any).setlist} compact={true} type="api" />
          </div>
        )}

        {/* Custom Setlist Display - User Created */}
        {(review as any).custom_setlist && (review as any).custom_setlist.length > 0 && (
          <div className="mb-3">
            <SetlistDisplay customSetlist={(review as any).custom_setlist} compact={true} type="custom" />
          </div>
        )}

        {/* Event Info / Artist & Venue chips (view mode only) */}
        <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-xs font-semibold tracking-wide text-gray-700 uppercase">Event</p>
          <div className="mt-2 flex items-center flex-wrap gap-2 text-sm">
            {review.artist_name && (
              <>
                <button
                  className="px-2 py-1 rounded-full bg-white border border-gray-200 hover:bg-gray-50 shadow-sm"
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    // Use artist_uuid if available, otherwise fall back to artist_id
                    const artistId = (review as any).artist_uuid || review.artist_id;
                    const ev = new CustomEvent('open-artist-card', { detail: { artistId, artistName: review.artist_name } });
                    document.dispatchEvent(ev);
                  }}
                  aria-label={`View artist ${review.artist_name}`}
                >
                  {review.artist_name}
                </button>
                {currentUserId && (
                  <ArtistFollowButton
                    artistName={review.artist_name}
                    userId={currentUserId}
                    variant="ghost"
                    size="sm"
                    showFollowerCount={false}
                    className="h-7 text-xs"
                  />
                )}
              </>
            )}
            {review.venue_name && (
              <>
                <button
                  className="px-2 py-1 rounded-full bg-white border border-gray-200 hover:bg-gray-50 shadow-sm"
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    // Use venue_uuid if available, otherwise fall back to venue_id
                    const venueId = (review as any).venue_uuid || review.venue_id;
                    const ev = new CustomEvent('open-venue-card', { detail: { venueId, venueName: review.venue_name } });
                    document.dispatchEvent(ev);
                  }}
                  aria-label={`View venue ${review.venue_name}`}
                >
                  {review.venue_name}
                </button>
                {currentUserId && (
                  <VenueFollowButton
                    venueName={review.venue_name}
                    venueCity={(review as any).venue_city}
                    venueState={(review as any).venue_state}
                    userId={currentUserId}
                    variant="ghost"
                    size="sm"
                    showFollowerCount={false}
                    className="h-7 text-xs"
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Category Breakdown */}
        {categoryMetrics.some(({ rating, feedback, recommendation }) => rating || feedback || recommendation) && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categoryMetrics.map((category) => {
              const value = typeof category.rating === 'number' && category.rating > 0 ? category.rating : undefined;
              if (!value && !category.feedback && !category.recommendation) {
                return null;
              }
              return (
                <div
                  key={category.key}
                  className={cn(
                    'rounded-lg border-l-4 p-3 shadow-sm',
                    category.color
                  )}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold uppercase tracking-wide">{category.label}</span>
                    {value && (
                      <div className="flex items-center">
                        {renderStars(value)}
                        <span className="ml-1 font-semibold">{value.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                  {category.recommendation && (
                    <p className="mt-1 text-[11px] font-semibold">{category.recommendation}</p>
                  )}
                  {category.feedback && (
                    <p className="mt-1 text-xs italic opacity-80">“{category.feedback}”</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Social Actions */}
        <div className="flex items-center justify-between pt-3 border-t mt-3">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLike(); }}
              disabled={!currentUserId || isLiking}
              className={cn(
                "flex items-center space-x-1",
                isLiked && "text-red-500"
              )}
            >
              <Heart
                className={cn(
                  "h-4 w-4",
                  isLiked && "fill-current"
                )}
              />
              <span className="text-sm">{likesCount}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleComment(); }}
              className="flex items-center space-x-1"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="text-sm">{commentsCount}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleShare(); }}
              className="flex items-center space-x-1"
            >
              <Share2 className="h-4 w-4" />
              <span className="text-sm">{review.shares_count}</span>
            </Button>

            {/* Report Button - Only show for other users' reviews */}
            {currentUserId && !isOwner && (
              <Button
                variant="ghost"
                size="sm"
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportModalOpen(true); }}
                className="flex items-center space-x-1 text-gray-500 hover:text-red-600 hover:bg-red-50"
                title="Report this review"
              >
                <Flag className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
    </CardContent>
    {showComments && (
      <div className="px-6 pb-4">
        <div className="mt-3 border-t pt-3 space-y-3">
          {loadingComments ? (
            <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading comments…</div>
          ) : comments.length === 0 ? (
            <div className="text-sm text-muted-foreground">No comments yet. Be the first to comment!</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs">
                  {(c.user.name || 'U').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{c.user.name || 'User'}</div>
                  <div className="text-sm text-foreground whitespace-pre-wrap">{c.comment_text}</div>
                  <div className="text-xs text-muted-foreground mt-1">{new Date(c.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={currentUserId ? 'Write a comment…' : 'Sign in to comment'}
              disabled={!currentUserId || submitting}
              className="min-h-[56px]"
            />
            <Button onClick={handleAddComment} disabled={!currentUserId || submitting || !newComment.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    )}
    {imageViewerOpen && photos.length > 0 && (
      <div 
        className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center" 
        onClick={closeImageViewer}
        role="dialog" aria-modal="true"
      >
        <button 
          className="absolute top-4 right-4 text-white/80 hover:text-white text-xl" 
          aria-label="Close"
          onClick={(e) => { e.stopPropagation(); closeImageViewer(); }}
        >
          ×
        </button>
        {photos.length > 1 && (
          <>
            <button 
              className="absolute left-3 md:left-6 text-white/80 hover:text-white text-3xl select-none"
              aria-label="Previous image" onClick={prevImage}
            >‹</button>
            <button 
              className="absolute right-3 md:right-6 text-white/80 hover:text-white text-3xl select-none"
              aria-label="Next image" onClick={nextImage}
            >›</button>
          </>
        )}
        <img 
          src={photos[imageIndex]} 
          alt={`${(review as any).event_name || 'Event'} photo ${imageIndex + 1}`} 
          className="max-h-[85vh] max-w-[92vw] object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )}

    {/* Report Modal */}
    <ReportContentModal
      open={reportModalOpen}
      onClose={() => setReportModalOpen(false)}
      contentType="review"
      contentId={review.id}
      contentTitle={`Review for ${review.artist_name} at ${review.venue_name}`}
      onReportSubmitted={() => {
        setReportModalOpen(false);
        onReport?.(review.id);
      }}
    />
    </Card>
  );
}
