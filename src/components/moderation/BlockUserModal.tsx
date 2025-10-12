/**
 * Block User Modal
 * Allows users to block/unblock other users
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Ban, Loader2, UserX, AlertCircle } from 'lucide-react';
import ContentModerationService from '@/services/contentModerationService';

interface BlockUserModalProps {
  open: boolean;
  onClose: () => void;
  user: {
    id: string;
    name: string;
    avatar_url?: string;
  };
  isBlocked?: boolean;
  onBlockToggled?: () => void;
}

export function BlockUserModal({
  open,
  onClose,
  user,
  isBlocked = false,
  onBlockToggled,
}: BlockUserModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  const handleToggleBlock = async () => {
    setIsSubmitting(true);

    try {
      if (isBlocked) {
        // Unblock user
        await ContentModerationService.unblockUser(user.id);
        
        toast({
          title: 'User Unblocked',
          description: `You can now see content from ${user.name}`,
        });
      } else {
        // Block user
        await ContentModerationService.blockUser({
          blocked_user_id: user.id,
          block_reason: blockReason.trim() || undefined,
        });

        toast({
          title: 'User Blocked',
          description: `You won't see content from ${user.name} anymore`,
        });
      }

      onBlockToggled?.();
      handleClose();
    } catch (error) {
      console.error('Error toggling block:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to update block status',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setBlockReason('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isBlocked ? (
              <>
                <UserX className="h-5 w-5 text-gray-600" />
                Unblock User
              </>
            ) : (
              <>
                <Ban className="h-5 w-5 text-red-600" />
                Block User
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isBlocked
              ? 'You will start seeing content from this user again'
              : 'You won\'t see content from this user anymore'}
          </DialogDescription>
        </DialogHeader>

        {/* User Info */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 flex items-center gap-3">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
              <span className="text-purple-600 font-semibold text-lg">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <p className="font-semibold">{user.name}</p>
            <p className="text-sm text-gray-600">
              {isBlocked ? 'Currently blocked' : 'Will be blocked'}
            </p>
          </div>
        </div>

        {!isBlocked && (
          <>
            {/* Reason (optional) */}
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for blocking (Optional, for your reference)</Label>
              <Textarea
                id="reason"
                placeholder="Why are you blocking this user?"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                disabled={isSubmitting}
                rows={3}
              />
            </div>

            {/* What happens info */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-900">
                <p className="font-medium mb-1">When you block someone:</p>
                <ul className="text-xs space-y-1 list-disc list-inside">
                  <li>You won't see their events, reviews, or comments</li>
                  <li>They won't be able to see your content</li>
                  <li>They won't be notified that you blocked them</li>
                  <li>You can unblock them at any time</li>
                </ul>
              </div>
            </div>
          </>
        )}

        {isBlocked && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-medium mb-1">When you unblock someone:</p>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li>You'll start seeing their content again</li>
                <li>They'll be able to see your content</li>
                <li>You can interact with each other normally</li>
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleToggleBlock}
            variant={isBlocked ? 'default' : 'destructive'}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isBlocked ? 'Unblocking...' : 'Blocking...'}
              </>
            ) : (
              <>
                {isBlocked ? (
                  <>
                    <UserX className="w-4 h-4 mr-2" />
                    Unblock User
                  </>
                ) : (
                  <>
                    <Ban className="w-4 h-4 mr-2" />
                    Block User
                  </>
                )}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BlockUserModal;

