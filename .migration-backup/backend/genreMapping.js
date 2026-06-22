// Genre normalization for Ticketmaster API
// Maps Ticketmaster genres to our standardized genre system

// Map Ticketmaster genres to our standardized genre list
// Based on existing genres in user_genre_interactions
const GENRE_NORMALIZATION_MAP = {
  // Rock variants
  'Rock': 'Rock',
  'Alternative Rock': 'Alternative',
  'Indie Rock': 'Indie',
  'Hard Rock': 'Rock',
  'Classic Rock': 'Classic Rock',
  'Progressive Rock': 'Progressive Rock',
  'Punk': 'Punk',
  'Pop Punk': 'Pop Punk',
  
  // Pop variants
  'Pop': 'Pop',
  'Indie Pop': 'Indie Pop',
  'Synth-Pop': 'Synth Pop',
  'Pop Rock': 'Pop Rock',
  
  // Electronic variants
  'Electronic': 'Electronic',
  'Dance/Electronic': 'Electronic',
  'Techno': 'Techno',
  'House': 'House',
  'EDM': 'EDM',
  'Trance': 'Trance',
  'Dubstep': 'Dubstep',
  
  // Hip Hop variants
  'Hip-Hop/Rap': 'Hip Hop',
  'Rap': 'Hip Hop',
  'Trap': 'Hip Hop',
  
  // Country variants
  'Country': 'Country',
  'Alternative Country': 'Alt-Country',
  'Country Rock': 'Country Rock',
  
  // Metal variants
  'Metal': 'Metal',
  'Heavy Metal': 'Metal',
  'Death Metal': 'Metal',
  
  // Jazz variants
  'Jazz': 'Jazz',
  'Blues': 'Blues',
  'Soul': 'Soul',
  
  // R&B variants
  'R&B': 'R&B',
  'Contemporary R&B': 'R&B',
  
  // Other genres
  'Folk': 'Folk',
  'Reggae': 'Reggae',
  'Latin': 'Latin',
  'Classical': 'Classical',
  'World': 'World',
  'Gospel': 'Gospel',
  
  // Default fallback
  'Other': 'Other'
};

/**
 * Normalize a Ticketmaster genre to our standardized format
 * @param {string} ticketmasterGenre - Genre from Ticketmaster API
 * @returns {string} - Normalized genre name
 */
function normalizeGenre(ticketmasterGenre) {
  if (!ticketmasterGenre) return 'Other';
  
  // Direct match
  if (GENRE_NORMALIZATION_MAP[ticketmasterGenre]) {
    return GENRE_NORMALIZATION_MAP[ticketmasterGenre];
  }
  
  // Partial match
  const lowerGenre = ticketmasterGenre.toLowerCase();
  for (const [key, value] of Object.entries(GENRE_NORMALIZATION_MAP)) {
    if (lowerGenre.includes(key.toLowerCase())) {
      return value;
    }
  }
  
  // Return original if no match (will create new genre in system)
  return ticketmasterGenre;
}

/**
 * Extract and normalize genres from Ticketmaster event data
 * @param {object} ticketmasterEvent - Event data from Ticketmaster API
 * @returns {string[]} - Array of normalized genre names
 */
function extractGenres(ticketmasterEvent) {
  const genres = [];
  
  if (ticketmasterEvent.classifications && Array.isArray(ticketmasterEvent.classifications)) {
    for (const classification of ticketmasterEvent.classifications) {
      // Primary genre (most important)
      if (classification.genre?.name) {
        const normalized = normalizeGenre(classification.genre.name);
        if (normalized && !genres.includes(normalized)) {
          genres.push(normalized);
        }
      }
      
      // Sub-genre (secondary classification)
      if (classification.subGenre?.name) {
        const normalized = normalizeGenre(classification.subGenre.name);
        if (normalized && !genres.includes(normalized)) {
          genres.push(normalized);
        }
      }
    }
  }
  
  // If no genres found, return ['Other']
  return genres.length > 0 ? genres : ['Other'];
}

module.exports = { normalizeGenre, extractGenres, GENRE_NORMALIZATION_MAP };

