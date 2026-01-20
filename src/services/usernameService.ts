/**
 * Username service for checking availability, generating usernames, and managing username changes
 */

import { supabase } from '@/integrations/supabase/client';
import {
  sanitizeUsername,
  validateUsernameFormat,
  generateBaseUsernameFromName,
  suggestUsernames,
  isReservedUsername,
} from '@/utils/usernameUtils';

const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

/**
 * Check if a username is available (unique and not reserved)
 */
export async function checkUsernameAvailability(
  username: string,
  excludeUserId?: string
): Promise<{ available: boolean; error?: string }> {
  // Sanitize and validate format
  const sanitized = sanitizeUsername(username);
  
  if (!sanitized) {
    return { available: false, error: 'Username is required' };
  }
  
  // Validate format
  const formatValidation = validateUsernameFormat(sanitized);
  if (!formatValidation.valid) {
    return { available: false, error: formatValidation.error };
  }
  
  // Check if reserved
  if (isReservedUsername(sanitized)) {
    return { available: false, error: 'This username is reserved and cannot be used' };
  }
  
  try {
    // Check if username already exists
    let query = supabase
      .from('users')
      .select('user_id, username')
      .eq('username', sanitized)
      .limit(1);
    
    // Exclude current user if editing
    if (excludeUserId) {
      query = query.neq('user_id', excludeUserId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error checking username availability:', error);
      // If column doesn't exist, assume available (for graceful degradation)
      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
        return { available: true };
      }
      return { available: false, error: 'Error checking username availability' };
    }
    
    // Username is available if no results found
    if (!data || data.length === 0) {
      return { available: true };
    }
    
    return { available: false, error: 'This username is already taken' };
  } catch (error) {
    console.error('Error checking username availability:', error);
    return { available: false, error: 'Error checking username availability' };
  }
}

/**
 * Generate an available username from a name, handling conflicts automatically
 */
export async function generateAvailableUsername(
  baseName: string,
  excludeUserId?: string
): Promise<string | null> {
  const baseUsername = generateBaseUsernameFromName(baseName);
  
  if (!baseUsername) {
    // If name is too short or invalid, generate a fallback
    const fallback = `user${Math.floor(Math.random() * 10000)}`;
    const available = await checkUsernameAvailability(fallback, excludeUserId);
    if (available.available) {
      return fallback;
    }
    return null;
  }
  
  // Check if base username is available
  const baseCheck = await checkUsernameAvailability(baseUsername, excludeUserId);
  if (baseCheck.available) {
    return sanitizeUsername(baseUsername);
  }
  
  // Generate suggestions and find first available
  // First, get existing usernames (for optimization, we'll check individually)
  let counter = 2;
  const maxAttempts = 100;
  
  while (counter < maxAttempts) {
    const variant = `${sanitizeUsername(baseUsername)}${counter}`;
    const check = await checkUsernameAvailability(variant, excludeUserId);
    
    if (check.available) {
      return variant;
    }
    
    counter++;
  }
  
  // If all attempts failed, return null
  return null;
}

/**
 * Check if user can change their username (30-day cooldown)
 */
export async function canChangeUsername(userId: string): Promise<{
  allowed: boolean;
  daysRemaining?: number;
  lastChangeDate?: Date;
}> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('last_username_change_at')
      .eq('user_id', userId)
      .single();
    
    if (error || !data) {
      // If column doesn't exist yet or user not found, allow change
      return { allowed: true };
    }
    
    const lastChangeAt = data.last_username_change_at;
    
    // If never changed, allow
    if (!lastChangeAt) {
      return { allowed: true };
    }
    
    const lastChangeDate = new Date(lastChangeAt);
    const now = new Date();
    const daysSinceChange = Math.floor(
      (now.getTime() - lastChangeDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysSinceChange >= USERNAME_CHANGE_COOLDOWN_DAYS) {
      return { allowed: true, lastChangeDate };
    }
    
    const daysRemaining = USERNAME_CHANGE_COOLDOWN_DAYS - daysSinceChange;
    return { allowed: false, daysRemaining, lastChangeDate };
  } catch (error) {
    console.error('Error checking username change eligibility:', error);
    // On error, allow change (fail open)
    return { allowed: true };
  }
}

/**
 * Get the last username change date for a user
 */
export async function getLastUsernameChangeDate(userId: string): Promise<Date | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('last_username_change_at')
      .eq('user_id', userId)
      .single();
    
    if (error || !data || !data.last_username_change_at) {
      return null;
    }
    
    return new Date(data.last_username_change_at);
  } catch (error) {
    console.error('Error fetching last username change date:', error);
    return null;
  }
}

/**
 * Update username with validation, rate limiting, and uniqueness checks
 */
export async function updateUsername(
  userId: string,
  newUsername: string
): Promise<{ success: boolean; error?: string }> {
  // Check if user can change username
  const canChange = await canChangeUsername(userId);
  if (!canChange.allowed) {
    return {
      success: false,
      error: `You can only change your username once every ${USERNAME_CHANGE_COOLDOWN_DAYS} days. You can change it again in ${canChange.daysRemaining} day${canChange.daysRemaining !== 1 ? 's' : ''}.`,
    };
  }
  
  // Validate and check availability
  const availability = await checkUsernameAvailability(newUsername, userId);
  if (!availability.available) {
    return { success: false, error: availability.error || 'Username is not available' };
  }
  
  // Sanitize username
  const sanitized = sanitizeUsername(newUsername);
  
  try {
    // Update username and last_username_change_at
    const { error } = await supabase
      .from('users')
      .update({
        username: sanitized,
        last_username_change_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    
    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505' || error.message?.includes('unique')) {
        return { success: false, error: 'This username is already taken' };
      }
      
      // Handle missing column gracefully
      if (error.message?.includes('last_username_change_at') || error.code === '42703') {
        // Column doesn't exist yet, try without it
        const { error: updateError } = await supabase
          .from('users')
          .update({
            username: sanitized,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
        
        if (updateError) {
          console.error('Error updating username:', updateError);
          return { success: false, error: 'Failed to update username' };
        }
        
        return { success: true };
      }
      
      console.error('Error updating username:', error);
      return { success: false, error: 'Failed to update username' };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('Error updating username:', error);
    return { success: false, error: error.message || 'Failed to update username' };
  }
}

/**
 * Get username suggestions for a given name
 */
export async function getUsernameSuggestions(
  name: string,
  excludeUserId?: string,
  count: number = 5
): Promise<string[]> {
  const baseUsername = generateBaseUsernameFromName(name);
  
  if (!baseUsername) {
    return [];
  }
  
  // Get existing usernames (for better suggestions)
  try {
    let query = supabase
      .from('users')
      .select('username')
      .not('username', 'is', null)
      .limit(1000); // Get a reasonable sample
    
    if (excludeUserId) {
      query = query.neq('user_id', excludeUserId);
    }
    
    const { data } = await query;
    const existingUsernames = (data || [])
      .map((u: any) => u.username)
      .filter(Boolean) as string[];
    
    return suggestUsernames(baseUsername, existingUsernames, count);
  } catch (error) {
    console.error('Error getting username suggestions:', error);
    // Return suggestions without existing usernames check
    return suggestUsernames(baseUsername, [], count);
  }
}
