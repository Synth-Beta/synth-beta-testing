import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { 
  ThumbsUp, 
  MessageCircle, 
  Share2, 
  Star, 
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Send,
  Music2,
  Building2,
  DollarSign,
  Compass,
  Lightbulb,
  Flag,
  Edit,
  Trash2,
  Heart,
  Calendar,
  MapPin,
} from 'lucide-react';
import { ReviewWithEngagement, ReviewService, CommentWithUser } from '@/services/reviewService';
import { ReviewShareModal } from '@/components/reviews/ReviewShareModal';
import { formatDistanceToNow, format } from 'date-fns';
import { SetlistDisplay } from './SetlistDisplay';
import { ReportContentModal } from '@/components/moderation/ReportContentModal';
import { supabase } from '@/integrations/supabase/client';
import {
  iosModal,
  iosModalBackdrop,
  iosHeader,
  iosIconButton,
  glassCard,
  glassCardLight,
  textStyles,
  animations,
} from '@/styles/glassmorphism';

interface SwiftUIReviewCardProps {
  review: ReviewWithEngagement;
  currentUserId?: string;
  onLike?: (reviewId: string, isLiked: boolean) => void;
  onComment?: (reviewId: string) => void;
  onShare?: (reviewId: string) => void;
  onEdit?: (review: ReviewWithEngagement) => void;
  onDelete?: (reviewId: string) => void;
  onReport?: (reviewId: string) => void;
  onOpenArtist?: (artistId: string, artistName: string) => void;
  onOpenVenue?: (venueId: string, venueName: string) => void;
  onBack?: () => void;
  onOpenDetail?: (review: ReviewWithEngagement) => void;
  showBackButton?: boolean;
  /** 'compact' for feed cards, 'detail' for full modal view */
  mode?: 'compact' | 'detail';
  userProfile?: {
    name: string;
    avatar_url?: string;
    verified?: boolean;
    account_type?: string;
  };
  /** Artist image URL to use as fallback when no user photos */
  artistImageUrl?: string;
}

export function SwiftUIReviewCard({
  review,
  currentUserId,
  onLike,
  onComment,
  onShare,
  onEdit,
  onDelete,
  onReport,
  onOpenArtist,
  onOpenVenue,
  onBack,
  onOpenDetail,
  showBackButton = false,
  mode = 'detail',
  userProfile,
  artistImageUrl,
}: SwiftUIReviewCardProps) {
  // State for fetched review data
  const [fetchedReviewData, setFetchedReviewData] = useState<any>(null);
  const [fetchedArtistImage, setFetchedArtistImage] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(review.is_liked_by_user || false);
  const [likesCount, setLikesCount] = useState(review.likes_count || 0);
  const [isLiking, setIsLiking] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentWithUser[]>([]);
  const [commentsCount, setCommentsCount] = useState<number>(review.comments_count || 0);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  
  // Photo viewer state
  const photos: string[] = Array.isArray((review as any)?.photos) ? (review as any).photos : [];
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);

  // Normalize attendees: DB stores as TEXT[] (JSON strings), but UI expects attendee objects
  const attendeesRaw = (review as any).attendees;
  const attendeesNormalized: any[] = Array.isArray(attendeesRaw)
    ? (typeof attendeesRaw[0] === 'string'
        ? (attendeesRaw as string[])
            .map((s) => {
              try {
                return JSON.parse(s);
              } catch {
                return null;
              }
            })
            .filter(Boolean)
        : (attendeesRaw as any[]))
    : [];
  const taggedUserAttendees = attendeesNormalized.filter(
    (a): a is { type: 'user'; user_id: string; name: string; avatar_url?: string } =>
      a && (a as any).type === 'user' && typeof (a as any).user_id === 'string'
  );

  // Fetch artist image if not provided and no photos
  useEffect(() => {
    if (!artistImageUrl && photos.length === 0 && review.artist_id) {
      supabase
        .from('artists')
        .select('image_url')
        .eq('id', review.artist_id)
        .single()
        .then(({ data, error }) => {
          if (!error && data?.image_url) {
            setFetchedArtistImage(data.image_url);
          }
        });
    }
  }, [artistImageUrl, photos.length, review.artist_id]);

  // Determine the image to display - user photo first, then artist image
  const displayImageUrl = photos.length > 0 ? photos[0] : (artistImageUrl || fetchedArtistImage);
  const isUserPhoto = photos.length > 0;

  // Fetch full review data if category ratings are missing
  useEffect(() => {
    const hasCategoryRatings = 
      (review as any).artist_performance_rating != null ||
      (review as any).production_rating != null ||
      (review as any).venue_rating != null ||
      (review as any).location_rating != null ||
      (review as any).value_rating != null;

    if (!hasCategoryRatings) {
      supabase
        .from('reviews')
        .select('rating, artist_performance_rating, production_rating, venue_rating, location_rating, value_rating, artist_performance_feedback, production_feedback, venue_feedback, location_feedback, value_feedback')
        .eq('id', review.id)
        .single()
        .then(({ data, error }) => {
          if (!error && data) {
            setFetchedReviewData(data);
          }
        });
    }
  }, [review.id]);

  // Refresh engagement data
  useEffect(() => {
    const refreshEngagement = async () => {
      if (currentUserId) {
        try {
          const engagement = await ReviewService.getReviewEngagement(review.id, currentUserId);
          if (engagement) {
            setLikesCount(engagement.likes_count);
            setCommentsCount(engagement.comments_count);
            setIsLiked(engagement.is_liked_by_user);
          }
        } catch (error) {
          console.error('Error refreshing engagement:', error);
        }
      }
    };
    refreshEngagement();
  }, [review.id, currentUserId]);

  const handleLike = async () => {
    if (!currentUserId || isLiking) return;
    
    setIsLiking(true);
    try {
      if (isLiked) {
        await ReviewService.unlikeReview(currentUserId, review.id);
        setLikesCount(prev => Math.max(0, prev - 1));
        setIsLiked(false);
      } else {
        await ReviewService.likeReview(currentUserId, review.id);
        setLikesCount(prev => prev + 1);
        setIsLiked(true);
      }
      onLike?.(review.id, !isLiked);
    } catch (error) {
      console.error('Error toggling like:', error);
    } finally {
      setIsLiking(false);
    }
  };

  const handleComment = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next && comments.length === 0) {
      try {
        setLoadingComments(true);
        const result = await ReviewService.getReviewComments(review.id);
        setComments(result);
        setCommentsCount(result.length);
      } catch (error) {
        console.error('Error loading comments:', error);
      } finally {
        setLoadingComments(false);
      }
    }
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
            name: userProfile?.name || 'You',
            avatar_url: userProfile?.avatar_url
          }
        } as CommentWithUser
      ]);
      setNewComment('');
      setCommentsCount(prev => prev + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = () => {
    onShare?.(review.id);
    setShareModalOpen(true);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onEdit?.(review);
  };

  const handleDelete = async () => {
    if (onDelete && window.confirm('Are you sure you want to delete this review?')) {
      onDelete(review.id);
    }
  };

  const isOwner = currentUserId && review.user_id === currentUserId;

  // Get category ratings
  const artistPerf = fetchedReviewData?.artist_performance_rating ?? (review as any).artist_performance_rating;
  const production = fetchedReviewData?.production_rating ?? (review as any).production_rating;
  const venue = fetchedReviewData?.venue_rating ?? (review as any).venue_rating;
  const location = fetchedReviewData?.location_rating ?? (review as any).location_rating;
  const value = fetchedReviewData?.value_rating ?? (review as any).value_rating;

  const timeAgo = review.created_at 
    ? formatDistanceToNow(new Date(review.created_at), { addSuffix: true })
    : 'Recently';

  // Render stars helper
  const renderStars = (rating: number) => {
    return (
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: 5 }, (_, i) => {
          const starIndex = i + 1;
          const isFull = rating >= starIndex;
          const isHalf = !isFull && rating >= starIndex - 0.5;
          
          return (
            <div key={i} style={{ position: 'relative', width: 16, height: 16 }}>
              <Star size={16} style={{ color: 'var(--neutral-300)' }} />
              {(isHalf || isFull) && (
                <div style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  overflow: 'hidden',
                  width: isFull ? '100%' : '50%',
                }}>
                  <Star size={16} fill="#F5A623" style={{ color: '#F5A623' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Category ratings data
  const categoryRatings = [
    {
      label: 'Artist Performance',
      rating: artistPerf,
      feedback: fetchedReviewData?.artist_performance_feedback ?? (review as any).artist_performance_feedback,
      icon: Music2,
      iconColor: 'var(--brand-pink-500)',
    },
    {
      label: 'Production Quality',
      rating: production,
      feedback: fetchedReviewData?.production_feedback ?? (review as any).production_feedback,
      icon: Lightbulb,
      iconColor: '#8B5CF6',
    },
    {
      label: 'Venue Experience',
      rating: venue,
      feedback: fetchedReviewData?.venue_feedback ?? (review as any).venue_feedback,
      icon: Building2,
      iconColor: '#3B82F6',
    },
    {
      label: 'Location & Logistics',
      rating: location,
      feedback: fetchedReviewData?.location_feedback ?? (review as any).location_feedback,
      icon: Compass,
      iconColor: '#10B981',
    },
    {
      label: 'Value for Ticket',
      rating: value,
      feedback: fetchedReviewData?.value_feedback ?? (review as any).value_feedback,
      icon: DollarSign,
      iconColor: '#F59E0B',
    },
  ];

  // Action button style
  const actionButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flex: '1 1 0',
    minWidth: 0,
    flexShrink: 1,
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    transition: `all ${animations.standardDuration} ${animations.springTiming}`,
  };

  // Calculate overall rating from categories
  const categoryValues = [artistPerf, production, venue, location, value]
    .filter((v): v is number => typeof v === 'number' && !isNaN(v) && v > 0);
  const overallRating = categoryValues.length > 0
    ? categoryValues.reduce((a, b) => a + b, 0) / categoryValues.length
    : (typeof review.rating === 'number' ? review.rating : null);

  // Format event date for display
  const eventDate = (review as any).Event_date ? new Date((review as any).Event_date) : null;
  const formatEventDate = (date: Date | null) => {
    if (!date) return '';
    return format(date, 'EEE, MMM d, yyyy');
  };

  // ========================================
  // COMPACT MODE - Feed Card (matches CompactEventCard exactly)
  // ========================================
  if (mode === 'compact') {
    const reviewTitle = review.artist_name 
      ? `${review.artist_name}${review.venue_name ? ` at ${review.venue_name}` : ''}`
      : review.venue_name || 'Concert Review';

    return (
      <>
        <div
          className={cn(
            'swift-ui-card flex flex-col overflow-hidden',
            'relative group cursor-pointer',
            'w-full h-full max-h-[85vh]'
          )}
          onClick={() => onOpenDetail?.(review)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenDetail?.(review);
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`View review: ${reviewTitle}`}
        >
          {/* Review Image */}
          <div className="relative w-full flex-1 min-h-[60vh] max-h-[70vh] overflow-hidden">
            {displayImageUrl ? (
              <>
                <img 
                  src={displayImageUrl} 
                  alt={reviewTitle} 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.onerror = null;
                  }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(to top, rgba(14, 14, 14, 0.8) 0%, rgba(14, 14, 14, 0.4) 50%, transparent 100%)',
                  }}
                />
                {/* Rating Badge - top left */}
                {overallRating && (
                  <div
                    className="absolute left-4 px-3 py-1.5 rounded-lg"
                    style={{
                      top: 'var(--spacing-grouped, 24px)',
                      backgroundColor: '#F5A623',
                      color: 'var(--neutral-50)',
                      boxShadow: '0 4px 4px 0 var(--shadow-color)',
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      letterSpacing: '0.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      zIndex: 50,
                    }}
                  >
                    <Star size={16} fill="currentColor" />
                    {overallRating.toFixed(1)}
                  </div>
                )}
                {/* User photo badge */}
                {isUserPhoto && (
                  <div className="absolute top-4 right-4 swift-ui-badge z-50" aria-hidden="true">
                    <span className="swift-ui-badge-text">User Photo</span>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center swift-ui-gradient-bg">
                <div className="text-center px-4">
                  <p
                    className="line-clamp-2"
                    style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-h2-size, 24px)',
                      fontWeight: 'var(--typography-h2-weight, 700)',
                      lineHeight: 'var(--typography-h2-line-height, 1.3)',
                      color: 'var(--neutral-0)',
                    }}
                  >
                    {reviewTitle}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Content Overlay */}
          <div className="absolute bottom-0 left-0 right-0 swift-ui-card-content" style={{ zIndex: 40 }}>
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, color-mix(in srgb, var(--neutral-0) 96%, transparent) 0%, color-mix(in srgb, var(--neutral-0) 90%, transparent) 60%, color-mix(in srgb, var(--neutral-0) 70%, transparent) 100%)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
              }}
            />

            <div
              className="relative flex flex-col"
              style={{ padding: 'var(--spacing-grouped, 24px)', gap: 'var(--spacing-small, 12px)' }}
            >
              {/* Title */}
              <h2
                className="line-clamp-2"
                style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-h2-size, 24px)',
                  fontWeight: 'var(--typography-h2-weight, 700)',
                  lineHeight: 'var(--typography-h2-line-height, 1.3)',
                  color: 'var(--neutral-900)',
                }}
              >
                {reviewTitle}
              </h2>

              {/* Meta info */}
              <div className="flex flex-col" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                {/* Reviewer info */}
                <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                  <Avatar className="w-5 h-5" style={{ border: '1.5px solid var(--brand-pink-500)' }}>
                    <AvatarImage src={userProfile?.avatar_url || undefined} />
                    <AvatarFallback style={{ background: 'var(--brand-pink-500)', color: '#fff', fontSize: 10, fontWeight: 600 }}>
                      {userProfile?.name?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--neutral-700)',
                    }}
                  >
                    Reviewed by {userProfile?.name || 'User'}
                  </span>
                </div>
                {/* Event date */}
                {eventDate && (
                  <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                    <Calendar size={20} style={{ color: 'var(--brand-pink-500)' }} />
                    <span
                      style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        color: 'var(--neutral-700)',
                      }}
                    >
                      {formatEventDate(eventDate)}
                    </span>
                  </div>
                )}
              </div>

              {/* Tagged attendees (users only) */}
              {taggedUserAttendees.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  {taggedUserAttendees.map((attendee) => (
                    <div
                      key={attendee.user_id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 12px',
                        borderRadius: 999,
                        border: '1px solid var(--neutral-200)',
                        background: 'var(--neutral-100)',
                        maxWidth: '100%',
                      }}
                    >
                      <Avatar className="w-5 h-5" style={{ border: '1.5px solid var(--brand-pink-500)' }}>
                        <AvatarImage src={attendee.avatar_url || undefined} alt={attendee.name} />
                        <AvatarFallback
                          style={{
                            background: 'var(--brand-pink-500)',
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        >
                          {attendee.name?.charAt(0).toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        style={{
                          fontFamily: 'var(--font-family)',
                          fontSize: 14,
                          fontWeight: 600,
                          lineHeight: 1.2,
                          color: 'var(--neutral-800)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {attendee.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Review text preview */}
              {review.review_text && review.review_text !== 'ATTENDANCE_ONLY' && (
                <p
                  className="line-clamp-2"
                  style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    color: 'var(--neutral-600)',
                    margin: 0,
                  }}
                >
                  "{review.review_text}"
                </p>
              )}

              {/* Engagement count */}
              {(likesCount > 0 || commentsCount > 0) && (
                <div
                  style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    color: 'var(--neutral-600)',
                  }}
                >
                  {likesCount > 0 && `${likesCount} ${likesCount === 1 ? 'person' : 'people'} found helpful`}
                  {likesCount > 0 && commentsCount > 0 && ' · '}
                  {commentsCount > 0 && `${commentsCount} ${commentsCount === 1 ? 'comment' : 'comments'}`}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)', paddingTop: 'var(--spacing-small, 12px)' }}>
                {/* Helpful toggle button */}
                <Button
                  variant="secondary-neutral"
                  className="flex items-center gap-2 flex-1"
                  style={{
                    height: 'var(--size-input-height, 44px)',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLike();
                  }}
                  disabled={!currentUserId || isLiking}
                  aria-label={isLiked ? 'Remove helpful' : 'Mark as helpful'}
                >
                  <ThumbsUp 
                    className={cn('w-4 h-4', isLiked && 'fill-current')} 
                    style={{ color: 'var(--neutral-50)' }} 
                  />
                  <span style={{ 
                    color: 'var(--neutral-600)',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  }}>{likesCount}</span>
                  <span style={{ 
                    color: 'var(--neutral-900)',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  }}>Helpful</span>
                </Button>

                {/* Comments button */}
                <Button
                  variant="secondary-neutral"
                  className="flex items-center gap-2 flex-1"
                  style={{
                    height: 'var(--size-input-height, 44px)',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetail?.(review);
                  }}
                  aria-label="View comments"
                >
                  <MessageCircle className="w-4 h-4" style={{ color: 'var(--neutral-50)' }} />
                  <span style={{ 
                    color: 'var(--neutral-600)',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  }}>{commentsCount}</span>
                  <span style={{ 
                    color: 'var(--neutral-900)',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  }}>Comments</span>
                </Button>

                {/* Share button */}
                <Button
                  className="btn-synth-primary shrink-0"
                  style={{
                    width: 'var(--size-input-height, 44px)',
                    height: 'var(--size-input-height, 44px)',
                    padding: 0,
                    backgroundColor: 'var(--brand-pink-500, #FF3399)',
                    color: 'var(--neutral-50)',
                    borderRadius: 'var(--radius-corner, 10px)',
                    boxShadow: '0 4px 4px 0 var(--shadow-color)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--brand-pink-500, #FF3399)';
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShare();
                  }}
                  aria-label="Share review"
                >
                  <Share2 className="w-6 h-6" style={{ color: 'var(--neutral-50)' }} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Review Share Modal for compact mode */}
        {shareModalOpen && currentUserId && (
          <ReviewShareModal
            review={review}
            currentUserId={currentUserId}
            isOpen={shareModalOpen}
            onClose={() => setShareModalOpen(false)}
          />
        )}
      </>
    );
  }

  // ========================================
  // DETAIL MODE - Full Modal View
  // ========================================
  return (
    <>
      {/* iOS Modal Container */}
      <div
        style={{
          ...iosModal,
          background: 'var(--neutral-50, #FCFCFC)',
          position: 'relative',
          height: 'auto',
          minHeight: '100vh',
        }}
      >
        {/* iOS-style Header */}
        <div
          style={{
            ...iosHeader,
            position: 'sticky',
            top: 0,
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          }}
        >
          {showBackButton && onBack ? (
            <button onClick={onBack} style={{ ...iosIconButton, width: 44, height: 44, minWidth: 44, minHeight: 44 }} aria-label="Go back" type="button">
              <ChevronLeft size={24} style={{ color: 'var(--neutral-900)' }} aria-hidden="true" />
            </button>
          ) : (
            <div style={{ width: 44 }} />
          )}
          
          {/* User Info in Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, justifyContent: 'center' }}>
            <Avatar className="w-10 h-10" style={{ border: '2px solid var(--brand-pink-500)' }}>
              <AvatarImage src={userProfile?.avatar_url || undefined} alt={userProfile?.name || 'User'} />
              <AvatarFallback style={{ background: 'var(--brand-pink-500)', color: '#fff', fontWeight: 600 }}>
                {userProfile?.name?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div style={{ textAlign: 'left' }}>
              <p style={{ ...textStyles.title3, color: 'var(--neutral-900)', margin: 0 }}>
                {userProfile?.name || 'User'}
              </p>
              <p style={{ ...textStyles.caption, margin: 0 }}>
                Reviewed{' '}
                <span 
                  style={{ color: 'var(--brand-pink-500)', cursor: 'pointer' }}
                  onClick={() => onOpenArtist?.(review.artist_id || '', review.artist_name || '')}
                >
                  {review.artist_name || 'Artist'}
                </span>
                {review.venue_name && (
                  <>
                    {' '}at{' '}
                    <span 
                      style={{ color: 'var(--brand-pink-500)', cursor: 'pointer' }}
                      onClick={() => onOpenVenue?.(review.venue_id || '', review.venue_name || '')}
                    >
                      {review.venue_name}
                    </span>
                  </>
                )}
              </p>
              <p style={{ ...textStyles.caption, margin: 0, marginTop: 2 }}>{timeAgo}</p>
            </div>
          </div>

          {/* Edit/Delete for owner, Report for others */}
          {isOwner ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={handleEdit} style={{ ...iosIconButton, width: 44, height: 44, minWidth: 44, minHeight: 44 }} aria-label="Edit review" type="button">
                <Edit size={18} style={{ color: 'var(--neutral-600)' }} aria-hidden="true" />
              </button>
              <button onClick={handleDelete} style={{ ...iosIconButton, width: 44, height: 44, minWidth: 44, minHeight: 44 }} aria-label="Delete review" type="button">
                <Trash2 size={18} style={{ color: '#EF4444' }} aria-hidden="true" />
              </button>
            </div>
          ) : currentUserId ? (
            <button 
              onClick={() => setReportModalOpen(true)} 
              style={{ ...iosIconButton, width: 44, height: 44, minWidth: 44, minHeight: 44 }} 
              aria-label="Report review"
              type="button"
            >
              <Flag size={20} style={{ color: 'var(--neutral-600)' }} aria-hidden="true" />
            </button>
          ) : (
            <div style={{ width: 44 }} />
          )}
        </div>

        {/* Content */}
        <div style={{ padding: 20, paddingBottom: 120 }}>
          {/* Tagged attendees (users only) */}
          {taggedUserAttendees.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 12,
              }}
            >
              {taggedUserAttendees.map((attendee) => (
                <div
                  key={attendee.user_id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: '2px solid var(--brand-pink-500, #FF3399)',
                    background: '#FFFFFF',
                    maxWidth: '100%',
                  }}
                >
                  <Avatar className="w-7 h-7" style={{ border: '2px solid var(--brand-pink-500, #FF3399)' }}>
                    <AvatarImage src={attendee.avatar_url || undefined} alt={attendee.name} />
                    <AvatarFallback
                      style={{
                        background: 'var(--brand-pink-500, #FF3399)',
                        color: '#FFFFFF',
                        fontWeight: 600,
                      }}
                    >
                      {attendee.name?.charAt(0).toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--brand-pink-500, #FF3399)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {attendee.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Review Text */}
          {review.review_text && review.review_text !== 'ATTENDANCE_ONLY' && (
            <div
              style={{
                ...glassCard,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <p style={{ ...textStyles.body, color: 'var(--neutral-800)', margin: 0 }}>
                {review.review_text}
              </p>
            </div>
          )}

          {/* Photo Gallery */}
          {photos.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: photos.length === 1 ? '1fr' : 'repeat(2, 1fr)', 
                gap: 8,
                borderRadius: 16,
                overflow: 'hidden',
              }}>
                {photos.slice(0, 4).map((photo, idx) => (
                  <div
                    key={idx}
                    style={{
                      aspectRatio: photos.length === 1 ? '16/9' : '1',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                    onClick={() => {
                      setImageIndex(idx);
                      setImageViewerOpen(true);
                    }}
                  >
                    <img
                      src={photo}
                      alt={`Review photo ${idx + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    {idx === 3 && photos.length > 4 && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(0,0,0,0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 24,
                        fontWeight: 700,
                      }}>
                        +{photos.length - 4}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category Ratings Toggle */}
          <button
            onClick={() => setDetailsExpanded(!detailsExpanded)}
            style={{
              ...glassCardLight,
              width: '100%',
              padding: '14px 16px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              border: 'none',
            }}
          >
            <span style={{ ...textStyles.callout, fontWeight: 600, color: 'var(--neutral-900)' }}>
              Rating Details
            </span>
            {detailsExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>

          {/* Category Rating Cards */}
          {detailsExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {categoryRatings.map((cat) => {
                const ratingValue = typeof cat.rating === 'string' ? parseFloat(cat.rating) : cat.rating;
                const resolvedRating = typeof ratingValue === 'number' && !isNaN(ratingValue) && ratingValue > 0
                  ? ratingValue : undefined;

                if (!resolvedRating && !cat.feedback) return null;

                const IconComponent = cat.icon;

                return (
                  <div
                    key={cat.label}
                    style={{
                      ...glassCardLight,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <IconComponent size={20} style={{ color: cat.iconColor }} />
                        <span style={{ ...textStyles.callout, fontWeight: 600, color: 'var(--neutral-900)' }}>
                          {cat.label}
                        </span>
                      </div>
                      {resolvedRating && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ ...textStyles.title3, color: 'var(--neutral-900)' }}>
                            {resolvedRating.toFixed(1)}
                          </span>
                          {renderStars(resolvedRating)}
                        </div>
                      )}
                    </div>
                    {cat.feedback && (
                      <p style={{ 
                        ...textStyles.footnote, 
                        fontStyle: 'italic', 
                        margin: 0,
                        color: 'var(--neutral-700)',
                      }}>
                        "{cat.feedback}"
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Setlist Display */}
          {(review as any).setlist && (
            <div style={{ marginBottom: 20 }}>
              <SetlistDisplay setlist={(review as any).setlist} compact={true} type="api" />
            </div>
          )}

          {(review as any).custom_setlist && (review as any).custom_setlist.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <SetlistDisplay customSetlist={(review as any).custom_setlist} compact={true} type="custom" />
            </div>
          )}

          {/* Comments Section */}
          {showComments && (
            <div
              style={{
                ...glassCard,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <h4 style={{ ...textStyles.title3, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageCircle size={18} style={{ color: 'var(--brand-pink-500)' }} />
                Comments ({commentsCount})
              </h4>
              
              {loadingComments ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0' }}>
                  <Loader2 size={16} className="animate-spin" />
                  <span style={{ ...textStyles.footnote }}>Loading comments...</span>
                </div>
              ) : comments.length === 0 ? (
                <p style={{ ...textStyles.footnote, textAlign: 'center', padding: '20px 0' }}>
                  No comments yet. Be the first to comment!
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {comments.map((c: any) => (
                    <div 
                      key={c.id} 
                      style={{ 
                        ...glassCardLight, 
                        padding: 12,
                        display: 'flex',
                        gap: 12,
                      }}
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={c.user?.avatar_url} />
                        <AvatarFallback style={{ background: 'var(--brand-pink-500)', color: '#fff', fontSize: 12 }}>
                          {(c.user?.name || 'U').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                          <span style={{ ...textStyles.subhead, fontWeight: 600 }}>{c.user?.name || 'User'}</span>
                          <span style={{ ...textStyles.caption }}>
                            {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p style={{ ...textStyles.body, margin: 0, fontSize: 14 }}>{c.comment_text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add Comment Form */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={currentUserId ? 'Write a comment...' : 'Sign in to comment'}
                  disabled={!currentUserId || submitting}
                  style={{ 
                    flex: 1, 
                    minHeight: 60,
                    borderRadius: 12,
                    border: '1px solid var(--neutral-200)',
                  }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={!currentUserId || submitting || !newComment.trim()}
                  style={{
                    ...iosIconButton,
                    width: 48,
                    height: 48,
                    background: 'var(--brand-pink-500)',
                    opacity: (!currentUserId || submitting || !newComment.trim()) ? 0.5 : 1,
                  }}
                >
                  {submitting ? (
                    <Loader2 size={20} className="animate-spin" style={{ color: '#fff' }} />
                  ) : (
                    <Send size={20} style={{ color: '#fff' }} />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Action Bar */}
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            boxSizing: 'border-box',
            minWidth: 0,
            paddingTop: 12,
            paddingLeft: 'calc(20px + env(safe-area-inset-left, 0px))',
            paddingRight: 'calc(20px + env(safe-area-inset-right, 0px))',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 34px))',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderTop: '0.5px solid rgba(0, 0, 0, 0.1)',
            display: 'flex',
            gap: 8,
            zIndex: 10,
          }}
        >
          {/* Helpful Button */}
          <button
            onClick={handleLike}
            disabled={!currentUserId || isLiking}
            style={{
              ...actionButtonStyle,
              background: isLiked ? 'rgba(204, 36, 134, 0.1)' : 'var(--neutral-100)',
              color: isLiked ? 'var(--brand-pink-500)' : 'var(--neutral-700)',
            }}
          >
            <ThumbsUp size={18} fill={isLiked ? 'currentColor' : 'none'} />
            <span>{likesCount}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Helpful
            </span>
          </button>

          {/* Comments Button */}
          <button
            onClick={handleComment}
            style={{
              ...actionButtonStyle,
              background: showComments ? 'rgba(204, 36, 134, 0.1)' : 'var(--neutral-100)',
              color: showComments ? 'var(--brand-pink-500)' : 'var(--neutral-700)',
            }}
          >
            <MessageCircle size={18} />
            <span>{commentsCount}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Comments
            </span>
          </button>

          {/* Share Button */}
          <button
            onClick={handleShare}
            style={{
              ...actionButtonStyle,
              background: 'var(--brand-pink-500)',
              color: '#fff',
              flex: '0.5 1 0',
            }}
          >
            <Share2 size={18} />
          </button>
        </div>
      </div>

      {/* Image Viewer Modal */}
      {imageViewerOpen && photos.length > 0 && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setImageViewerOpen(false)}
        >
          <button 
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#fff',
              fontSize: 24,
              cursor: 'pointer',
            }}
            onClick={(e) => { e.stopPropagation(); setImageViewerOpen(false); }}
          >
            ×
          </button>
          {photos.length > 1 && (
            <>
              <button 
                style={{
                  position: 'absolute',
                  left: 16,
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: '#fff',
                  fontSize: 24,
                  cursor: 'pointer',
                }}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setImageIndex((idx) => (idx - 1 + photos.length) % photos.length); 
                }}
              >
                ‹
              </button>
              <button 
                style={{
                  position: 'absolute',
                  right: 16,
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: '#fff',
                  fontSize: 24,
                  cursor: 'pointer',
                }}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setImageIndex((idx) => (idx + 1) % photos.length); 
                }}
              >
                ›
              </button>
            </>
          )}
          <img 
            src={photos[imageIndex]} 
            alt={`Review photo ${imageIndex + 1}`}
            style={{
              maxHeight: '85vh',
              maxWidth: '90vw',
              objectFit: 'contain',
              borderRadius: 8,
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <p style={{
            position: 'absolute',
            bottom: 40,
            color: 'rgba(255,255,255,0.7)',
            fontSize: 14,
          }}>
            {imageIndex + 1} / {photos.length}
          </p>
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

      {/* Review Share Modal */}
      {shareModalOpen && currentUserId && (
        <ReviewShareModal
          review={review}
          currentUserId={currentUserId}
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
        />
      )}
    </>
  );
}