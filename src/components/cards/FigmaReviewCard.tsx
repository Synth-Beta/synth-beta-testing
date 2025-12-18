import React from 'react';
import { Star, Music, MapPin, Heart, MessageCircle, Share2, User } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface FigmaReviewCardProps {
  review: {
    id: string;
    user_id: string;
    user_name: string;
    user_avatar?: string | null;
    created_at: string;
    artist_name?: string;
    venue_name?: string;
    rating: number;
    review_text?: string;
    likes_count?: number;
    comments_count?: number;
  };
  isLiked?: boolean;
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onOpenArtist?: (artistName: string) => void;
  onOpenVenue?: (venueName: string) => void;
  onClick?: () => void;
  className?: string;
}

export const FigmaReviewCard: React.FC<FigmaReviewCardProps> = ({
  review,
  isLiked = false,
  onLike,
  onComment,
  onShare,
  onOpenArtist,
  onOpenVenue,
  onClick,
  className,
}) => {
  const timeAgo = review.created_at
    ? formatDistanceToNow(new Date(review.created_at), { addSuffix: true })
    : 'Recently';

  const eventTitle = review.artist_name
    ? `${review.artist_name}${review.venue_name ? ` at ${review.venue_name}` : ''}`
    : review.venue_name || 'Concert';

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }).map((_, i) => (
      <Star
        key={i}
        className={cn(
          'size-4',
          i < Math.floor(rating)
            ? 'fill-[#cc2486] text-[#cc2486]'
            : 'text-gray-300'
        )}
        strokeWidth={1}
      />
    ));
  };

  return (
    <div
      className={cn(
        'bg-[#fcfcfc] border-2 border-[#5d646f] rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] cursor-pointer overflow-hidden relative p-4',
        className
      )}
      onClick={onClick}
      style={{ boxShadow: 'inset 0px 4px 4px 0px rgba(0,0,0,0.25)' }}
    >
      {/* Review Title */}
      <p className="font-['Inter',sans-serif] font-bold leading-normal not-italic text-[#0e0e0e] text-[16px] mb-4">
        {eventTitle}
      </p>

      {/* Information Section */}
      <div className="flex gap-3 mb-4">
        {/* Icons Column */}
        <div className="flex flex-col gap-[11px] items-center justify-start pt-1">
          <User className="size-[24px] text-[#b00056]" strokeWidth={2} />
          <Star className="size-[24px] text-[#b00056]" strokeWidth={2} />
          <MessageCircle className="size-[24px] text-[#b00056]" strokeWidth={2} />
        </div>

        {/* Text Column */}
        <div className="flex flex-col font-['Inter',sans-serif] font-normal gap-4 items-start justify-start leading-normal not-italic text-[16px] text-[#0e0e0e] flex-1">
          <div className="flex items-center gap-2">
            <Avatar className="size-6">
              <AvatarImage src={review.user_avatar || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-[#cc2486] to-[#8d1ff4] text-white text-xs">
                {review.user_name[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <p>
              {review.user_name}
              {timeAgo && (
                <>
                  {' · '}
                  <span className="text-[#5d646f]">{timeAgo}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {renderStars(review.rating)}
            </div>
            <span className="text-[#5d646f]">{review.rating.toFixed(1)}</span>
          </div>
          {review.review_text && (
            <p className="text-[#5d646f] line-clamp-2">
              {review.review_text}
            </p>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="bg-[#5d646f] h-px w-full mb-4" />

      {/* Buttons Section */}
      <div className="flex gap-6 items-center justify-center">
        {/* Like Button */}
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onLike?.();
          }}
          className={cn(
            'bg-[#fcfcfc] border-2 border-[#b00056] flex gap-3 h-9 items-center justify-center px-3 rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]',
            isLiked && 'bg-[#b00056]'
          )}
        >
          <Heart
            className={cn(
              'size-6',
              isLiked ? 'fill-white text-white' : 'text-[#b00056]'
            )}
            strokeWidth={2}
          />
          <span className={cn(
            'font-["Inter",sans-serif] font-normal leading-normal not-italic text-[16px]',
            isLiked ? 'text-white' : 'text-[#b00056]'
          )}>
            {review.likes_count || 0}
          </span>
        </Button>

        {/* Comments */}
        <div
          className="flex gap-2 items-center justify-center cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onComment?.();
          }}
        >
          <MessageCircle className="size-6 text-[#5d646f]" strokeWidth={2} />
          <span className="font-['Inter',sans-serif] font-normal leading-normal not-italic text-[16px] text-[#0e0e0e]">
            {review.comments_count || 0}
          </span>
        </div>

        {/* Share */}
        <div
          className="flex gap-2 items-center justify-center cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onShare?.();
          }}
        >
          <Share2 className="w-[18px] h-[22px] text-[#5d646f]" strokeWidth={2} />
          <span className="font-['Inter',sans-serif] font-normal leading-normal not-italic text-[16px] text-[#0e0e0e]">
            Share
          </span>
        </div>
      </div>
    </div>
  );
};

