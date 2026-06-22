import { parseISO, format, isValid } from 'date-fns';

/**
 * Safely parse a date string, handling both old format (separate date/time) and new format (full timestamp)
 */
export function safeParseEventDate(event: { event_date: string; event_time?: string }): Date {
  try {
    let dateString: string;
    
    if (event.event_time) {
      // Old format: separate date and time fields
      dateString = `${event.event_date}T${event.event_time}`;
    } else {
      // New format: event_date is already a full timestamp
      dateString = event.event_date;
    }
    
    const parsedDate = parseISO(dateString);
    
    if (isValid(parsedDate)) {
      return parsedDate;
    } else {
      console.warn('Invalid date parsed, falling back to current date:', { event_date: event.event_date, event_time: event.event_time });
      return new Date();
    }
  } catch (error) {
    console.warn('Error parsing date, falling back to current date:', error, { event_date: event.event_date, event_time: event.event_time });
    return new Date();
  }
}

/**
 * Safely format a date string with fallback
 */
export function safeFormatEventDate(event: { event_date: string; event_time?: string }, formatString: string): string {
  try {
    const date = safeParseEventDate(event);
    return format(date, formatString);
  } catch (error) {
    console.warn('Error formatting date:', error, { event_date: event.event_date, event_time: event.event_time });
    return event.event_date || 'TBD';
  }
}

/**
 * Safely format event date and time
 */
export function safeFormatEventDateTime(event: { event_date: string; event_time?: string }): string {
  try {
    const date = safeParseEventDate(event);
    return `${format(date, 'MMM d, yyyy')} at ${format(date, 'h:mm a')}`;
  } catch (error) {
    console.warn('Error formatting date/time:', error, { event_date: event.event_date, event_time: event.event_time });
    return `${event.event_date} at ${event.event_time || 'TBD'}`;
  }
}
