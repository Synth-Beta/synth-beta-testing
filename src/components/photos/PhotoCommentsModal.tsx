/**
 * Photo Comments Modal
 * View and add comments on event photos
 */

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import EventPhotoService, { EventPhoto, PhotoComment } from '@/services/eventPhotoService';

interface PhotoCommentsModalProps {
  open: boolean;
  onClose: () => void;
  photo: EventPhoto;
  onCommentAdded?: () => void;
}

export function PhotoCommentsModal({
  open,
  onClose,
  photo,
  onCommentAdded,
}: PhotoCommentsModalProps) {
  const { toast } = useToast();
  const [comments, setComments] = useState<PhotoComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      loadComments();
    }
  }, [open, photo.id]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const commentsData = await EventPhotoService.getPhotoComments(photo.id);
      setComments(commentsData);
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const comment = await EventPhotoService.addComment(photo.id, newComment);
      setComments((prev) => [...prev, comment]);
      setNewComment('');
      onCommentAdded?.();
    } catch (error) {
      console.error('Error adding comment:', error);
      toast({
        title: 'Error',
        description: 'Failed to add comment',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Comments
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Photo Preview */}
          <img
            src={photo.photo_url}
            alt={photo.caption || 'Event photo'}
            className="w-full max-h-64 object-contain rounded-lg mb-4"
          />

          {photo.caption && (
            <div className="mb-4 pb-4 border-b">
              <div className="flex items-center gap-2 mb-2">
                {photo.user_avatar_url && (
                  <img
                    src={photo.user_avatar_url}
                    alt={photo.user_name}
                    className="w-6 h-6 rounded-full"
                  />
                )}
                <span className="font-semibold text-sm">{photo.user_name}</span>
              </div>
              <p className="text-sm">{photo.caption}</p>
            </div>
          )}

          {/* Comments List */}
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8">
                <MessageCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 text-sm">No comments yet</p>
                <p className="text-xs text-gray-500 mt-1">Be the first to comment!</p>
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  {comment.user_avatar_url ? (
                    <img
                      src={comment.user_avatar_url}
                      alt={comment.user_name}
                      className="w-8 h-8 rounded-full flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-purple-600 font-semibold text-xs">
                        {comment.user_name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="bg-gray-100 rounded-lg p-3">
                      <p className="font-semibold text-sm">{comment.user_name}</p>
                      <p className="text-sm mt-1">{comment.comment}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(comment.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Add Comment Form */}
        <form onSubmit={handleSubmit} className="flex gap-2 pt-4 border-t mt-4">
          <Input
            placeholder="Add a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            disabled={isSubmitting}
            maxLength={500}
          />
          <Button type="submit" disabled={isSubmitting || !newComment.trim()}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default PhotoCommentsModal;

