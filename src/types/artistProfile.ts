// Type definitions for artist profile data from JamBase API

export interface ExternalIdentifier {
  source: string;
  identifier: string;
}

export interface SameAsLink {
  '@type': 'URL';
  identifier: string;
  url: string;
}

export interface ArtistMember {
  type: 'MusicGroup' | 'Person';
  name: string;
  identifier: string;
  image?: string;
  url?: string;
}

export interface FoundingLocation {
  '@type': 'Place';
  name: string;
}

export interface JamBaseArtistResponse {
  success: boolean;
  artist: {
    name: string;
    identifier: string;
    url?: string;
    image?: string;
    sameAs?: SameAsLink[];
    datePublished?: string;
    dateModified?: string;
    '@type': 'MusicGroup' | 'Person';
    member?: ArtistMember[];
    memberOf?: ArtistMember[];
    foundingLocation?: FoundingLocation;
    foundingDate?: string;
    genre?: string[];
    events?: any[]; // Event data can be complex, keeping as any for now
    'x-bandOrMusician'?: 'band' | 'musician';
    'x-numUpcomingEvents'?: number;
    'x-externalIdentifiers'?: ExternalIdentifier[];
  };
}

export interface ArtistProfile {
  id: string;
  jambase_artist_id: string;
  artist_data_source: 'axs' | 'dice' | 'etix' | 'eventbrite' | 'eventim-de' | 'jambase' | 'seated' | 'seatgeek' | 'spotify' | 'ticketmaster' | 'viagogo' | 'musicbrainz';
  name: string;
  identifier: string;
  url?: string;
  image_url?: string;
  date_published?: string;
  date_modified?: string;
  artist_type?: 'MusicGroup' | 'Person';
  band_or_musician?: 'band' | 'musician';
  founding_location?: string;
  founding_date?: string;
  genres?: string[];
  members?: ArtistMember[];
  member_of?: ArtistMember[];
  external_identifiers?: ExternalIdentifier[];
  same_as?: SameAsLink[];
  num_upcoming_events: number;
  raw_jambase_data?: JamBaseArtistResponse;
  created_at: string;
  updated_at: string;
  last_synced_at?: string;
}

export interface ArtistProfileSummary {
  id: string;
  jambase_artist_id: string;
  name: string;
  identifier: string;
  url?: string;
  image_url?: string;
  artist_type?: 'MusicGroup' | 'Person';
  band_or_musician?: 'band' | 'musician';
  founding_location?: string;
  founding_date?: string;
  genres?: string[];
  num_upcoming_events: number;
  created_at: string;
  updated_at: string;
  last_synced_at?: string;
}

// Helper function to transform JamBase API response to our database format
export function transformJamBaseArtistToProfile(
  jambaseResponse: JamBaseArtistResponse,
  artistDataSource: string = 'jambase'
): Partial<ArtistProfile> {
  const artist = jambaseResponse.artist;
  
  return {
    jambase_artist_id: artist.identifier.split(':')[1] || artist.identifier,
    artist_data_source: artistDataSource as ArtistProfile['artist_data_source'],
    name: artist.name,
    identifier: artist.identifier,
    url: artist.url,
    image_url: artist.image,
    date_published: artist.datePublished,
    date_modified: artist.dateModified,
    artist_type: artist['@type'],
    band_or_musician: artist['x-bandOrMusician'],
    founding_location: artist.foundingLocation?.name,
    founding_date: artist.foundingDate,
    genres: artist.genre,
    members: artist.member,
    member_of: artist.memberOf,
    external_identifiers: artist['x-externalIdentifiers'],
    same_as: artist.sameAs,
    num_upcoming_events: artist['x-numUpcomingEvents'] || 0,
    raw_jambase_data: jambaseResponse,
  };
}
