/**
 * Iconic Venues Configuration
 * Predefined list of iconic/notable venues that users can unlock in their passport
 */

export interface IconicVenue {
  id: string; // Venue UUID or identifier
  name: string;
  city: string;
  state?: string;
  country?: string;
  description?: string;
}

export const ICONIC_VENUES: IconicVenue[] = [
  // New York
  { id: 'msg', name: 'Madison Square Garden', city: 'New York', state: 'NY', description: 'The World\'s Most Famous Arena' },
  { id: 'apollo', name: 'Apollo Theater', city: 'New York', state: 'NY', description: 'Historic Harlem venue' },
  { id: 'bowery', name: 'Bowery Ballroom', city: 'New York', state: 'NY', description: 'Iconic downtown music venue' },
  { id: 'terminal5', name: 'Terminal 5', city: 'New York', state: 'NY', description: 'Popular Manhattan venue' },
  { id: 'brooklyn-steel', name: 'Brooklyn Steel', city: 'Brooklyn', state: 'NY', description: 'Modern Brooklyn venue' },
  
  // Los Angeles
  { id: 'hollywood-bowl', name: 'Hollywood Bowl', city: 'Los Angeles', state: 'CA', description: 'Historic outdoor amphitheater' },
  { id: 'troubadour', name: 'The Troubadour', city: 'West Hollywood', state: 'CA', description: 'Legendary LA venue' },
  { id: 'whisky', name: 'Whisky a Go Go', city: 'West Hollywood', state: 'CA', description: 'Historic Sunset Strip venue' },
  { id: 'forum', name: 'The Forum', city: 'Inglewood', state: 'CA', description: 'Iconic LA arena' },
  
  // Chicago
  { id: 'metro', name: 'Metro', city: 'Chicago', state: 'IL', description: 'Legendary Chicago venue' },
  { id: 'chicago-theatre', name: 'Chicago Theatre', city: 'Chicago', state: 'IL', description: 'Historic downtown theater' },
  { id: 'riviera', name: 'Riviera Theatre', city: 'Chicago', state: 'IL', description: 'Uptown music venue' },
  
  // Nashville
  { id: 'ryman', name: 'Ryman Auditorium', city: 'Nashville', state: 'TN', description: 'The Mother Church of Country Music' },
  { id: 'bluebird', name: 'Bluebird Cafe', city: 'Nashville', state: 'TN', description: 'Intimate songwriter venue' },
  
  // Austin
  { id: 'acl-live', name: 'ACL Live at The Moody Theater', city: 'Austin', state: 'TX', description: 'Home of Austin City Limits' },
  { id: 'stubbs', name: 'Stubb\'s BBQ', city: 'Austin', state: 'TX', description: 'Legendary BBQ and music venue' },
  
  // San Francisco
  { id: 'fillmore', name: 'The Fillmore', city: 'San Francisco', state: 'CA', description: 'Historic Fillmore District venue' },
  { id: 'warfield', name: 'The Warfield', city: 'San Francisco', state: 'CA', description: 'Downtown SF venue' },
  
  // Boston
  { id: 'td-garden', name: 'TD Garden', city: 'Boston', state: 'MA', description: 'Boston\'s premier arena' },
  { id: 'paradise', name: 'Paradise Rock Club', city: 'Boston', state: 'MA', description: 'Iconic Boston venue' },
  
  // Seattle
  { id: 'showbox', name: 'The Showbox', city: 'Seattle', state: 'WA', description: 'Historic Seattle venue' },
  { id: 'neptune', name: 'Neptune Theatre', city: 'Seattle', state: 'WA', description: 'U-District venue' },
  
  // Denver
  { id: 'red-rocks', name: 'Red Rocks Amphitheatre', city: 'Morrison', state: 'CO', description: 'World-famous natural amphitheater' },
  { id: 'bluebird', name: 'Bluebird Theater', city: 'Denver', state: 'CO', description: 'Historic Denver venue' },
  
  // Atlanta
  { id: 'tabernacle', name: 'The Tabernacle', city: 'Atlanta', state: 'GA', description: 'Historic downtown venue' },
  { id: 'variety', name: 'Variety Playhouse', city: 'Atlanta', state: 'GA', description: 'Little Five Points venue' },
  
  // Philadelphia
  { id: 'tla', name: 'Theatre of Living Arts', city: 'Philadelphia', state: 'PA', description: 'South Street venue' },
  { id: 'union-transfer', name: 'Union Transfer', city: 'Philadelphia', state: 'PA', description: 'Modern Philly venue' },
  
  // Portland
  { id: 'crystal-ballroom', name: 'Crystal Ballroom', city: 'Portland', state: 'OR', description: 'Historic Portland venue' },
  
  // Detroit
  { id: 'masonic', name: 'Masonic Temple Theatre', city: 'Detroit', state: 'MI', description: 'Historic Detroit venue' },
  
  // Miami
  { id: 'fillmore-miami', name: 'The Fillmore Miami Beach', city: 'Miami Beach', state: 'FL', description: 'Art Deco venue' },
];

/**
 * Check if a venue is iconic by matching name and city
 */
export function isIconicVenue(venueName: string, venueCity: string, venueState?: string): boolean {
  const normalizedName = venueName.toLowerCase().trim();
  const normalizedCity = venueCity.toLowerCase().trim();
  const normalizedState = venueState?.toLowerCase().trim();
  
  return ICONIC_VENUES.some(venue => {
    const matchesName = venue.name.toLowerCase().trim() === normalizedName;
    const matchesCity = venue.city.toLowerCase().trim() === normalizedCity;
    const matchesState = !venue.state || !normalizedState || venue.state.toLowerCase().trim() === normalizedState;
    
    return matchesName && matchesCity && matchesState;
  });
}

/**
 * Get iconic venue by name and location
 */
export function getIconicVenue(venueName: string, venueCity: string, venueState?: string): IconicVenue | null {
  const normalizedName = venueName.toLowerCase().trim();
  const normalizedCity = venueCity.toLowerCase().trim();
  const normalizedState = venueState?.toLowerCase().trim();
  
  return ICONIC_VENUES.find(venue => {
    const matchesName = venue.name.toLowerCase().trim() === normalizedName;
    const matchesCity = venue.city.toLowerCase().trim() === normalizedCity;
    const matchesState = !venue.state || !normalizedState || venue.state.toLowerCase().trim() === normalizedState;
    
    return matchesName && matchesCity && matchesState;
  }) || null;
}




















