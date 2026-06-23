import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely parse a date string and return a valid Date object or null
 */
export function safeParseDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString);
      return null;
    }
    return date;
  } catch (error) {
    console.warn('Error parsing date:', dateString, error);
    return null;
  }
}

/**
 * Format a date string safely, returning a fallback if invalid
 */
export function safeDateFormat(
  dateString: string | null | undefined, 
  formatter: (date: Date) => string,
  fallback: string = 'Date unavailable'
): string {
  const date = safeParseDate(dateString);
  if (!date) return fallback;
  
  try {
    return formatter(date);
  } catch (error) {
    console.warn('Error formatting date:', dateString, error);
    return fallback;
  }
}
