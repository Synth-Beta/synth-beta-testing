/**
 * Content filtering utilities for age-restricted content
 * Filters events and other content for users under 18
 */

import type { PersonalizedEvent } from '@/services/personalizedFeedService';
import type { Event } from '@/types/database';

// Tags and keywords that indicate mature/explicit content
const EXPLICIT_TAGS = [
  '18+',
  '21+',
  'adult',
  'explicit',
  'mature',
  'nsfw',
  'adults only',
  'age restricted',
];

// Genre tags that might indicate mature content (can be expanded)
const EXPLICIT_GENRES = [
  'explicit hip-hop',
  'explicit rap',
  'adult contemporary',
];

/**
 * Check if an event has explicit tags or age restrictions
 */
function hasExplicitContent(event: PersonalizedEvent | Event): boolean {
  // Check genres array
  if (event.genres && Array.isArray(event.genres)) {
    const genreLower = event.genres.map(g => g.toLowerCase());
    if (genreLower.some(g => EXPLICIT_GENRES.some(e => g.includes(e)))) {
      return true;
    }
  }

  // Check title for explicit tags
  if (event.title) {
    const titleLower = event.title.toLowerCase();
    if (EXPLICIT_TAGS.some(tag => titleLower.includes(tag.toLowerCase()))) {
      return true;
    }
  }

  // Check description for explicit tags
  if (event.description) {
    const descLower = event.description.toLowerCase();
    if (EXPLICIT_TAGS.some(tag => descLower.includes(tag.toLowerCase()))) {
      return true;
    }
  }

  // Check classifications JSONB for age restrictions
  if (event.classifications && typeof event.classifications === 'object') {
    const classifications = event.classifications as any;
    
    // Check for age restriction fields (common in Ticketmaster/JamBase data)
    if (classifications.ageRestriction || classifications.age_restriction) {
      const ageRestriction = classifications.ageRestriction || classifications.age_restriction;
      if (typeof ageRestriction === 'string') {
        const restrictionLower = ageRestriction.toLowerCase();
        if (EXPLICIT_TAGS.some(tag => restrictionLower.includes(tag.toLowerCase()))) {
          return true;
        }
      }
      if (typeof ageRestriction === 'number' && ageRestriction >= 18) {
        return true;
      }
    }

    // Check segment/segmentName for explicit content indicators
    if (classifications.segment || classifications.segmentName) {
      const segment = (classifications.segment || classifications.segmentName || '').toLowerCase();
      if (EXPLICIT_TAGS.some(tag => segment.includes(tag.toLowerCase()))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extract age restriction from event (if available)
 * Returns the minimum age required, or null if no restriction
 */
function getAgeRestriction(event: PersonalizedEvent | Event): number | null {
  // Check classifications for age restriction
  if (event.classifications && typeof event.classifications === 'object') {
    const classifications = event.classifications as any;
    
    if (classifications.ageRestriction || classifications.age_restriction) {
      const ageRestriction = classifications.ageRestriction || classifications.age_restriction;
      if (typeof ageRestriction === 'number') {
        return ageRestriction;
      }
      if (typeof ageRestriction === 'string') {
        // Try to extract number from string like "18+", "21+", etc.
        const match = ageRestriction.match(/(\d+)\+/);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
    }
  }

  // Check title/description for age restrictions
  const textToCheck = `${event.title || ''} ${event.description || ''}`.toLowerCase();
  const match = textToCheck.match(/(\d+)\+/);
  if (match) {
    const age = parseInt(match[1], 10);
    if (age >= 18) {
      return age;
    }
  }

  return null;
}

/**
 * Filter events for minors based on age restrictions and explicit content
 * @param events Array of events to filter
 * @param userAge Age of the user (null if unknown)
 * @returns Filtered array of events safe for the user's age
 */
export function filterContentForMinors<T extends PersonalizedEvent | Event>(
  events: T[],
  userAge: number | null
): T[] {
  // If user is 18 or older, return all events
  if (userAge !== null && userAge >= 18) {
    return events;
  }

  // Filter out events with explicit content or age restrictions
  return events.filter(event => {
    // Check for explicit content tags
    if (hasExplicitContent(event)) {
      return false;
    }

    // Check age restriction
    const ageRestriction = getAgeRestriction(event);
    if (ageRestriction !== null) {
      // If user age is unknown but event has 18+ restriction, filter it out
      if (userAge === null && ageRestriction >= 18) {
        return false;
      }
      // If user age is known and less than restriction, filter it out
      if (userAge !== null && userAge < ageRestriction) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Check if content should be filtered for a user
 * @param event Event to check
 * @param userAge User's age (null if unknown)
 * @returns true if content should be filtered out
 */
export function shouldFilterContent(
  event: PersonalizedEvent | Event,
  userAge: number | null
): boolean {
  // If user is 18 or older, don't filter
  if (userAge !== null && userAge >= 18) {
    return false;
  }

  // Check for explicit content
  if (hasExplicitContent(event)) {
    return true;
  }

  // Check age restriction
  const ageRestriction = getAgeRestriction(event);
  if (ageRestriction !== null) {
    if (userAge === null && ageRestriction >= 18) {
      return true;
    }
    if (userAge !== null && userAge < ageRestriction) {
      return true;
    }
  }

  return false;
}
