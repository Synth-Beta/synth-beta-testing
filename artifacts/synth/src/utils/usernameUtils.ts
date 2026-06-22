/**
 * Username utility functions for generation, validation, and sanitization
 */

// Reserved usernames that cannot be used
const RESERVED_USERNAMES = [
  'admin',
  'administrator',
  'support',
  'help',
  'root',
  'system',
  'api',
  'www',
  'mail',
  'email',
  'postmaster',
  'noreply',
  'no-reply',
  'test',
  'testing',
  'null',
  'undefined',
  'delete',
  'remove',
  'moderator',
  'mod',
  'staff',
  'team',
  'official',
  'verify',
  'verified',
];

/**
 * Sanitize a username by converting to lowercase, trimming, and removing invalid characters
 */
export function sanitizeUsername(username: string): string {
  if (!username) return '';
  
  // Convert to lowercase and trim
  let sanitized = username.toLowerCase().trim();
  
  // Remove any characters that aren't alphanumeric, underscore, or period
  sanitized = sanitized.replace(/[^a-z0-9_.]/g, '');
  
  // Remove leading/trailing periods and underscores
  sanitized = sanitized.replace(/^[_.]+|[_.]+$/g, '');
  
  // Replace multiple consecutive periods or underscores with single
  sanitized = sanitized.replace(/[_.]{2,}/g, (match) => match[0]);
  
  return sanitized;
}

/**
 * Validate username format
 * Rules: 3-30 characters, lowercase letters, numbers, underscores, and periods only
 */
export function validateUsernameFormat(username: string): { valid: boolean; error?: string } {
  if (!username) {
    return { valid: false, error: 'Username is required' };
  }
  
  const sanitized = sanitizeUsername(username);
  
  if (sanitized.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  
  if (sanitized.length > 30) {
    return { valid: false, error: 'Username must be 30 characters or less' };
  }
  
  // Check format: lowercase letters, numbers, underscores, periods only
  const formatRegex = /^[a-z0-9_.]+$/;
  if (!formatRegex.test(sanitized)) {
    return { valid: false, error: 'Username can only contain lowercase letters, numbers, underscores, and periods' };
  }
  
  // Check if reserved
  if (RESERVED_USERNAMES.includes(sanitized)) {
    return { valid: false, error: 'This username is reserved and cannot be used' };
  }
  
  // Cannot start or end with period or underscore (already handled by sanitize, but double-check)
  if (sanitized.startsWith('.') || sanitized.startsWith('_') || 
      sanitized.endsWith('.') || sanitized.endsWith('_')) {
    return { valid: false, error: 'Username cannot start or end with a period or underscore' };
  }
  
  return { valid: true };
}

/**
 * Generate a base username from a full name
 * Example: "Tej Patel" -> "tejpatel", "John Smith" -> "johnsmith"
 */
export function generateBaseUsernameFromName(name: string): string {
  if (!name) return '';
  
  // Convert to lowercase and trim
  let base = name.toLowerCase().trim();
  
  // Remove any characters that aren't letters, numbers, or spaces
  base = base.replace(/[^a-z0-9\s]/g, '');
  
  // Split by spaces and join
  const parts = base.split(/\s+/).filter(Boolean);
  
  if (parts.length === 0) return '';
  
  // If single word and >= 3 chars, use it directly
  if (parts.length === 1) {
    return parts[0];
  }
  
  // Multiple words: combine them
  return parts.join('');
}

/**
 * Generate username suggestions from a base name
 * Returns variants like: tejpatel, tejpatel2, tejpatel3, etc.
 */
export function suggestUsernames(baseName: string, existingUsernames: string[] = [], count: number = 5): string[] {
  const baseUsername = generateBaseUsernameFromName(baseName);
  
  if (!baseUsername) return [];
  
  const suggestions: string[] = [];
  const existingSet = new Set(existingUsernames.map(u => u.toLowerCase()));
  
  // First suggestion is the base username
  if (!existingSet.has(baseUsername) && !RESERVED_USERNAMES.includes(baseUsername)) {
    suggestions.push(baseUsername);
  }
  
  // Generate numbered variants
  let counter = 2;
  while (suggestions.length < count) {
    const variant = `${baseUsername}${counter}`;
    if (!existingSet.has(variant) && !RESERVED_USERNAMES.includes(variant)) {
      suggestions.push(variant);
    }
    counter++;
    
    // Safety limit to prevent infinite loop
    if (counter > 1000) break;
  }
  
  // If base is too short, add underscore variants
  if (baseUsername.length < 3 && suggestions.length < count) {
    const underscoreVariants = [`${baseUsername}_`, `_${baseUsername}`, `${baseUsername}1`];
    for (const variant of underscoreVariants) {
      if (suggestions.length >= count) break;
      if (!existingSet.has(variant) && !RESERVED_USERNAMES.includes(variant) && 
          validateUsernameFormat(variant).valid) {
        suggestions.push(variant);
      }
    }
  }
  
  return suggestions.slice(0, count);
}

/**
 * Check if a username is reserved
 */
export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.includes(username.toLowerCase());
}

/**
 * Get reserved usernames list (for reference)
 */
export function getReservedUsernames(): readonly string[] {
  return RESERVED_USERNAMES;
}
