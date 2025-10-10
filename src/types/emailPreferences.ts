/**
 * Email Preferences Types
 * 
 * Defines types for user email notification preferences
 */

export type WeekDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface EmailPreferences {
  id: string;
  user_id: string;
  
  // Auth emails (cannot be disabled - display only)
  enable_auth_emails: boolean;
  
  // Notification emails (can be disabled)
  enable_event_reminders: boolean;
  enable_match_notifications: boolean;
  enable_review_notifications: boolean;
  enable_weekly_digest: boolean;
  
  // Preferences
  weekly_digest_day: WeekDay;
  event_reminder_days: number;
  
  // Metadata
  created_at: string;
  updated_at: string;
}

export interface UpdateEmailPreferences {
  enable_event_reminders?: boolean;
  enable_match_notifications?: boolean;
  enable_review_notifications?: boolean;
  enable_weekly_digest?: boolean;
  weekly_digest_day?: WeekDay;
  event_reminder_days?: number;
}

export interface EmailType {
  id: string;
  name: string;
  description: string;
  category: 'auth' | 'notification';
  canDisable: boolean;
  icon?: string;
}

export const EMAIL_TYPES: EmailType[] = [
  // Auth emails (cannot be disabled)
  {
    id: 'account_confirmation',
    name: 'Account Confirmation',
    description: 'Verify your email address when creating an account',
    category: 'auth',
    canDisable: false,
  },
  {
    id: 'password_reset',
    name: 'Password Reset',
    description: 'Reset your password when you forget it',
    category: 'auth',
    canDisable: false,
  },
  {
    id: 'email_change',
    name: 'Email Address Changes',
    description: 'Verify new email address when updating your account',
    category: 'auth',
    canDisable: false,
  },
  {
    id: 'magic_link',
    name: 'Magic Link Sign In',
    description: 'Passwordless authentication via email link',
    category: 'auth',
    canDisable: false,
  },
  {
    id: 'reauthentication',
    name: 'Security Verification',
    description: 'Verification codes for sensitive account operations',
    category: 'auth',
    canDisable: false,
  },
  
  // Notification emails (can be disabled)
  {
    id: 'event_reminders',
    name: 'Event Reminders',
    description: 'Get notified before events you\'re interested in',
    category: 'notification',
    canDisable: true,
  },
  {
    id: 'match_notifications',
    name: 'Match Notifications',
    description: 'When you match with someone at an event',
    category: 'notification',
    canDisable: true,
  },
  {
    id: 'review_notifications',
    name: 'Review Notifications',
    description: 'When someone reviews an event you\'re interested in',
    category: 'notification',
    canDisable: true,
  },
  {
    id: 'weekly_digest',
    name: 'Weekly Digest',
    description: 'Weekly summary of events, matches, and recommendations',
    category: 'notification',
    canDisable: true,
  },
];

export const WEEK_DAYS: { value: WeekDay; label: string }[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

