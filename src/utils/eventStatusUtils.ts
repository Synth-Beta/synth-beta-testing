/**
 * Event Status Utility Functions
 * Determines if events are upcoming or past using frontend logic
 */

export type EventStatus = 'upcoming' | 'past';

/**
 * Determines if an event is upcoming or past based on its date
 * @param eventDate - The event date (string or Date)
 * @returns 'upcoming' if event is in the future, 'past' if it has passed
 */
export const getEventStatus = (eventDate: string | Date): EventStatus => {
  const eventDateTime = new Date(eventDate);
  const now = new Date();
  
  // Clear time components to compare dates only
  const eventDateOnly = new Date(eventDateTime.getFullYear(), eventDateTime.getMonth(), eventDateTime.getDate());
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  return eventDateOnly >= todayOnly ? 'upcoming' : 'past';
};

/**
 * Checks if an event is upcoming
 * @param eventDate - The event date (string or Date)
 * @returns true if event is upcoming, false if past
 */
export const isEventUpcoming = (eventDate: string | Date): boolean => {
  return getEventStatus(eventDate) === 'upcoming';
};

/**
 * Checks if an event is past
 * @param eventDate - The event date (string or Date)
 * @returns true if event is past, false if upcoming
 */
export const isEventPast = (eventDate: string | Date): boolean => {
  return getEventStatus(eventDate) === 'past';
};

/**
 * Filters events by status
 * @param events - Array of events with event_date property
 * @param status - 'upcoming' or 'past'
 * @returns Filtered array of events
 */
export const filterEventsByStatus = <T extends { event_date: string }>(
  events: T[],
  status: EventStatus
): T[] => {
  return events.filter(event => getEventStatus(event.event_date) === status);
};

/**
 * Gets upcoming events from an array
 * @param events - Array of events with event_date property
 * @returns Array of upcoming events
 */
export const getUpcomingEvents = <T extends { event_date: string }>(events: T[]): T[] => {
  return filterEventsByStatus(events, 'upcoming');
};

/**
 * Gets past events from an array
 * @param events - Array of events with event_date property
 * @returns Array of past events
 */
export const getPastEvents = <T extends { event_date: string }>(events: T[]): T[] => {
  return filterEventsByStatus(events, 'past');
};

/**
 * Formats event date for display
 * @param eventDate - The event date (string or Date)
 * @returns Formatted date string
 */
export const formatEventDate = (eventDate: string | Date): string => {
  const date = new Date(eventDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Gets relative time description for an event
 * @param eventDate - The event date (string or Date)
 * @returns Relative time string (e.g., "2 days ago", "in 3 days")
 */
export const getEventRelativeTime = (eventDate: string | Date): string => {
  const eventDateTime = new Date(eventDate);
  const now = new Date();
  const diffTime = eventDateTime.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Tomorrow';
  } else if (diffDays === -1) {
    return 'Yesterday';
  } else if (diffDays > 0) {
    return `in ${diffDays} days`;
  } else {
    return `${Math.abs(diffDays)} days ago`;
  }
};
