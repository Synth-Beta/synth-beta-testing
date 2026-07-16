export const ACQUISITION_SOURCE_CANONICAL_ORDER = [
  'Friends or Family',
  'Instagram',
  'TikTok',
  'Reddit',
  'LinkedIn',
  'Facebook',
  'App Store',
  'Artist',
  'Venue',
  'Other',
] as const;

export type AcquisitionSource = (typeof ACQUISITION_SOURCE_CANONICAL_ORDER)[number];
