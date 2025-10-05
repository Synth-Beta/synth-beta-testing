import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  MessageCircle, 
  Calendar, 
  MapPin, 
  Music, 
  X,
  Star,
  Heart,
  UserMinus
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface FriendProfileCardProps {
  friend: {
    id: string;
    name: string;
    username: string;
    avatar_url?: string;
    bio?: string;
    user_id: string;
    created_at: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onStartChat?: (friendId: string) => void;
  onUnfriend?: (friendUserId: string) => Promise<void>;
}

export const FriendProfileCard: React.FC<FriendProfileCardProps> = ({
  friend,
  isOpen,
  onClose,
  onStartChat,
  onUnfriend
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
      style={{ zIndex: 10000 }}
      onClick={onClose}
    >
      <Card 
        className="w-full max-w-md max-h-[90vh] overflow-y-auto cursor-pointer"
        onClick={onClose}
      >
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold">Profile</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Profile Header */}
          <div className="text-center">
            <Avatar className="w-24 h-24 mx-auto mb-4">
              <AvatarImage src={friend.avatar_url || undefined} />
              <AvatarFallback className="text-2xl">
                {friend.name ? friend.name.split(' ').map(n => n[0]).join('') : 'F'}
              </AvatarFallback>
            </Avatar>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{friend.name}</h2>
            <p className="text-gray-600 mb-2">@{friend.username}</p>
            
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              <User className="w-3 h-3 mr-1" />
              Friend
            </Badge>
          </div>

          {/* Bio Section */}
          {friend.bio && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">About</h3>
              <p className="text-gray-700 text-sm leading-relaxed">{friend.bio}</p>
            </div>
          )}

          {/* Member Since */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="w-4 h-4" />
            <span>Member since {(() => {
              try {
                return format(parseISO(friend.created_at), 'MMMM yyyy');
              } catch {
                return friend.created_at;
              }
            })()}</span>
          </div>

          {/* Music Preferences Placeholder */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Music Preferences</h3>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                <Music className="w-3 h-3 mr-1" />
                Concert Lover
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Heart className="w-3 h-3 mr-1" />
                Live Music
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Star className="w-3 h-3 mr-1" />
                Music Enthusiast
              </Badge>
            </div>
          </div>

          {/* Recent Activity Placeholder */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Recent Activity</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Active now</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Music className="w-4 h-4" />
                <span>Recently reviewed a concert</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pt-4 border-t">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  console.log('View full profile for:', friend.name);
                  // Emit custom event to navigate to friend's profile
                  const event = new CustomEvent('open-user-profile', {
                    detail: { userId: friend.user_id }
                  });
                  window.dispatchEvent(event);
                  onClose(); // Close the modal
                }}
              >
                <User className="w-4 h-4 mr-2" />
                Full Profile
              </Button>
              <Button
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                onClick={() => {
                  if (onStartChat) {
                    onStartChat(friend.user_id);
                  }
                  onClose();
                }}
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Start Chat
              </Button>
            </div>
            
            {/* Unfriend Button */}
            {onUnfriend && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={async () => {
                  try {
                    await onUnfriend(friend.user_id);
                    onClose(); // Close the modal after unfriending
                  } catch (error) {
                    console.error('Error unfriending user:', error);
                    // Don't close modal on error, let the parent handle the error
                  }
                }}
              >
                <UserMinus className="w-4 h-4 mr-2" />
                Unfriend
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
