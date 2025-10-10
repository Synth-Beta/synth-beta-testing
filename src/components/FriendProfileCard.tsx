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
  UserMinus,
  Clock
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { UserVisibilityService } from '@/services/userVisibilityService';

interface FriendProfileCardProps {
  friend: {
    id: string;
    name: string;
    username: string;
    avatar_url?: string;
    bio?: string;
    user_id: string;
    created_at: string;
    last_active_at?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onStartChat?: (friendId: string) => void;
  onAddFriend?: (friendUserId: string) => Promise<void> | void;
  onUnfriend?: (friendUserId: string) => Promise<void>;
  onNavigateToProfile?: (userId: string) => void;
}

export const FriendProfileCard: React.FC<FriendProfileCardProps> = ({
  friend,
  isOpen,
  onClose,
  onStartChat,
  onAddFriend,
  onUnfriend,
  onNavigateToProfile
}) => {
  if (!isOpen) return null;
  
  // Debug: Check if navigation handlers are provided

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
      <Card className="w-full max-w-md max-h-[80vh] overflow-y-auto">
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
        
        <CardContent className="space-y-4">
          {/* Profile Header */}
          <div className="text-center">
            <Avatar className="w-20 h-20 mx-auto mb-3">
              <AvatarImage src={friend.avatar_url || undefined} />
              <AvatarFallback className="text-xl">
                {friend.name ? friend.name.split(' ').map(n => n[0]).join('') : 'F'}
              </AvatarFallback>
            </Avatar>
            
            <h2 className="text-xl font-bold text-gray-900 mb-1">{friend.name}</h2>
            <p className="text-gray-600 mb-2 text-sm">@{friend.username}</p>
            
            {friend.last_active_at && (
              <Badge variant="secondary" className="mb-2 flex items-center gap-1 text-xs mx-auto w-fit">
                <Clock className="w-3 h-3" />
                {UserVisibilityService.formatLastActive(friend.last_active_at)}
              </Badge>
            )}
            
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
              <User className="w-3 h-3 mr-1" />
              Friend
            </Badge>
          </div>

          {/* Bio Section */}
          {friend.bio && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">About</h3>
              <p className="text-gray-700 text-sm leading-relaxed px-2">{friend.bio}</p>
            </div>
          )}

          {/* Member Since */}
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Calendar className="w-3 h-3" />
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
            <h3 className="font-semibold text-gray-900 mb-2 text-sm">Music Preferences</h3>
            <div className="flex flex-wrap gap-1">
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
            <h3 className="font-semibold text-gray-900 mb-2 text-sm">Recent Activity</h3>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Active now</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Music className="w-3 h-3" />
                <span>Recently reviewed a concert</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-3 border-t">
            <div className="flex gap-2">
              {onAddFriend && (
                <Button
                  variant="outline"
                  className="flex-1 text-sm"
                  size="sm"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('👥 Add Friend button clicked for:', friend.name, 'ID:', friend.user_id);
                    try {
                      await onAddFriend(friend.user_id);
                      console.log('✅ Add friend request completed');
                    } catch (error) {
                      console.error('❌ Error in Add Friend:', error);
                    }
                  }}
                >
                  Add Friend
                </Button>
              )}
              <Button
                variant="outline"
                className="flex-1 text-sm"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onNavigateToProfile) {
                    onNavigateToProfile(friend.user_id);
                    onClose();
                  }
                }}
              >
                <User className="w-3 h-3 mr-1" />
                Full Profile
              </Button>
              <Button
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-sm"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onStartChat) {
                    onStartChat(friend.user_id);
                  }
                  onClose();
                }}
              >
                <MessageCircle className="w-3 h-3 mr-1" />
                Start Chat
              </Button>
            </div>
            
            {/* Unfriend Button */}
            {onUnfriend && (
              <Button
                variant="destructive"
                className="w-full text-sm"
                size="sm"
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
                <UserMinus className="w-3 h-3 mr-1" />
                Unfriend
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
