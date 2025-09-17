import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, Share2, MoreHorizontal, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewWithEngagement, ReviewService } from '@/services/reviewService';
import { formatDistanceToNow } from 'date-fns';

interface ReviewCardProps {
  review: ReviewWithEngagement;
  currentUserId?: string;
  onLike?: (reviewId: string, isLiked: boolean) => void;
  onComment?: (reviewId: string) => void;
  onShare?: (reviewId: string) => void;
  showEventInfo?: boolean;
}

export function ReviewCard({
  review,
  currentUserId,
  onLike,
  onComment,
  onShare,
  showEventInfo = false
}: ReviewCardProps) {
  const [isLiked, setIsLiked] = useState(review.is_liked_by_user || false);
  const [likesCount, setLikesCount] = useState(review.likes_count);
  const [isLiking, setIsLiking] = useState(false);

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
      
      if (onLike) {
        onLike(review.id, !isLiked);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    } finally {
      setIsLiking(false);
    }
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

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={cn(
          "w-4 h-4",
          i < rating ? "text-yellow-400 fill-current" : "text-gray-300"
        )}
      />
    ));
  };


  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={undefined} />
              <AvatarFallback>
                {review.user_id?.slice(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                User {review.user_id?.slice(0, 8)}
              </p>
              <div className="flex items-center space-x-2">
                <div className="flex items-center">
                  {renderStars(review.rating)}
                </div>
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Review Text */}
        {review.review_text && (
          <p className="text-sm text-gray-700 mb-3">{review.review_text}</p>
        )}

        {/* Event Info (if showEventInfo is true) */}
        {showEventInfo && (
          <div className="mb-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-900">Event Information</p>
            <p className="text-xs text-gray-600">Event details would be shown here</p>
          </div>
        )}

        {/* Social Actions */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLike}
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
              onClick={handleComment}
              className="flex items-center space-x-1"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="text-sm">{review.comments_count}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleShare}
              className="flex items-center space-x-1"
            >
              <Share2 className="h-4 w-4" />
              <span className="text-sm">{review.shares_count}</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
