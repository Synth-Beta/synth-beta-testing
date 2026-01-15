import synthPlaceholderImage from '@/assets/Synth_Placeholder.png';

// JamBase placeholder image URL that should be replaced
const JAMBASE_PLACEHOLDER_URL = 'https://www.jambase.com/wp-content/uploads/2021/08/jambase-default-band-image-bw-1480x832.png';
const SYNTH_PLACEHOLDER_PATH = synthPlaceholderImage;

/**
 * Replace JamBase placeholder image URL with Synth placeholder
 * This should be called on any image URL before displaying or storing
 */
export function replaceJambasePlaceholder(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) {
    return null;
  }
  
  // Check if the URL matches the JamBase placeholder (case-insensitive, with or without protocol)
  if (imageUrl.includes('jambase-default-band-image-bw-1480x832.png') || 
      imageUrl === JAMBASE_PLACEHOLDER_URL ||
      imageUrl.includes('jambase.com/wp-content/uploads/2021/08/jambase-default-band-image-bw-1480x832.png')) {
    return SYNTH_PLACEHOLDER_PATH;
  }
  
  return imageUrl;
}

const EVENT_FALLBACK_IMAGES = [
  '/Generic Images/1.jpeg',
  '/Generic Images/2.jpeg',
  '/Generic Images/3.jpeg',
  '/Generic Images/4.jpeg',
  '/Generic Images/5.jpeg',
  '/Generic Images/6.jpg',
  '/Generic Images/7.jpg',
  '/Generic Images/8.jpg',
  '/Generic Images/9.webp',
  '/Generic Images/10.jpeg',
  '/Generic Images/11.jpeg',
  '/Generic Images/12.jpeg',
  '/Generic Images/13.jpeg',
  '/Generic Images/14.jpeg',
  '/Generic Images/15.jpeg',
  '/Generic Images/16.jpg',
  '/Generic Images/17.jpeg',
  '/Generic Images/18.jpeg',
  '/Generic Images/19.jpeg',
  '/Generic Images/20.jpeg'
] as const;

const fallbackImageCount = EVENT_FALLBACK_IMAGES.length;

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export function getFallbackEventImage(seed?: string): string {
  if (fallbackImageCount === 0) {
    return SYNTH_PLACEHOLDER_PATH;
  }

  if (!seed) {
    const randomIndex = Math.floor(Math.random() * fallbackImageCount);
    return encodeURI(EVENT_FALLBACK_IMAGES[randomIndex]);
  }

  const index = hashString(seed) % fallbackImageCount;
  return encodeURI(EVENT_FALLBACK_IMAGES[index]);
}

export function getAllFallbackEventImages(): readonly string[] {
  return EVENT_FALLBACK_IMAGES.map((image) => encodeURI(image));
}

