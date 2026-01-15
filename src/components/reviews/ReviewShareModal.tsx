import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { 
  MessageCircle, 
  Send, 
  Check,
  Search,
  X,
  Loader2,
  Share2,
  Star
} from 'lucide-react';
import { InAppShareService, type ShareTarget } from '@/services/inAppShareService';
import { ShareService } from '@/services/shareService';
import { ReviewService, ReviewWithEngagement } from '@/services/reviewService';
import { useToast } from '@/hooks/use-toast';

interface ReviewShareModalProps {
  review: ReviewWithEngagement;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
  onShareComplete?: () => void; // Callback to update local state after share
}

export function ReviewShareModal({
  review,
  currentUserId,
  isOpen,
  onClose,
  onShareComplete
}: ReviewShareModalProps) {
  const [chats, setChats] = useState<ShareTarget[]>([]);
  const [friends, setFriends] = useState<Array<{ user_id: string; name: string; avatar_url: string | null }>>([]);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [customMessage, setCustomMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showChatSelection, setShowChatSelection] = useState(false);
  const { toast } = useToast();

  const reviewTitle = review.artist_name 
    ? `${review.artist_name}${review.venue_name ? ` at ${review.venue_name}` : ''}`
    : review.venue_name || 'Concert Review';

  const handleExternalShare = async () => {
    try {
      const url = await ShareService.shareReview(review.id, 'PlusOne Review', review.review_text || undefined);
      
      // Try native share first
      if (navigator.share) {
        await navigator.share({
          title: `Review: ${reviewTitle}`,
          text: review.review_text || 'Check out this concert review!',
          url: url
        });
        toast({
          title: "Shared!",
          description: "Review shared successfully",
        });
      } else {
        // Fallback to copy link
        await navigator.clipboard.writeText(url);
        toast({
          title: "Link Copied!",
          description: "Review link copied to clipboard",
        });
      }
    } catch (error: any) {
      // User cancelled or error occurred
      if (error.name !== 'AbortError') {
        console.error('Error sharing externally:', error);
        toast({
          title: "Error",
          description: "Failed to share review",
          variant: "destructive"
        });
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadShareTargets();
      loadFriends();
      // Reset chat selection state when modal opens
      setShowChatSelection(false);
    }
  }, [isOpen, currentUserId]);

  const loadShareTargets = async () => {
    try {
      setLoading(true);
      const targets = await InAppShareService.getShareTargets(currentUserId);
      setChats(targets);
    } catch (error) {
      console.error('Error loading share targets:', error);
      toast({
        title: "Error",
        description: "Failed to load chats",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadFriends = async () => {
    try {
      const friendsList = await InAppShareService.getFriends(currentUserId);
      setFriends(friendsList);
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  const toggleChatSelection = (chatId: string) => {
    setSelectedChats(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chatId)) {
        newSet.delete(chatId);
      } else {
        newSet.add(chatId);
      }
      return newSet;
    });
  };

  const handleShareToExistingChats = async () => {
    if (selectedChats.size === 0) {
      toast({
        title: "No chats selected",
        description: "Please select at least one chat to share with",
        variant: "destructive"
      });
      return;
    }

    try {
      setSharing(true);
      
      // Separate group chats and friend chats
      const selectedChatsArray = Array.from(selectedChats);
      const groupChatIds = selectedChatsArray.filter(id => !id.startsWith('friend-'));
      const friendIds = selectedChatsArray
        .filter(id => id.startsWith('friend-'))
        .map(id => id.replace('friend-', ''));

      let result = { successCount: 0, errors: [] };

      // Share to existing group chats
      if (groupChatIds.length > 0) {
        const groupResult = await InAppShareService.shareReviewToMultipleChats(
          review.id,
          groupChatIds,
          currentUserId,
          customMessage || undefined
        );
        result.successCount += groupResult.successCount;
        result.errors.push(...groupResult.results.filter(r => !r.success).map(r => r.error || 'Unknown error'));
      }

      // Share to friends (create new direct message chats)
      for (const friendId of friendIds) {
        try {
          const friendResult = await InAppShareService.shareReviewToNewChat(
            review.id,
            friendId,
            currentUserId,
            customMessage || undefined
          );
          if (friendResult.success) {
            result.successCount += 1;
          } else {
            result.errors.push(friendResult.error || 'Failed to share with friend');
          }
        } catch (error) {
          result.errors.push(`Failed to share with friend: ${error}`);
        }
      }

      if (result.successCount > 0) {
        // Record the share in the database for analytics and count tracking
        try {
          await ReviewService.shareReview(currentUserId, review.id, 'in_app_chat');
          // Notify parent component to update local shares count
          if (onShareComplete) {
            onShareComplete();
          }
        } catch (shareError) {
          // Don't fail the share if analytics tracking fails
          console.warn('Failed to record share in analytics (non-critical):', shareError);
        }
        
        toast({
          title: "Review Shared! 🎉",
          description: `Successfully shared to ${result.successCount} chat${result.successCount > 1 ? 's' : ''}`,
        });
        
        // Reset and close
        setSelectedChats(new Set());
        setCustomMessage('');
        onClose();
      }

      if (result.errors.length > 0) {
        toast({
          title: "Partial Success",
          description: `${result.errors.length} share${result.errors.length > 1 ? 's' : ''} failed`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error sharing review:', error);
      toast({
        title: "Error",
        description: "Failed to share review",
        variant: "destructive"
      });
    } finally {
      setSharing(false);
    }
  };

  const filteredChats = chats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    !chat.name.toLowerCase().includes('direct chat') &&
    !chat.name.toLowerCase().includes('dc direct')
  );

  const filteredFriends = friends.filter(friend =>
    friend.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Combine group chats and friend chats into one unified list
  const allChats = [
    ...filteredChats.map(chat => ({
      ...chat,
      type: 'group',
      isGroup: true
    })),
    ...filteredFriends.map(friend => ({
      id: `friend-${friend.user_id}`,
      name: friend.name,
      avatar_url: friend.avatar_url,
      type: 'friend',
      isGroup: false,
      user_id: friend.user_id
    }))
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Share Review</DialogTitle>
          <DialogDescription>
            Share "{reviewTitle}" with your friends
          </DialogDescription>
        </DialogHeader>

        {/* Review Preview */}
        <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-3 border border-pink-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${
                    i < (review.rating || 0)
                      ? 'fill-pink-500 text-pink-500'
                      : 'text-gray-300'
                  }`}
                />
              ))}
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">{reviewTitle}</h3>
          </div>
          {review.review_text && (
            <p className="text-xs text-gray-600 line-clamp-2">{review.review_text}</p>
          )}
        </div>

        {/* Share Options - Side by Side */}
        <div className="grid grid-cols-2 gap-3">
          {/* External Share Button */}
          <Button
            onClick={handleExternalShare}
            variant="outline"
            className="h-auto py-4 border-pink-200 hover:bg-pink-50 flex flex-col items-center gap-2"
          >
            <Share2 className="w-6 h-6 text-pink-500" />
            <span className="text-sm font-medium">Share Externally</span>
            <span className="text-xs text-gray-500">Phone, Apps, etc.</span>
          </Button>

          {/* Share in Chat Button - Toggles chat selection */}
          <Button
            onClick={() => {
              setShowChatSelection(!showChatSelection);
              if (!showChatSelection && chats.length === 0 && friends.length === 0 && !loading) {
                loadShareTargets();
                loadFriends();
              }
            }}
            variant={showChatSelection ? "default" : "outline"}
            className={`h-auto py-4 border-pink-200 flex flex-col items-center gap-2 ${
              showChatSelection 
                ? 'bg-pink-500 hover:bg-pink-600 text-white border-pink-500' 
                : 'hover:bg-pink-50'
            }`}
          >
            <MessageCircle className={`w-6 h-6 ${showChatSelection ? 'text-white' : 'text-pink-500'}`} />
            <span className="text-sm font-medium">Share in Chat</span>
            <span className={`text-xs ${showChatSelection ? 'text-pink-100' : 'text-gray-500'}`}>Within Synth</span>
          </Button>
        </div>

        {/* Chat Selection Section - Expandable */}
        {showChatSelection && (
          <>
            {/* Custom Message */}
            <div className="space-y-1 mt-4 border-t pt-4">
              <label className="text-xs font-medium text-gray-600">
                Add a message (optional)
              </label>
              <Textarea
                placeholder="Check out this review! 🎵"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={1}
                className="resize-none text-sm"
              />
            </div>

            <div className="flex-1 flex flex-col overflow-hidden mt-4">
              <div className="flex items-center gap-2 mb-3">
                <MessageCircle className="w-5 h-5 text-pink-500" />
                <h3 className="font-semibold text-gray-900">Choose Chats</h3>
              </div>

              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
              </div>
            ) : allChats.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No chats found</p>
                <p className="text-sm">Start a conversation to share reviews</p>
              </div>
            ) : (
              allChats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => toggleChatSelection(chat.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                    selectedChats.has(chat.id)
                      ? 'bg-pink-50 border-2 border-pink-300'
                      : 'bg-white border border-gray-200 hover:border-pink-200'
                  }`}
                >
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={chat.avatar_url || undefined} />
                    <AvatarFallback>
                      {chat.isGroup ? (
                        <MessageCircle className="w-5 h-5" />
                      ) : (
                        chat.name.split(' ').map(n => n[0]).join('')
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{chat.name}</h4>
                    <p className="text-xs text-gray-500">
                      {chat.isGroup ? `${(chat as any).users?.length || (chat as any).member_count || 0} members` : 'Direct message'}
                    </p>
                  </div>
                  {selectedChats.has(chat.id) && (
                    <div className="w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="mt-4 pt-4 border-t flex gap-2">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleShareToExistingChats}
              disabled={selectedChats.size === 0 || sharing}
              className="flex-1 bg-pink-500 hover:bg-pink-600 text-white"
            >
              {sharing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sharing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Share ({selectedChats.size})
                </>
              )}
            </Button>
            </div>
          </div>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}

