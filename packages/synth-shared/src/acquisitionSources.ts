export const ACQUISITION_SOURCE_CANONICAL_ORDER = [
  'Friends or Family',
  'Instagram',
  'TikTok',
  'Youtube',
  'Threads',
  'Reddit',
  'LinkedIn',
  'Facebook',
  'X',
  'App Store',
  'Artist',
  'Venue',
  'Other',
] as const;

export type AcquisitionSource = (typeof ACQUISITION_SOURCE_CANONICAL_ORDER)[number];
