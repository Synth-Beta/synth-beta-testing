// Notification types for the review engagement system

export type NotificationType = 
  | 'friend_request'
  | 'friend_accepted'
  | 'match'
  | 'message'
  | 'chat_message'
  | 'review_liked'
  | 'review_commented'
  | 'comment_replied'
  | 'event_interest'
  | 'event_attendance_reminder'
  | 'artist_followed'
  | 'artist_new_event'
  | 'venue_new_event'
  | 'event_share'
  | 'friend_rsvp_going'
  | 'friend_rsvp_changed'
  | 'friend_review_posted'
  | 'friend_attended_same_event'
  | 'friend_tagged_in_review'
  | 'follows_new_events_summary'
  | 'friends_event_interest_summary'
  | 'bucket_list_new_events_summary'
  | 'event_reminder'
  // Emitted by public.send_event_reminders() (pg_cron 'event-reminders').
  // day_after fires only for relationship_type='going' and opens the review composer.
  | 'event_reminder_1_week'
  | 'event_reminder_3_days'
  | 'event_reminder_1_day'
  | 'event_reminder_day_after'
  | 'group_chat_invite'
  | 'trending_in_network'
  | 'mutual_attendance'
  | 'flag_reviewed'
  | 'user_warned'
  | 'user_restricted'
  | 'user_suspended';

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
    friend_name?: string;
  };
  event_interest: {
    interested_user_id: string;
    event_id: string;
    event_title: string;
    event_venue: string;
    event_date: string;
    user_name: string;
  };
  event_attendance_reminder: {
    event_id: string;
    event_title: string;
    event_venue: string;
    event_date: string;
    artist_name?: string;
  };
  event_reminder_day_after: {
    event_id: string;
    event_title: string;
    event_venue: string;
    event_date: string;
    event_artist?: string;
    artist_id?: string;
    venue_id?: string;
    reminder_type: 'event_reminder_day_after';
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
