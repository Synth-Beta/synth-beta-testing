/**
 * Utility functions for currency formatting
 */

/**
 * Format a price string to ensure it has a dollar sign
 * @param price - The price string (e.g., "50-150", "$50-$150", "50", "$50")
 * @returns Formatted price string with dollar signs
 */
export function formatPrice(price: string | null | undefined): string {
  if (!price) return '';
  
  // If it already starts with $, return as is
  if (price.startsWith('$')) {
    return price;
  }
  
  // If it contains a range (e.g., "50-150")
  if (price.includes('-')) {
    const [min, max] = price.split('-');
    return `$${min.trim()}-$${max.trim()}`;
  }
  
  // If it's a single number
  return `$${price.trim()}`;
}

/**
 * Format a price range for display
 * @param minPrice - Minimum price
 * @param maxPrice - Maximum price
 * @returns Formatted price range string
 */
export function formatPriceRange(minPrice: number | string, maxPrice: number | string): string {
  const min = typeof minPrice === 'string' ? minPrice : minPrice.toString();
  const max = typeof maxPrice === 'string' ? maxPrice : maxPrice.toString();
  
  if (min === max) {
    return `$${min}`;
  }
  
  return `$${min}-$${max}`;
}

/**
 * Extract numeric value from a price string for sorting/comparison
 * @param price - The price string
 * @returns Numeric value (first number found)
 */
export function extractNumericPrice(price: string | null | undefined): number {
  if (!price) return 0;
  
  const match = price.match(/\$?(\d+)/);
  return match ? parseInt(match[1]) : 0;
}
