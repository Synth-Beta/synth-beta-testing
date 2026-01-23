import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Eye, UserPlus, MessageCircle, UserMinus, User } from 'lucide-react';

interface Friend {
  id: string;
  user_id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
}

interface FollowersModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'followers' | 'following' | 'friends';
  friends: Friend[];
  count: number;
  onStartChat?: (friendId: string) => void;
  onViewProfile?: (friend: Friend) => void;
  onUnfriend?: (friendUserId: string) => Promise<void>;
}

export const FollowersModal = ({
  isOpen,
  onClose,
  type,
  friends,
  count,
  onStartChat,
  onViewProfile,
  onUnfriend
}: FollowersModalProps) => {
  const title = type === 'friends' ? 'Friends' : type === 'followers' ? 'Followers' : 'Following';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-lg w-[95vw] max-h-[80vh] flex flex-col" 
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-center">{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="space-y-2 py-2">
            {friends.length === 0 ? (
              <div className="text-center py-8">
                <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {type === 'friends' ? 'No friends yet' : type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                </p>
              </div>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center gap-3 hover:bg-muted/40 rounded-lg p-3 transition-colors mx-2"
                >
                  <Avatar className="w-10 h-10 flex-shrink-0">
                    <AvatarImage src={friend.avatar_url || undefined} />
                    <AvatarFallback className="text-sm">
                      {friend.name ? friend.name.split(' ').map(n => n[0]).join('') : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div 
                    className="flex-1 min-w-0 mr-2 cursor-pointer" 
                    onClick={() => onViewProfile && onViewProfile(friend)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && onViewProfile) {
                        e.preventDefault();
                        onViewProfile(friend);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`View profile: ${friend.name}`}
                  >
                    <p className="font-semibold text-sm truncate">{friend.name}</p>
                    <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                    {friend.bio && (
                      <p className="text-xs text-muted-foreground truncate mt-1">{friend.bio}</p>
                    )}
                  </div>
                  
                  <div className="flex gap-1 flex-shrink-0">
                    {onViewProfile && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 hover:bg-gray-100"
                        onClick={(e) => { e.stopPropagation(); onViewProfile(friend); }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                    {onStartChat && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 hover:bg-gray-100"
                        onClick={(e) => { e.stopPropagation(); onStartChat(friend.user_id); }}
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {onUnfriend && type === 'friends' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={async (e) => { 
                          e.stopPropagation(); 
                          try {
                            await onUnfriend(friend.user_id);
                          } catch (error) {
                            console.error('Error unfriending user:', error);
                          }
                        }}
                      >
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
