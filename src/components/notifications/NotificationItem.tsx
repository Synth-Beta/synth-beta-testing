import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { 
  Heart, 
  MessageCircle, 
  Reply, 
  UserPlus, 
  Check, 
  Music,
  ExternalLink,
  Clock,
  MapPin,
  CheckCircle,
  XCircle
} from 'lucide-react';
import type { NotificationWithDetails } from '@/types/notifications';
import { NotificationService } from '@/services/notificationService';

interface NotificationItemProps {
  notification: NotificationWithDetails;
  onMarkAsRead?: (notificationId: string) => void;
  onViewReview?: (reviewId: string) => void;
  onViewProfile?: (userId: string) => void;
}

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onViewReview,
  onViewProfile
}) => {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  const getNotificationIcon = () => {
    switch (notification.type) {
      case 'friend_request':
        return <UserPlus className="w-4 h-4" />;
      case 'friend_accepted':
        return <Check className="w-4 h-4" />;
      case 'review_liked':
        return <Heart className="w-4 h-4" />;
      case 'review_commented':
        return <MessageCircle className="w-4 h-4" />;
      case 'comment_replied':
        return <Reply className="w-4 h-4" />;
      case 'event_attendance_reminder':
        return <MapPin className="w-4 h-4" />;
      default:
        return <Music className="w-4 h-4" />;
    }
  };

  const getNotificationColor = () => {
    return NotificationService.getNotificationColor(notification.type);
  };

  const handleMarkAsRead = () => {
    if (!notification.is_read && onMarkAsRead) {
      onMarkAsRead(notification.id);
    }
  };

  const handleClick = () => {
    // Mark as read when clicked
    handleMarkAsRead();

    // Navigate based on notification type
    if (notification.review_id && onViewReview) {
      onViewReview(notification.review_id);
    } else if (notification.actor_user_id && onViewProfile) {
      onViewProfile(notification.actor_user_id);
    }
  };

  const formatTime = () => {
    return NotificationService.formatNotificationTime(notification.created_at);
  };

  const handleAttendanceAction = async (attended: boolean) => {
    setIsProcessing(true);
    try {
      // Get event ID from notification data
      const eventId = notification.data?.event_id;
      if (!eventId) {
        throw new Error('Event ID not found in notification');
      }

      // Handle the attendance action
      await NotificationService.handleAttendanceReminderAction(
        notification.id,
        eventId,
        attended
      );

      // Show success message
      toast({
        title: attended ? 'Attendance Marked ✅' : 'Got it!',
        description: attended 
          ? 'Your attendance has been recorded. You can add a review anytime!'
          : 'We\'ve noted you didn\'t attend this event.',
        variant: 'default'
      });

      // Mark as dismissed to hide the notification
      setIsDismissed(true);
      
      // Call the onMarkAsRead callback
      if (onMarkAsRead) {
        onMarkAsRead(notification.id);
      }
    } catch (error) {
      console.error('Error handling attendance action:', error);
      toast({
        title: 'Error',
        description: 'Failed to mark attendance. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    handleMarkAsRead();
  };

  // Don't render if dismissed
  if (isDismissed) {
    return null;
  }

  return (
    <Card 
      className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
        notification.is_read ? 'opacity-75' : 'bg-blue-50 border-blue-200'
      }`}
      onClick={handleClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Notification Icon */}
          <div className={`p-2 rounded-full ${getNotificationColor()}`}>
            {getNotificationIcon()}
          </div>

          {/* Notification Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                {/* Title */}
                <h4 className="font-semibold text-sm text-gray-900 mb-1">
                  {notification.title}
                </h4>

                {/* Message */}
                <p className="text-sm text-gray-700 mb-2 line-clamp-2">
                  {notification.message}
                </p>

                {/* Actor Info */}
                {notification.actor_user_id && (
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar className="w-6 h-6">
                      <AvatarImage src={notification.actor_avatar || undefined} />
                      <AvatarFallback className="text-xs">
                        {notification.actor_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-gray-600">
                      {notification.actor_name || 'Someone'}
                    </span>
                  </div>
                )}

                {/* Event/Review Context */}
                {notification.event_title && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                    <Music className="w-3 h-3" />
                    <span className="truncate">
                      {notification.event_title}
                      {notification.artist_name && ` • ${notification.artist_name}`}
                    </span>
                  </div>
                )}

                {/* Review Preview */}
                {notification.review_text && (
                  <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 mb-2">
                    <span className="italic">"{notification.review_text.substring(0, 100)}..."</span>
                    {notification.rating && (
                      <span className="ml-2 font-medium">
                        {notification.rating}⭐
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Time and Status */}
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  <span>{formatTime()}</span>
                </div>

                {/* Unread Badge */}
                {!notification.is_read && (
                  <Badge variant="default" className="bg-blue-500 text-white text-xs">
                    New
                  </Badge>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {/* Attendance Reminder Actions */}
              {notification.type === 'event_attendance_reminder' && !notification.is_read && (
                <>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAttendanceAction(true);
                    }}
                    disabled={isProcessing}
                    className="text-xs bg-teal-600 hover:bg-teal-700"
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {isProcessing ? 'Processing...' : 'Yes, I attended'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAttendanceAction(false);
                    }}
                    disabled={isProcessing}
                    className="text-xs"
                  >
                    <XCircle className="w-3 h-3 mr-1" />
                    No, I didn't go
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDismiss();
                    }}
                    disabled={isProcessing}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Dismiss
                  </Button>
                </>
              )}

              {/* Standard Review/Profile Actions */}
              {notification.type !== 'event_attendance_reminder' && (
                <>
                  {notification.review_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewReview?.(notification.review_id!);
                        handleMarkAsRead();
                      }}
                      className="text-xs"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      View Review
                    </Button>
                  )}

                  {notification.actor_user_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewProfile?.(notification.actor_user_id!);
                      }}
                      className="text-xs"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      View Profile
                    </Button>
                  )}

                  {!notification.is_read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead();
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Mark as read
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
