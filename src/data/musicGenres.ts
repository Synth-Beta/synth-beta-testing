/**
 * Curated list of music genres for user selection during onboarding
 * Used as a backup personalization method when Spotify is not connected
 */

export const MUSIC_GENRES = [
  // Core genres
  "Rock",
  "Pop",
  "Hip Hop",
  "Rap",
  "Electronic",
  "Jazz",
  "Classical",
  "Indie",
  "R&B",
  "Soul",
  "Country",
  "Metal",
  "Folk",
  "Punk",
  "Blues",
  "Reggae",
  
  // Electronic subgenres
  "EDM",
  "House",
  "Techno",
  "Dubstep",
  "Trance",
  "Drum & Bass",
  "Ambient",
  
  // Rock subgenres
  "Alternative",
  "Grunge",
  "Hard Rock",
  "Progressive Rock",
  "Psychedelic Rock",
  
  // Urban/Hip Hop
  "Trap",
  "Grime",
  "Afrobeat",
  
  // Dance/Club
  "Disco",
  "Funk",
  "Dance",
  
  // World/Regional
  "Latin",
  "Reggaeton",
  "K-Pop",
  "Salsa",
  "Bossa Nova",
  
  // Niche/Specialty
  "Gospel",
  "Bluegrass",
  "Ska",
  "Emo",
  "Screamo",
  "Shoegaze",
  "Post-Rock",
  "Industrial",
  "Experimental",
  "Lo-Fi",
  
  // Catch-all
  "Other"
] as const;

export type MusicGenre = typeof MUSIC_GENRES[number];

/**
 * Returns true if the given string is a valid predefined genre
 */
export function isValidGenre(genre: string): genre is MusicGenre {
  return MUSIC_GENRES.includes(genre as MusicGenre);
}

/**
 * Normalizes genre names for consistent storage
 */
export function normalizeGenre(genre: string): string {
  // Convert to title case and trim
  const normalized = genre.trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
}

