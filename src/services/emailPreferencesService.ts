/**
 * Email Preferences Service
 * 
 * Handles all email preference operations including fetching,
 * updating, and checking if specific email types are enabled
 */

import { supabase } from '@/integrations/supabase/client';
import type { EmailPreferences, UpdateEmailPreferences } from '@/types/emailPreferences';

/**
 * Get email preferences for a specific user
 */
export async function getEmailPreferences(userId: string): Promise<EmailPreferences | null> {
  try {
    const { data, error } = await supabase
      .from('email_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching email preferences:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Failed to get email preferences:', error);
    return null;
  }
}

/**
 * Get email preferences for the currently authenticated user
 */
export async function getCurrentUserEmailPreferences(): Promise<EmailPreferences | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('No authenticated user');
    }

    return await getEmailPreferences(user.id);
  } catch (error) {
    console.error('Failed to get current user email preferences:', error);
    return null;
  }
}

/**
 * Update email preferences for a specific user
 */
export async function updateEmailPreferences(
  userId: string,
  preferences: UpdateEmailPreferences
): Promise<EmailPreferences | null> {
  try {
    const { data, error } = await supabase
      .from('email_preferences')
      .update(preferences)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating email preferences:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Failed to update email preferences:', error);
    return null;
  }
}

/**
 * Update email preferences for the currently authenticated user
 */
export async function updateCurrentUserEmailPreferences(
  preferences: UpdateEmailPreferences
): Promise<EmailPreferences | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('No authenticated user');
    }

    return await updateEmailPreferences(user.id, preferences);
  } catch (error) {
    console.error('Failed to update current user email preferences:', error);
    return null;
  }
}

/**
 * Check if a specific email type is enabled for a user
 * Used before sending emails to respect user preferences
 */
export async function isEmailTypeEnabled(
  userId: string,
  emailType: 'event_reminders' | 'match_notifications' | 'review_notifications' | 'weekly_digest'
): Promise<boolean> {
  try {
    const preferences = await getEmailPreferences(userId);
    
    if (!preferences) {
      // If no preferences found, default to enabled
      return true;
    }

    switch (emailType) {
      case 'event_reminders':
        return preferences.enable_event_reminders;
      case 'match_notifications':
        return preferences.enable_match_notifications;
      case 'review_notifications':
        return preferences.enable_review_notifications;
      case 'weekly_digest':
        return preferences.enable_weekly_digest;
      default:
        return true;
    }
  } catch (error) {
    console.error('Error checking email type enabled:', error);
    // Default to enabled if error occurs
    return true;
  }
}

/**
 * Create email preferences for a new user
 * This is typically called automatically by the database trigger,
 * but can be called manually if needed
 */
export async function createEmailPreferences(userId: string): Promise<EmailPreferences | null> {
  try {
    const { data, error } = await supabase
      .from('email_preferences')
      .insert({
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating email preferences:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Failed to create email preferences:', error);
    return null;
  }
}

/**
 * Ensure email preferences exist for a user
 * Creates them if they don't exist
 */
export async function ensureEmailPreferencesExist(userId: string): Promise<EmailPreferences | null> {
  try {
    let preferences = await getEmailPreferences(userId);
    
    if (!preferences) {
      preferences = await createEmailPreferences(userId);
    }

    return preferences;
  } catch (error) {
    console.error('Failed to ensure email preferences exist:', error);
    return null;
  }
}

