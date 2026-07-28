import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, UserPlus, MessageCircle } from 'lucide-react';

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
}

export const FollowersModal = ({
  isOpen,
  onClose,
  type,
  friends,
  count,
  onStartChat,
  onViewProfile
}: FollowersModalProps) => {
  const title = type === 'friends' ? 'Friends' : type === 'followers' ? 'Followers' : 'Following';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-96">
          <div className="space-y-3 p-4">
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
                  className="flex items-center gap-3 cursor-pointer hover:bg-muted/40 rounded-md p-2"
                  onClick={() => onViewProfile && onViewProfile(friend)}
                >
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={friend.avatar_url || undefined} />
                    <AvatarFallback>
                      {friend.name ? friend.name.split(' ').map(n => n[0]).join('') : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{friend.name}</p>
                    <p className="text-sm text-muted-foreground truncate">@{friend.username}</p>
                    {friend.bio && (
                      <p className="text-xs text-muted-foreground truncate">{friend.bio}</p>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    {onViewProfile && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); onViewProfile(friend); }}
                      >
                        <User className="w-4 h-4" />
                      </Button>
                    )}
                    {onStartChat && (
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); onStartChat(friend.user_id); }}
                      >
                        <MessageCircle className="w-4 h-4" />
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
