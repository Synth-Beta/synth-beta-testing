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
    return '/placeholder.svg';
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

