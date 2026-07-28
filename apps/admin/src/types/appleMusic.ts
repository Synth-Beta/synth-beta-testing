// Apple Music API Types
export interface AppleMusicUser {
  id: string;
  type: 'users';
  attributes: {
    name: string;
  };
}

export interface AppleMusicStorefront {
  id: string;
  type: 'storefronts';
  attributes: {
    name: string;
    supportedLanguageTags: string[];
    defaultLanguageTag: string;
    explicitContentPolicy: string;
  };
}

export interface AppleMusicArtwork {
  width: number;
  height: number;
  url: string;
  bgColor?: string;
  textColor1?: string;
  textColor2?: string;
  textColor3?: string;
  textColor4?: string;
}

export interface AppleMusicSong {
  id: string;
  type: 'songs' | 'library-songs';
  attributes: {
    name: string;
    artistName: string;
    albumName: string;
    durationInMillis: number;
    releaseDate?: string;
    genreNames?: string[];
    artwork?: AppleMusicArtwork;
    playParams?: {
      id: string;
      kind: string;
    };
    url?: string;
  };
}

export interface AppleMusicArtist {
  id: string;
  type: 'artists' | 'library-artists';
  attributes: {
    name: string;
    genreNames?: string[];
    artwork?: AppleMusicArtwork;
    url?: string;
  };
}

export interface AppleMusicAlbum {
  id: string;
  type: 'albums' | 'library-albums';
  attributes: {
    name: string;
    artistName: string;
    releaseDate?: string;
    trackCount: number;
    genreNames?: string[];
    artwork?: AppleMusicArtwork;
    url?: string;
  };
}

export interface AppleMusicPlayHistoryObject {
  id: string;
  type: 'songs';
  attributes: AppleMusicSong['attributes'];
  meta?: {
    playedAt?: string;
  };
}

export interface AppleMusicApiResponse<T> {
  data: T[];
  meta?: {
    total?: number;
  };
  next?: string;
}

export type AppleMusicTimeRange = 'last-week' | 'last-month' | 'last-6-months';

export interface AppleMusicListeningStats {
  totalTracks: number;
  uniqueArtists: number;
  uniqueAlbums: number;
  totalHours: number;
  avgDuration: number;
  topGenres: string[];
}

// Extended types for comprehensive API coverage
export interface AppleMusicPlaylist {
  id: string;
  type: 'playlists' | 'library-playlists';
  attributes: {
    name: string;
    description?: string;
    curatorName?: string;
    artwork?: AppleMusicArtwork;
    trackCount: number;
    playParams?: {
      id: string;
      kind: string;
    };
    url?: string;
    dateAdded?: string;
    lastModifiedDate?: string;
  };
}

export interface AppleMusicReplayData {
  id: string;
  type: 'personal-recommendation';
  attributes: {
    title: string;
    subtitle?: string;
    description?: string;
    artwork?: AppleMusicArtwork;
    year: number;
    data: {
      topSongs?: AppleMusicSong[];
      topArtists?: AppleMusicArtist[];
      topAlbums?: AppleMusicAlbum[];
      totalPlayTime?: number;
      totalSongs?: number;
    };
  };
}

export interface AppleMusicChartResponse {
  chart: string;
  name: string;
  data: AppleMusicSong[] | AppleMusicArtist[] | AppleMusicAlbum[];
  href?: string;
  next?: string;
}

export interface AppleMusicChartsResponse {
  songs?: AppleMusicChartResponse[];
  albums?: AppleMusicChartResponse[];
  artists?: AppleMusicChartResponse[];
}

export interface AppleMusicHeavyRotation {
  data: AppleMusicSong[];
  meta?: {
    total?: number;
  };
}

export interface AppleMusicRecommendations {
  data: {
    id: string;
    type: 'personal-recommendation';
    attributes: {
      title: string;
      reason?: string;
      resourceTypes: string[];
      nextUpdateDate?: string;
    };
    relationships?: {
      contents: {
        data: (AppleMusicSong | AppleMusicArtist | AppleMusicAlbum | AppleMusicPlaylist)[];
      };
    };
  }[];
}

// Configuration
export interface AppleMusicConfig {
  developerToken: string;
  app: {
    name: string;
    build: string;
  };
}

// MusicKit types (from Apple's MusicKit JS)
declare global {
  interface Window {
    MusicKit: any;
  }
}

export interface MusicKitInstance {
  configure(config: AppleMusicConfig): void;
  getInstance(): MusicKitInstance;
  authorize(): Promise<string>;
  unauthorize(): void;
  isAuthorized: boolean;
  musicUserToken: string;
  play?(options?: any): Promise<void>;
  pause?(): void;
  stop?(): void;
  skipToNextItem?(): Promise<void>;
  skipToPreviousItem?(): Promise<void>;
  seekToTime?(time: number): Promise<void>;
  queue?: {
    items: any[];
    position: number;
  };
}

// Enhanced library stats interface
export interface AppleMusicLibraryStats {
  totalSongs: number;
  totalArtists: number;
  totalAlbums: number;
  totalPlaylists: number;
  songs: AppleMusicSong[];
  artists: AppleMusicArtist[];
  albums: AppleMusicAlbum[];
  playlists: AppleMusicPlaylist[];
}

// Profile data structure for automatic upload
export interface AppleMusicProfileData {
  userId?: string;
  storefront: string;
  libraryStats: AppleMusicLibraryStats;
  topTracks: AppleMusicSong[];
  topArtists: AppleMusicArtist[];
  topAlbums: AppleMusicAlbum[];
  recentlyPlayed: AppleMusicPlayHistoryObject[];
  topGenres: string[];
  listeningTime: number;
  lastUpdated: string;
}
