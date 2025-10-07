// Notification types for the review engagement system

export type NotificationType = 
  | 'friend_request'
  | 'friend_accepted'
  | 'match'
  | 'message'
  | 'review_liked'
  | 'review_commented'
  | 'comment_replied'
  | 'event_interest';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  is_read: boolean;
  created_at: string;
  review_id?: string;
  comment_id?: string;
  actor_user_id?: string;
}

export interface NotificationWithDetails extends Notification {
  actor_name?: string;
  actor_avatar?: string;
  event_title?: string;
  artist_name?: string;
  venue_name?: string;
  review_text?: string;
  rating?: number;
}

export interface NotificationData {
  review_liked: {
    review_id: string;
    actor_id: string;
    actor_name: string;
    event_title: string;
  };
  review_commented: {
    review_id: string;
    comment_id: string;
    actor_id: string;
    actor_name: string;
    event_title: string;
    comment_preview: string;
  };
  comment_replied: {
    review_id: string;
    comment_id: string;
    parent_comment_id: string;
    actor_id: string;
    actor_name: string;
    event_title: string;
    comment_preview: string;
  };
  friend_request: {
    sender_id: string;
    request_id: string;
    sender_name: string;
  };
  friend_accepted: {
    friend_id: string;
  };
  event_interest: {
    interested_user_id: string;
    event_id: string;
    event_title: string;
    event_venue: string;
    event_date: string;
    user_name: string;
  };
}

export interface NotificationFilters {
  type?: NotificationType;
  is_read?: boolean;
  limit?: number;
  offset?: number;
}

export interface NotificationStats {
  total: number;
  unread: number;
  by_type: Record<NotificationType, number>;
}
