import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, Share2, MoreHorizontal, Star, Edit, Trash2, Flag } from 'lucide-react';
import { ReportContentModal } from '@/components/moderation/ReportContentModal';
import { cn } from '@/lib/utils';
import { PublicReviewWithProfile, ReviewService } from '@/services/reviewService';
import { formatDistanceToNow } from 'date-fns';

interface PublicReviewCardProps {
  review: PublicReviewWithProfile;
  currentUserId?: string;
  onLike?: (reviewId: string, isLiked: boolean) => void;
  onComment?: (reviewId: string) => void;
  onShare?: (reviewId: string) => void;
  onEdit?: (review: PublicReviewWithProfile) => void;
  onDelete?: (reviewId: string) => void;
}

export function PublicReviewCard({
  review,
  currentUserId,
  onLike,
  onComment,
  onShare,
  onEdit,
  onDelete,
  onReport
}: PublicReviewCardProps) {
  const [isLiked, setIsLiked] = useState(false); // Would need to check if user liked this review
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
              <AvatarImage src={review.reviewer_avatar || undefined} />
              <AvatarFallback>
                {review.reviewer_name?.slice(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {review.reviewer_name}
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

      <CardContent className="pt-0">
        {/* Event Info */}
        <div className="mb-3 p-3 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-sm text-gray-900">{review.event_title}</h4>
          <p className="text-xs text-gray-600">{review.artist_name} at {review.venue_name}</p>
          <p className="text-xs text-gray-500">
            {new Date(review.event_date).toLocaleDateString()}
          </p>
        </div>

        {/* Review Text */}
        {review.review_text && (
          <p className="text-sm text-gray-700 mb-3">{review.review_text}</p>
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

            {/* Report Button - Only show for other users' reviews */}
            {currentUserId && !isOwner && (
              <Button
                variant="ghost"
                size="sm"
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
