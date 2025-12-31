import {
  AppleMusicUser,
  AppleMusicSong,
  AppleMusicArtist,
  AppleMusicAlbum,
  AppleMusicPlayHistoryObject,
  AppleMusicApiResponse,
  AppleMusicTimeRange,
  AppleMusicListeningStats,
  AppleMusicStorefront,
  AppleMusicLibraryStats,
  AppleMusicProfileData,
  AppleMusicPlaylist,
  AppleMusicReplayData,
  AppleMusicChartsResponse,
  MusicKitInstance
} from '@/types/appleMusic';
import { UserStreamingStatsService } from '@/services/userStreamingStatsService';

class AppleMusicService {
  private developerToken: string = import.meta.env.VITE_APPLE_MUSIC_DEVELOPER_TOKEN || '';
  private musicKit: MusicKitInstance | null = null;
  private userToken: string | null = null;
  private storefront: string = 'us';

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadMusicKit();
  }

  private async loadMusicKit(): Promise<void> {
    if (typeof window === 'undefined') return;

    if (!window.MusicKit) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://js-cdn.music.apple.com/musickit/v1/musickit.js';
        script.onload = () => {
          this.configureMusicKit();
          resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    } else {
      this.configureMusicKit();
    }
  }

  private configureMusicKit() {
    if (!this.developerToken) {
      console.warn('Apple Music developer token not configured');
      return;
    }

    try {
      window.MusicKit.configure({
        developerToken: this.developerToken,
        app: {
          name: 'PlusOne Event Crew',
          build: '1.0.0'
        }
      });

      this.musicKit = window.MusicKit.getInstance();
    } catch (error) {
      console.error('MusicKit configuration error:', error);
    }
  }

  // Authentication
  async authenticate(): Promise<void> {
    if (!this.musicKit) {
      throw new Error('MusicKit not initialized');
    }

    await this.musicKit.authorize();
    
    if (this.musicKit.isAuthorized) {
      this.userToken = this.musicKit.musicUserToken;
      await this.getUserStorefront();
      
      // Auto-sync profile data after successful authentication
      setTimeout(() => {
        this.autoSync().catch(console.error);
      }, 2000); // Wait 2 seconds to let UI update first
    }
  }

  checkStoredToken(): boolean {
    return this.musicKit?.isAuthorized || false;
  }

  logout(): void {
    if (this.musicKit) {
      this.musicKit.unauthorize();
    }
    this.userToken = null;
  }

  // API Calls
  private async appleMusicApiCall<T>(endpoint: string, options: RequestInit = {}): Promise<AppleMusicApiResponse<T>> {
    if (!this.userToken && !endpoint.includes('/catalog/')) {
      throw new Error('User token required for library access');
    }

    const baseUrl = 'https://api.music.apple.com/v1';
    const url = `${baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.developerToken}`,
      'Content-Type': 'application/json'
    };

    if (this.userToken && !endpoint.includes('/catalog/')) {
      headers['Music-User-Token'] = this.userToken;
    }

    const response = await fetch(url, {
      headers,
      ...options
    });

    if (!response.ok) {
      throw new Error(`Apple Music API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // User Profile
  async getUserStorefront(): Promise<AppleMusicStorefront | null> {
    try {
      const response = await this.appleMusicApiCall<AppleMusicStorefront>('/me/storefront');
      if (response.data && response.data.length > 0) {
        this.storefront = response.data[0].id;
        return response.data[0];
      }
      return null;
    } catch (error) {
      console.error('Error getting user storefront:', error);
      return null;
    }
  }

  // Library Data
  async getLibrarySongs(limit: number = 100): Promise<AppleMusicApiResponse<AppleMusicSong>> {
    return this.appleMusicApiCall<AppleMusicSong>(`/me/library/songs?limit=${limit}`);
  }

  async getLibraryArtists(limit: number = 100): Promise<AppleMusicApiResponse<AppleMusicArtist>> {
    return this.appleMusicApiCall<AppleMusicArtist>(`/me/library/artists?limit=${limit}`);
  }

  async getLibraryAlbums(limit: number = 100): Promise<AppleMusicApiResponse<AppleMusicAlbum>> {
    return this.appleMusicApiCall<AppleMusicAlbum>(`/me/library/albums?limit=${limit}`);
  }

  async getRecentlyPlayed(limit: number = 30): Promise<AppleMusicApiResponse<AppleMusicPlayHistoryObject>> {
    return this.appleMusicApiCall<AppleMusicPlayHistoryObject>(`/me/recent/played/tracks?limit=${limit}`);
  }

  // Enhanced API Methods
  async getReplayData(): Promise<any | null> {
    try {
      // Get the user's replay data for the latest eligible year
      return this.appleMusicApiCall('/me/library/replay');
    } catch (error) {
      console.log('Replay data not available or accessible');
      return null;
    }
  }

  async getHeavyRotation(): Promise<any | null> {
    try {
      return this.appleMusicApiCall('/me/history/heavy-rotation');
    } catch (error) {
      console.log('Heavy rotation data not available');
      return null;
    }
  }

  async getRecommendations(): Promise<any | null> {
    try {
      return this.appleMusicApiCall('/me/recommendations');
    } catch (error) {
      console.log('Recommendations not available');
      return null;
    }
  }

  async getCharts(types: string = 'songs,albums,artists', limit: number = 20): Promise<any> {
    return this.appleMusicApiCall(`/catalog/${this.storefront}/charts?types=${types}&limit=${limit}`);
  }

  async getLibraryPlaylist(limit: number = 100): Promise<any> {
    try {
      return this.appleMusicApiCall(`/me/library/playlists?limit=${limit}`);
    } catch (error) {
      console.log('Library playlists not available');
      return null;
    }
  }

  async getLibraryStats(): Promise<AppleMusicLibraryStats | null> {
    try {
      // Get comprehensive library statistics
      const [songsResponse, artistsResponse, albumsResponse, playlistsResponse] = await Promise.allSettled([
        this.getLibrarySongs(1000),
        this.getLibraryArtists(1000), 
        this.getLibraryAlbums(1000),
        this.getLibraryPlaylist(1000)
      ]);

      const songs = songsResponse.status === 'fulfilled' ? songsResponse.value.data : [] as AppleMusicSong[];
      const artists = artistsResponse.status === 'fulfilled' ? artistsResponse.value.data : [] as AppleMusicArtist[];
      const albums = albumsResponse.status === 'fulfilled' ? albumsResponse.value.data : [] as AppleMusicAlbum[];
      const playlists = playlistsResponse.status === 'fulfilled' ? playlistsResponse.value.data : [] as AppleMusicPlaylist[];

      const libraryStats: AppleMusicLibraryStats = {
        totalSongs: songs.length,
        totalArtists: artists.length,
        totalAlbums: albums.length,
        totalPlaylists: playlists.length,
        songs,
        artists,
        albums,
        playlists
      };

      return libraryStats;
    } catch (error) {
      console.error('Error getting library stats:', error);
      return null;
    }
  }

  // Process library data based on time period
  processLibraryData<T>(data: T[], period: AppleMusicTimeRange): T[] {
    if (!data || !Array.isArray(data)) return [];

    let processedData = [...data];

    switch (period) {
      case 'last-week':
        processedData = data.slice(0, 20);
        break;
      case 'last-month':
        processedData = data.slice(0, 30);
        break;
      case 'last-6-months':
        processedData = data.slice(0, 50);
        break;
      default:
        processedData = data.slice(0, 20);
    }

    return processedData;
  }

  // Calculate listening statistics
  calculateListeningStats(
    songs: AppleMusicSong[],
    artists: AppleMusicArtist[]
  ): AppleMusicListeningStats {
    const totalTracks = songs.length;
    const uniqueArtists = artists.length;
    
    // Calculate unique albums from songs
    const albumSet = new Set<string>();
    songs.forEach(song => {
      if (song.attributes.albumName) {
        albumSet.add(song.attributes.albumName);
      }
    });
    const uniqueAlbums = albumSet.size;

    // Calculate total duration
    const totalDurationMs = songs.reduce((sum, song) => {
      return sum + (song.attributes.durationInMillis || 0);
    }, 0);
    const totalHours = Math.round(totalDurationMs / (1000 * 60 * 60) * 10) / 10;

    // Calculate average duration
    const avgDuration = totalTracks > 0 ? Math.round(totalDurationMs / totalTracks / 1000) : 0;

    // Get top genres
    const genreCount: Record<string, number> = {};
    [...songs, ...artists].forEach(item => {
      const genres = item.attributes.genreNames || [];
      genres.forEach(genre => {
        genreCount[genre] = (genreCount[genre] || 0) + 1;
      });
    });

    const topGenres = Object.entries(genreCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([genre]) => genre);

    return {
      totalTracks,
      uniqueArtists,
      uniqueAlbums,
      totalHours,
      avgDuration,
      topGenres
    };
  }

  // Utility functions
  formatDuration(durationMs: number): string {
    if (!durationMs) return '';
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  formatDate(date: Date): string {
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)} hours ago`;
    } else if (diffInHours < 168) { // 7 days
      return `${Math.floor(diffInHours / 24)} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  // Get artwork URL with specific dimensions
  getArtworkUrl(artwork: { url: string } | undefined, width: number = 300, height: number = 300): string {
    if (!artwork?.url) return '';
    return artwork.url.replace('{w}', width.toString()).replace('{h}', height.toString());
  }

  // Profile Data Management
  async generateProfileData(): Promise<AppleMusicProfileData | null> {
    try {
      if (!this.userToken) {
        throw new Error('User not authenticated');
      }

      // Get comprehensive library stats
      const libraryStats = await this.getLibraryStats();
      if (!libraryStats) {
        throw new Error('Failed to get library stats');
      }

      // Get additional data
      const [recentResponse, storefrontResponse] = await Promise.allSettled([
        this.getRecentlyPlayed(50),
        this.getUserStorefront()
      ]);

      const recentTracks = recentResponse.status === 'fulfilled' ? recentResponse.value.data : [] as AppleMusicPlayHistoryObject[];
      const storefront = storefrontResponse.status === 'fulfilled' ? storefrontResponse.value : null;

      // Calculate listening statistics
      const listeningStats = this.calculateListeningStats(libraryStats.songs, libraryStats.artists);

      // Get top items based on library (since Apple Music doesn't provide play counts)
      const topTracks = this.processLibraryData(libraryStats.songs, 'last-month').slice(0, 20) as AppleMusicSong[];
      const topArtists = this.processLibraryData(libraryStats.artists, 'last-month').slice(0, 20) as AppleMusicArtist[];
      const topAlbums = this.processLibraryData(libraryStats.albums, 'last-month').slice(0, 20) as AppleMusicAlbum[];

      const profileData: AppleMusicProfileData = {
        storefront: storefront?.id || 'us',
        libraryStats,
        topTracks,
        topArtists,
        topAlbums,
        recentlyPlayed: recentTracks,
        topGenres: listeningStats.topGenres,
        listeningTime: listeningStats.totalHours,
        lastUpdated: new Date().toISOString()
      };

      return profileData;
    } catch (error) {
      console.error('Error generating profile data:', error);
      return null;
    }
  }

  // Upload profile data to backend
  async uploadProfileData(profileData: AppleMusicProfileData): Promise<boolean> {
    try {
      // Get current user ID if available
      const userId = await this.getCurrentUserId();
      
      const backendUrl =
        import.meta.env.VITE_BACKEND_URL ||
        import.meta.env.VITE_API_BASE_URL ||
        (typeof window !== 'undefined' ? window.location.origin : '');
      const response = await fetch(`${backendUrl}/api/user/streaming-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service: 'apple-music',
          data: profileData,
          userId: userId || 'anonymous'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`);
      }

      const result = await response.json();
      console.log('Profile data uploaded successfully:', result);

      // Also store stats permanently in user_streaming_stats_summary
      try {
        const userId = await this.getCurrentUserId();
        if (userId && profileData) {
          const topArtists = profileData.topArtists || [];
          const topGenres = profileData.topGenres || [];
          
          // Create stats summary
          const statsInsert = {
            user_id: userId,
            service_type: 'apple-music' as const,
            top_artists: topArtists.map((artist: any) => ({
              name: artist.name || artist.attributes?.name || '',
              popularity: artist.popularity || 0,
              id: artist.id
            })),
            top_genres: topGenres.map((genre: any) => ({
              genre: typeof genre === 'string' ? genre : genre.genre || '',
              count: typeof genre === 'string' ? 1 : genre.count || 1
            })),
            total_tracks: profileData.totalTracks || 0,
            unique_artists: topArtists.length,
            total_listening_hours: profileData.totalListeningHours || 0
          };

          // Database table removed - stats are no longer persisted
          console.log('⚠️ Stats table removed - stats not persisted');

          // Notify sync service that sync completed (only if sync is being tracked)
          try {
            const { streamingSyncService } = await import('@/services/streamingSyncService');
            if (streamingSyncService.isSyncing()) {
              streamingSyncService.completeSync();
            }
          } catch (importError) {
            console.warn('Could not notify sync service:', importError);
          }
        }
      } catch (statsError) {
        console.error('Error storing Apple Music stats:', statsError);
        // Notify sync service of error
        try {
          const { streamingSyncService } = await import('@/services/streamingSyncService');
          streamingSyncService.errorSync(statsError instanceof Error ? statsError.message : 'Unknown error');
        } catch (importError) {
          console.warn('Could not notify sync service of error:', importError);
        }
        // Don't fail the whole upload if stats storage fails
      }

      return true;
    } catch (error) {
      console.error('Error uploading profile data:', error);
      return false;
    }
  }

  // Get current user ID from Supabase auth
  private async getCurrentUserId(): Promise<string | null> {
    try {
      // Import Supabase client dynamically to avoid circular dependencies
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id || null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  // Auto-sync profile data
  async syncProfileData(): Promise<boolean> {
    try {
      const profileData = await this.generateProfileData();
      if (!profileData) {
        return false;
      }

      return await this.uploadProfileData(profileData);
    } catch (error) {
      console.error('Error syncing profile data:', error);
      return false;
    }
  }

  // Check if user should sync (e.g., daily)
  shouldSync(): boolean {
    const lastSync = localStorage.getItem('apple-music-last-sync');
    if (!lastSync) return true;

    const lastSyncDate = new Date(lastSync);
    const now = new Date();
    const hoursSinceSync = (now.getTime() - lastSyncDate.getTime()) / (1000 * 60 * 60);

    // Sync every 24 hours
    return hoursSinceSync >= 24;
  }

  // Mark sync as completed
  markSyncCompleted(): void {
    localStorage.setItem('apple-music-last-sync', new Date().toISOString());
  }

  // Auto-sync wrapper with throttling
  async autoSync(): Promise<void> {
    if (!this.shouldSync()) {
      console.log('Apple Music profile sync not needed yet');
      return;
    }

    console.log('Starting Apple Music profile sync...');
    const success = await this.syncProfileData();
    
    if (success) {
      this.markSyncCompleted();
      console.log('Apple Music profile sync completed successfully');
    } else {
      console.log('Apple Music profile sync failed');
    }
  }
}

export const appleMusicService = new AppleMusicService();
