import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerificationBadge } from '@/components/verification/VerificationBadge';
import { 
  ThumbsUp, 
  MessageCircle, 
  Share2, 
  MoreHorizontal, 
  Star, 
  Edit, 
  Trash2, 
  Flag,
  Bookmark,
  Music2,
  MapPin,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  Send,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewWithEngagement, ReviewService, CommentWithUser } from '@/services/reviewService';
import { Textarea } from '@/components/ui/textarea';
import { ShareService } from '@/services/shareService';
import { formatDistanceToNow } from 'date-fns';
import { SetlistDisplay } from './SetlistDisplay';
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';
import { VenueFollowButton } from '@/components/venues/VenueFollowButton';
import { ReportContentModal } from '@/components/moderation/ReportContentModal';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface BelliStyleReviewCardProps {
  review: ReviewWithEngagement;
  currentUserId?: string;
  onLike?: (reviewId: string, isLiked: boolean) => void;
  onComment?: (reviewId: string) => void;
  onShare?: (reviewId: string) => void;
  onEdit?: (review: ReviewWithEngagement) => void;
  onDelete?: (reviewId: string) => void;
  showEventInfo?: boolean;
  onReport?: (reviewId: string) => void;
  userProfile?: {
    name: string;
    avatar_url?: string;
    verified?: boolean;
    account_type?: string;
  };
  followedArtists?: string[];
  followedVenues?: Array<{
    name: string;
    city?: string;
    state?: string;
  }>;
}

export function BelliStyleReviewCard({
  review,
  currentUserId,
  onLike,
  onComment,
  onShare,
  onEdit,
  onDelete,
  showEventInfo = false,
  onReport,
  userProfile,
  followedArtists = [],
  followedVenues = []
}: BelliStyleReviewCardProps) {
  const [isLiked, setIsLiked] = useState(review.is_liked_by_user || false);
  const [likesCount, setLikesCount] = useState(review.likes_count);
  const [isLiking, setIsLiking] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentWithUser[]>([]);
  const [commentsCount, setCommentsCount] = useState<number>(review.comments_count || 0);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const photos: string[] = Array.isArray((review as any)?.photos) ? (review as any).photos : [];
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const handleLike = async () => {
    if (!currentUserId || isLiking) {
      return;
    }
    
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
      
      if (onLike) {
        onLike(review.id, !isLiked);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
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

  const handleShare = async () => {
    await ShareService.shareReview(review.id, 'Concert Review', review.review_text || undefined);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('BelliStyleReviewCard: Edit button clicked', { reviewId: review.id });
    if (onEdit) {
      onEdit(review);
    } else {
      console.warn('onEdit handler not provided to BelliStyleReviewCard');
    }
  };

  const handleDelete = async () => {
    if (onDelete && window.confirm('Are you sure you want to delete this review?')) {
      onDelete(review.id);
    }
  };

  const handleSave = () => {
    // Toggle save state (implement save functionality with backend later)
    setIsSaved(!isSaved);
  };

  const isOwner = currentUserId && review.user_id === currentUserId;

  // Calculate ring color based on rating
  const getRingColor = (rating: number) => {
    if (rating >= 4.5) return 'ring-green-500';
    if (rating >= 3.5) return 'ring-yellow-500';
    if (rating >= 2.5) return 'ring-orange-500';
    return 'ring-red-500';
  };

  // Calculate gradient color for rating badge
  const getRatingGradient = (rating: number) => {
    if (rating >= 4.5) return 'from-green-400 to-green-600';
    if (rating >= 3.5) return 'from-yellow-400 to-yellow-600';
    if (rating >= 2.5) return 'from-orange-400 to-orange-600';
    return 'from-red-400 to-red-600';
  };

  const renderStars = (rating: number, size: 'sm' | 'md' = 'sm') => {
    const starSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
    return Array.from({ length: 5 }, (_, i) => {
      const starIndex = i + 1;
      const isFull = rating >= starIndex;
      const isHalf = !isFull && rating >= starIndex - 0.5;
      
      return (
        <div key={i} className={cn('relative', starSize)}>
          <Star className={cn(starSize, 'text-gray-300')} />
          {(isHalf || isFull) && (
            <div className={cn('absolute left-0 top-0 h-full overflow-hidden pointer-events-none', isFull ? 'w-full' : 'w-1/2')}>
              <Star className={cn(starSize, 'text-yellow-400 fill-current')} />
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
    const el = document.getElementById(`belli-review-card-${review.id}`);
    el?.addEventListener('toggle-review-comments', listener as EventListener);
    return () => el?.removeEventListener('toggle-review-comments', listener as EventListener);
  }, [review.id, showComments, comments.length]);

  // Refresh engagement data when component mounts
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
          console.error('Error refreshing engagement data:', error);
        }
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
    <Card 
      className="w-full border-2 shadow-lg hover:shadow-xl transition-all duration-300 bg-gray-50 rounded-xl overflow-hidden" 
      id={`belli-review-card-${review.id}`}
    >
      <CardHeader className="pb-4 bg-gradient-to-br from-gray-50 via-white to-gray-50 border-b-2 relative">
        {/* Hero Rating Badge - Top Right */}
        <div className={cn(
          "absolute top-4 right-4 w-16 h-16 rounded-full flex flex-col items-center justify-center",
          "bg-gradient-to-br shadow-lg",
          getRatingGradient(review.rating),
          "text-white font-bold z-10"
        )}>
          <span className="text-2xl leading-none">{review.rating.toFixed(1)}</span>
          <div className="flex items-center gap-0.5 mt-1">
            {Array.from({ length: 5 }, (_, i) => (
              <Star 
                key={i} 
                className={cn(
                  "w-2 h-2",
                  i < Math.round(review.rating) ? "fill-white text-white" : "text-white/40"
                )} 
              />
            ))}
          </div>
        </div>

        {/* Profile Info Row */}
        <div className="flex items-start gap-4 pr-20">
          {/* Large Avatar with Colored Ring */}
          <Avatar className={cn("w-14 h-14 ring-4", getRingColor(review.rating))}>
            <AvatarImage src={userProfile?.avatar_url || undefined} alt={userProfile?.name || 'User'} />
            <AvatarFallback className="text-lg font-semibold bg-gradient-to-br from-[#FF3399] to-[#FF66B3] text-white">
              {userProfile?.name?.charAt(0).toUpperCase() || review.user_id?.slice(0, 1).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          
          {/* User Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-bold text-gray-900">
                {userProfile?.name || 'User'}
              </h3>
              {userProfile?.verified && userProfile?.account_type && (
                <VerificationBadge
                  accountType={userProfile.account_type as any}
                  verified={userProfile.verified}
                  size="md"
                />
              )}
            </div>
            
            {/* "Reviewed [Artist] at [Venue]" subtitle */}
            <p className="text-sm text-gray-600 font-medium">
              Reviewed <span className="text-[#FF3399] font-semibold">{review.artist_name || 'Artist'}</span>
              {review.venue_name && (
                <>
                  {' '}at <span className="text-gray-800">{review.venue_name}</span>
                </>
              )}
            </p>
            
            {/* Date and Location Metadata */}
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
              <span>{formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}</span>
              {(review as any).venue_city && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {(review as any).venue_city}, {(review as any).venue_state}
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Action Menu */}
          {isOwner && (
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={(e) => handleEdit(e)}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                title="Edit review"
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
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-5 px-5 pb-2">
        {/* Review Text */}
        {review.review_text && review.review_text !== 'ATTENDANCE_ONLY' && (
          <div className="mb-4">
            <p className="text-base leading-relaxed text-gray-800">
              {review.review_text}
            </p>
          </div>
        )}

        {/* Photo Gallery Grid */}
        {photos.length > 0 && (
          <div className="mb-4">
            {photos.length === 1 ? (
              // Single photo - large display
              <div className="rounded-lg overflow-hidden border-2 border-gray-200 shadow-sm">
                <img
                  src={photos[0]}
                  alt="Review photo"
                  className="w-full h-80 object-cover cursor-zoom-in hover:opacity-95 transition-opacity"
                  loading="lazy"
                  onClick={(e) => { e.stopPropagation(); openImageViewer(0); }}
                />
              </div>
            ) : (
              // Multiple photos - grid layout (first photo large, others in column)
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 row-span-2 rounded-lg overflow-hidden border-2 border-gray-200 shadow-sm">
                  <img
                    src={photos[0]}
                    alt="Review photo 1"
                    className="w-full h-full object-cover cursor-zoom-in hover:opacity-95 transition-opacity"
                    loading="lazy"
                    onClick={(e) => { e.stopPropagation(); openImageViewer(0); }}
                  />
                </div>
                {photos.slice(1, 5).map((photo, idx) => (
                  <div key={idx} className="rounded-lg overflow-hidden border-2 border-gray-200 shadow-sm aspect-square">
                    <img
                      src={photo}
                      alt={`Review photo ${idx + 2}`}
                      className="w-full h-full object-cover cursor-zoom-in hover:opacity-95 transition-opacity"
                      loading="lazy"
                      onClick={(e) => { e.stopPropagation(); openImageViewer(idx + 1); }}
                    />
                  </div>
                ))}
                {photos.length > 5 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openImageViewer(5); }}
                    className="rounded-lg overflow-hidden border-2 border-gray-200 shadow-sm aspect-square bg-black/60 flex items-center justify-center text-white font-bold text-lg hover:bg-black/70 transition-colors"
                  >
                    +{photos.length - 5}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Structured Rating Sections with Icons */}
        <Collapsible open={detailsExpanded} onOpenChange={setDetailsExpanded}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="outline" 
              className="w-full mb-3 flex items-center justify-between hover:bg-gray-50"
              onClick={(e) => {
                e.stopPropagation();
                setDetailsExpanded(!detailsExpanded);
              }}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                View Rating Details
              </span>
              {detailsExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 mb-4">
          {/* Performance Section */}
          {(review.performance_rating || review.rating) && (
              <div className="border-l-4 border-[#FF3399] bg-gradient-to-r from-[#FF3399]/5 to-[#FF3399]/10 rounded-r-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Music2 className="w-5 h-5 text-[#FF3399]" />
                    <span className="text-sm font-bold text-gray-900">Performance</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {renderStars(review.performance_rating || review.rating, 'md')}
                    </div>
                    <span className="text-lg font-bold text-gray-900">
                      {(review.performance_rating || review.rating).toFixed(1)}
                    </span>
                  </div>
                </div>
                {review.performance_review_text && (
                  <p className="text-sm text-gray-700 italic leading-relaxed">
                    "{review.performance_review_text}"
                  </p>
                )}
              </div>
            )}

          {/* Venue Section */}
          {(review.venue_rating || review.rating) && (
              <div className="border-l-4 border-blue-500 bg-gradient-to-r from-blue-50 to-blue-50/30 rounded-r-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-bold text-blue-900">Venue</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {renderStars(review.venue_rating || review.rating, 'md')}
                    </div>
                    <span className="text-lg font-bold text-blue-900">
                      {(review.venue_rating || review.rating).toFixed(1)}
                    </span>
                  </div>
                </div>
                {review.venue_review_text && (
                  <p className="text-sm text-blue-900/80 italic leading-relaxed">
                    "{review.venue_review_text}"
                  </p>
                )}
              </div>
            )}

          {/* Overall Experience Section */}
          {(review.overall_experience_rating || review.rating) && (
              <div className="border-l-4 border-emerald-500 bg-gradient-to-r from-emerald-50 to-emerald-50/30 rounded-r-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-bold text-emerald-900">Overall Experience</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {renderStars(review.overall_experience_rating || review.rating, 'md')}
                    </div>
                    <span className="text-lg font-bold text-emerald-900">
                      {(review.overall_experience_rating || review.rating).toFixed(1)}
                    </span>
                  </div>
                </div>
                {review.overall_experience_review_text && (
                  <p className="text-sm text-emerald-900/80 italic leading-relaxed">
                    "{review.overall_experience_review_text}"
                  </p>
                )}
              </div>
            )}
            </CollapsibleContent>
          </Collapsible>

        {/* Setlist Display */}
        {(review as any).setlist && (
          <div className="mb-4">
            <SetlistDisplay setlist={(review as any).setlist} compact={true} type="api" />
          </div>
        )}

        {(review as any).custom_setlist && (review as any).custom_setlist.length > 0 && (
          <div className="mb-4">
            <SetlistDisplay customSetlist={(review as any).custom_setlist} compact={true} type="custom" />
          </div>
        )}

        {/* Artist & Venue Chips */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
          <div className="flex items-center flex-wrap gap-2">
            {review.artist_name && (
              <>
                <button
                  className={cn(
                    "px-3 py-1.5 rounded-full font-medium text-sm transition-all shadow-sm flex items-center gap-1.5",
                    followedArtists.includes(review.artist_name)
                      ? "bg-[#FF3399] text-white border-2 border-[#FF3399]"
                      : "bg-white border-2 border-[#FF3399]/30 hover:border-[#FF3399] hover:bg-[#FF3399]/5"
                  )}
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    const artistId = (review as any).artist_uuid || review.artist_id;
                    const ev = new CustomEvent('open-artist-card', { detail: { artistId, artistName: review.artist_name } });
                    document.dispatchEvent(ev);
                  }}
                  aria-label={`View artist ${review.artist_name}`}
                >
                  {followedArtists.includes(review.artist_name) && (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  )}
                  🎤 {followedArtists.includes(review.artist_name) ? 'Following Artist' : review.artist_name}
                </button>
                {currentUserId && (
                  <ArtistFollowButton
                    artistName={review.artist_name}
                    userId={currentUserId}
                    variant="outline"
                    size="sm"
                    showFollowerCount={false}
                    className="h-8 text-xs border-2"
                  />
                )}
              </>
            )}
            {review.venue_name && (
              <>
                <button
                  className={cn(
                    "px-3 py-1.5 rounded-full font-medium text-sm transition-all shadow-sm flex items-center gap-1.5",
                    followedVenues.some(v => 
                      v.name === review.venue_name && 
                      (!v.city || v.city === (review as any).venue_city) &&
                      (!v.state || v.state === (review as any).venue_state)
                    )
                      ? "bg-blue-600 text-white border-2 border-blue-600"
                      : "bg-white border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50"
                  )}
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    const venueId = (review as any).venue_uuid || review.venue_id;
                    const ev = new CustomEvent('open-venue-card', { detail: { venueId, venueName: review.venue_name } });
                    document.dispatchEvent(ev);
                  }}
                  aria-label={`View venue ${review.venue_name}`}
                >
                  {followedVenues.some(v => 
                    v.name === review.venue_name && 
                    (!v.city || v.city === (review as any).venue_city) &&
                    (!v.state || v.state === (review as any).venue_state)
                  ) && (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  )}
                  📍 {followedVenues.some(v => 
                    v.name === review.venue_name && 
                    (!v.city || v.city === (review as any).venue_city) &&
                    (!v.state || v.state === (review as any).venue_state)
                  ) ? 'Following Venue' : review.venue_name}
                </button>
                {currentUserId && (
                  <VenueFollowButton
                    venueName={review.venue_name}
                    venueCity={(review as any).venue_city}
                    venueState={(review as any).venue_state}
                    userId={currentUserId}
                    variant="outline"
                    size="sm"
                    showFollowerCount={false}
                    className="h-8 text-xs border-2"
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Social Actions - Enhanced with "Helpful" instead of Like */}
        <div className="flex items-center justify-between pt-3 pb-2 border-t-2">
          <div className="flex items-center gap-3">
            {/* Helpful Button (replaces Like) */}
            <Button
              variant="ghost"
              size="sm"
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLike(); }}
              disabled={!currentUserId || isLiking}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all",
                isLiked 
                  ? "bg-[#FF3399]/10 text-[#FF3399] hover:bg-[#FF3399]/20" 
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              )}
            >
              <ThumbsUp
                className={cn(
                  "h-5 w-5",
                  isLiked && "fill-current"
                )}
              />
              <span className="font-semibold">{likesCount}</span>
              <span className="hidden sm:inline">Helpful</span>
            </Button>

            {/* Comment Button */}
            <Button
              variant="ghost"
              size="sm"
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleComment(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium transition-all"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="font-semibold">{commentsCount}</span>
              <span className="hidden sm:inline">Comments</span>
            </Button>

            {/* Share Button */}
            <Button
              variant="ghost"
              size="sm"
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleShare(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium transition-all"
            >
              <Share2 className="h-5 w-5" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          </div>

          {/* Report Button - Only for other users' reviews */}
          {currentUserId && !isOwner && (
            <Button
              variant="ghost"
              size="sm"
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportModalOpen(true); }}
              className="rounded-full p-2 text-gray-500 hover:text-red-600 hover:bg-red-50"
              title="Report this review"
            >
              <Flag className="h-5 w-5" />
            </Button>
          )}
        </div>
      </CardContent>

      {/* Comments Section */}
      {showComments && (
        <div className="px-5 pb-3 pt-3 border-t-2">
          <div className="space-y-4">
            <h4 className="font-bold text-gray-900 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[#FF3399]" />
              Comments ({commentsCount})
            </h4>
            
            {loadingComments ? (
              <div className="flex items-center text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> 
                Loading comments…
              </div>
            ) : comments.length === 0 ? (
              <div className="text-sm text-gray-500 italic text-center py-4 bg-gray-50 rounded-lg">
                No comments yet. Be the first to comment!
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((c: any) => (
                  <div key={c.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={c.user?.avatar_url || undefined} alt={c.user?.name || 'User'} />
                      <AvatarFallback className="text-xs bg-gradient-to-br from-[#FF3399] to-[#FF66B3] text-white">
                        {(c.user?.name || 'U').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900">
                          {c.user?.name || 'User'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {c.comment_text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Add Comment Form */}
            <div className="flex items-end gap-2 mt-4">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={currentUserId ? 'Write a comment…' : 'Sign in to comment'}
                disabled={!currentUserId || submitting}
                className="min-h-[60px] border-2 focus:border-[#FF3399] rounded-lg"
              />
              <Button 
                onClick={handleAddComment} 
                disabled={!currentUserId || submitting || !newComment.trim()}
                className="bg-gradient-to-r from-[#FF3399] to-[#FF66B3] hover:from-[#FF66B3] hover:to-[#FF3399] text-white"
                size="lg"
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Image Viewer Modal */}
      {imageViewerOpen && photos.length > 0 && (
        <div 
          className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center" 
          onClick={closeImageViewer}
          role="dialog" 
          aria-modal="true"
        >
          <button 
            className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10" 
            aria-label="Close"
            onClick={(e) => { e.stopPropagation(); closeImageViewer(); }}
          >
            ×
          </button>
          {photos.length > 1 && (
            <>
              <button 
                className="absolute left-4 text-white/80 hover:text-white text-4xl w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10"
                aria-label="Previous image" 
                onClick={prevImage}
              >
                ‹
              </button>
              <button 
                className="absolute right-4 text-white/80 hover:text-white text-4xl w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10"
                aria-label="Next image" 
                onClick={nextImage}
              >
                ›
              </button>
            </>
          )}
          <div className="text-center">
            <img 
              src={photos[imageIndex]} 
              alt={`Review photo ${imageIndex + 1}`}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="text-white/70 mt-4 text-sm">
              {imageIndex + 1} / {photos.length}
            </p>
          </div>
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

