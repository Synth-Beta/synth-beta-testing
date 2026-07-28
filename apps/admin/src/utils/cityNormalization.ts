/**
 * Utility functions for normalizing city names to handle variations
 * and non-standard data formats
 */

/**
 * Normalize city names to handle common variations and abbreviations
 * @param city - The city name to normalize
 * @returns Normalized city name
 */
export const normalizeCityName = (city: string): string => {
  return city
    .toLowerCase()
    .trim()
    // Handle common abbreviations and variations
    .replace(/\bdc\b/g, 'district of columbia')
    .replace(/\bd\.c\.\b/g, 'district of columbia')
    .replace(/\bd c\b/g, 'district of columbia')
    .replace(/\bny\b/g, 'new york')
    .replace(/\bn\.y\.\b/g, 'new york')
    .replace(/\bnyc\b/g, 'new york city')
    .replace(/\bla\b/g, 'los angeles')
    .replace(/\bl\.a\.\b/g, 'los angeles')
    .replace(/\bsf\b/g, 'san francisco')
    .replace(/\bs\.f\.\b/g, 'san francisco')
    .replace(/\bchi\b/g, 'chicago')
    .replace(/\bchi\.\b/g, 'chicago')
    .replace(/\bmia\b/g, 'miami')
    .replace(/\bmia\.\b/g, 'miami')
    .replace(/\bsea\b/g, 'seattle')
    .replace(/\bsea\.\b/g, 'seattle')
    .replace(/\bphx\b/g, 'phoenix')
    .replace(/\bphx\.\b/g, 'phoenix')
    .replace(/\bden\b/g, 'denver')
    .replace(/\bden\.\b/g, 'denver')
    .replace(/\bvegas\b/g, 'las vegas')
    .replace(/\blv\b/g, 'las vegas')
    .replace(/\bl\.v\.\b/g, 'las vegas')
    // Remove extra spaces and punctuation
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
};

/**
 * Get the canonical (most common) version of a city name from variations
 * @param cityVariations - Array of city name variations
 * @returns The canonical city name
 */
export const getCanonicalCityName = (cityVariations: string[]): string => {
  // Special handling for common city variations
  const normalizedVariations = cityVariations.map(city => normalizeCityName(city));
  
  // Check for Washington DC variations
  if (normalizedVariations.some(city => city.includes('washington') && city.includes('district of columbia'))) {
    // Prefer "Washington DC" over other variations
    const washingtonDC = cityVariations.find(city => 
      city.toLowerCase().includes('washington') && 
      (city.toLowerCase().includes('dc') || city.toLowerCase().includes('d.c.') || city.toLowerCase().includes('d c'))
    );
    if (washingtonDC) return washingtonDC;
  }
  
  // Check for New York variations
  if (normalizedVariations.some(city => city.includes('new york'))) {
    const nyc = cityVariations.find(city => city.toLowerCase().includes('nyc'));
    if (nyc) return nyc;
    const newYork = cityVariations.find(city => city.toLowerCase().includes('new york'));
    if (newYork) return newYork;
  }
  
  // Check for Los Angeles variations
  if (normalizedVariations.some(city => city.includes('los angeles'))) {
    const la = cityVariations.find(city => city.toLowerCase().includes('los angeles'));
    if (la) return la;
  }
  
  // Default: Sort by length (prefer shorter, cleaner names) then alphabetically
  return cityVariations.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  })[0];
};

/**
 * Check if two city names are the same after normalization
 * @param city1 - First city name
 * @param city2 - Second city name
 * @returns True if cities are the same after normalization
 */
export const areCitiesEqual = (city1: string, city2: string): boolean => {
  return normalizeCityName(city1) === normalizeCityName(city2);
};

/**
 * Group city variations by their normalized form
 * @param cities - Array of city names
 * @returns Map of normalized city name to array of variations
 */
export const groupCityVariations = (cities: string[]): Map<string, string[]> => {
  const groups = new Map<string, string[]>();
  
  cities.forEach(city => {
    const normalized = normalizeCityName(city);
    if (!groups.has(normalized)) {
      groups.set(normalized, []);
    }
    groups.get(normalized)!.push(city);
  });
  
  return groups;
};

/**
 * Find similar city names based on normalized matching
 * @param searchQuery - The search query
 * @param cities - Array of city names to search through
 * @returns Array of matching city names
 */
export const findSimilarCities = (searchQuery: string, cities: string[]): string[] => {
  const normalizedQuery = normalizeCityName(searchQuery);
  
  return cities.filter(city => {
    const normalizedCity = normalizeCityName(city);
    return normalizedCity.includes(normalizedQuery) || 
           normalizedQuery.includes(normalizedCity);
  });
};
