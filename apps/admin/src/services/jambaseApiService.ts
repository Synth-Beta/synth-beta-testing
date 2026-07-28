// JamBase API service for artist and venue data
// This service provides the types and interfaces needed by artistVenueService

export interface JamBaseArtist {
  identifier: string;
  name: string;
  url?: string;
  imageUrl?: string;
  datePublished?: string;
  dateModified?: string;
}

export interface JamBaseVenue {
  identifier: string;
  name: string;
  url?: string;
  imageUrl?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  datePublished?: string;
  dateModified?: string;
}
