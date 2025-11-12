import { Star, Heart, MessageSquare, Share2, MapPin } from 'lucide-react';
import { ImageWithFallback } from '@/components/figma/ImageWithFallback';
import { ReviewWithEngagement } from '@/services/reviewService';
import { formatDistanceToNow } from 'date-fns';

interface ReviewCardProps {
  review: ReviewWithEngagement;
  userProfile?: {
    name: string;
    avatar_url?: string;
    verified?: boolean;
    account_type?: string;
  };
  isLiked: boolean;
  onLike: (reviewId: string) => void;
  onComment?: (reviewId: string) => void;
  onShare?: (reviewId: string) => void;
  onOpenReviewDetail?: (review: ReviewWithEngagement) => void;
  onOpenArtist?: (artistId: string, artistName: string) => void;
  onOpenVenue?: (venueId: string, venueName: string) => void;
}

export function ReviewCard({
  review,
  userProfile,
  isLiked,
  onLike,
  onComment,
  onShare,
  onOpenReviewDetail,
  onOpenArtist,
  onOpenVenue,
}: ReviewCardProps) {
  const userName = userProfile?.name || 'User';
  const userAvatar = userProfile?.avatar_url || '';
  const rating = review.rating || 0;
  const eventTitle = review.artist_name 
    ? `${review.artist_name}${review.venue_name ? ` at ${review.venue_name}` : ''}`
    : review.venue_name || 'Concert';
  const venue = review.venue_name || '';
  const reviewText = review.review_text || '';
  const image = review.photos && review.photos.length > 0 ? review.photos[0] : undefined;
  const likes = review.likes_count || 0;
  const comments = review.comments_count || 0;
  const timeAgo = review.created_at 
    ? formatDistanceToNow(new Date(review.created_at), { addSuffix: true })
    : 'Recently';

  const handleLike = () => {
    onLike(review.id);
  };

  const handleComment = () => {
    if (onComment) {
      onComment(review.id);
    }
  };

  const handleShare = () => {
    if (onShare) {
      onShare(review.id);
    }
  };

  const handleCardClick = () => {
    if (onOpenReviewDetail) {
      onOpenReviewDetail(review);
    }
  };

  const handleArtistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenArtist && review.artist_id && review.artist_name) {
      onOpenArtist(review.artist_id, review.artist_name);
    }
  };

  const handleVenueClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenVenue && review.venue_id && review.venue_name) {
      onOpenVenue(review.venue_id, review.venue_name);
    }
  };

  const artistId = (review as any).artist_id;
  const venueId = (review as any).venue_id;
      
  return (
    <div 
      className={`bg-white/70 backdrop-blur-md rounded-3xl overflow-hidden shadow-lg border border-white/50 ${onOpenReviewDetail ? 'cursor-pointer' : ''}`}
      onClick={handleCardClick}
    >
      {/* User Header */}
      <div className="p-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {userAvatar ? (
              <img
                src={userAvatar}
                alt={userName}
                className="w-12 h-12 rounded-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className={`w-12 h-12 rounded-full bg-gradient-to-br from-[#FF3399] to-pink-600 flex items-center justify-center shadow-lg ${userAvatar ? 'hidden' : ''}`}
            >
              <span className="text-white font-bold text-sm">
                {userName.split(' ').map(n => n[0]).join('')}
              </span>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">{userName}</h4>
              <p className="text-xs text-gray-500">{timeAgo}</p>
            </div>
          </div>

          {/* Star Rating */}
          <div className="flex items-center gap-1 bg-[#F5F5DC] px-3 py-1.5 rounded-full">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`w-4 h-4 ${
                  i < rating
                    ? 'fill-[#FF3399] text-[#FF3399]'
                    : 'text-gray-300'
                }`}
              />
            ))}
          </div>
        </div>
        {/* Event Info */}
        <div className="mb-3">
          <h3 className="font-bold text-gray-900 mb-1">
            {review.artist_name ? (
              <span>
                {onOpenArtist && artistId ? (
                  <button
                    onClick={handleArtistClick}
                    className="hover:text-[#FF3399] transition-colors underline"
                  >
                    {review.artist_name}
                  </button>
                ) : (
                  <span>{review.artist_name}</span>
                )}
                {review.venue_name && ' at '}
                {review.venue_name && onOpenVenue && venueId ? (
                  <button
                    onClick={handleVenueClick}
                    className="hover:text-[#FF3399] transition-colors underline"
                  >
                    {review.venue_name}
                  </button>
                ) : review.venue_name ? (
                  <span>{review.venue_name}</span>
                ) : null}
              </span>
            ) : (
              eventTitle
            )}
          </h3>
          {venue && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-[#FF3399]" />
              {onOpenVenue && venueId ? (
                <button
                  onClick={handleVenueClick}
                  className="hover:text-[#FF3399] transition-colors underline"
                >
                  {venue}
                </button>
              ) : (
                <span>{venue}</span>
              )}
            </div>
          )}
        </div>
        {/* Review Text */}
        {reviewText && (
          <p className="text-sm text-gray-700 leading-relaxed mb-4">
            {reviewText}
          </p>
                )}
              </div>
      {/* Review Image (if exists) */}
      {image && (
        <div className="px-5 pb-4" onClick={(e) => e.stopPropagation()}>
          <div className="relative h-40 rounded-2xl overflow-hidden">
            <ImageWithFallback
              src={image}
              alt={eventTitle}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}
      {/* Action Bar */}
      <div className="flex items-center justify-between px-5 pb-5 pt-2 border-t border-gray-100 mx-5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleLike}
          className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-pink-50 active:scale-95 transition-all"
        >
              <Heart
            className={`w-5 h-5 transition-all ${
              isLiked
                ? 'fill-[#FF3399] text-[#FF3399] scale-110'
                : 'text-gray-400'
            }`}
          />
          <span
            className={`text-sm font-semibold ${
              isLiked ? 'text-[#FF3399]' : 'text-gray-600'
            }`}
          >
            {likes}
          </span>
        </button>

        <button
          onClick={handleComment}
          className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-50 active:scale-95 transition-all"
        >
          <MessageSquare className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-semibold text-gray-600">{comments}</span>
        </button>

        <button 
          onClick={handleShare}
          className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-50 active:scale-95 transition-all"
        >
          <Share2 className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-semibold text-gray-600">Share</span>
        </button>
      </div>
    </div>
  );
}
