import {
  AppleMusicSong,
  AppleMusicArtist,
  AppleMusicAlbum,
  AppleMusicPlayHistoryObject,
  AppleMusicApiResponse,
  AppleMusicTimeRange,
  AppleMusicListeningStats,
  AppleMusicStorefront,
  MusicKitInstance
} from '@/types/appleMusic';
import {
  buildAppleMusicProfile,
  computeTopGenresFromArtistList,
  enrichProfileDataWithGenres,
} from '@synth/shared';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

class AppleMusicService {
  private developerToken: string = import.meta.env.VITE_APPLE_MUSIC_DEVELOPER_TOKEN || '';
  private musicKit: MusicKitInstance | null = null;
  private storefront: string = 'us';
  /** Resolves once musickit.js has loaded and been configured (or failed to). */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.loadMusicKit().catch((error) => {
      logger.warn('MusicKit failed to load:', error);
    });
  }

  // MusicKit persists the user token across reloads; a copy kept in a field was lost on
  // every refresh, so resync after a reload always failed with "User token required".
  private get userToken(): string | null {
    return this.musicKit?.isAuthorized ? this.musicKit.musicUserToken || null : null;
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
    const token = (this.developerToken || '').trim();
    if (!token) {
      logger.warn('Apple Music developer token not configured');
      return;
    }
    // Validate JWT-like format (3 base64 parts) to avoid "Invalid token" from MusicKit
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((p) => !p || p.length < 10)) {
      logger.warn('Apple Music developer token appears invalid (expected JWT format)');
      return;
    }

    try {
      window.MusicKit.configure({
        developerToken: token,
        app: {
          name: 'PlusOne Event Crew',
          build: '1.0.0'
        }
      });

      this.musicKit = window.MusicKit.getInstance();
    } catch (error) {
      logger.warn('MusicKit configuration failed (token may be expired):', error);
    }
  }

  // Authentication
  async authenticate(): Promise<void> {
    // Await only when MusicKit isn't configured yet: authorize() opens a popup, and Safari
    // blocks popups that aren't opened in the same task as the user's tap.
    if (!this.musicKit) await this.ready;
    if (!this.musicKit) {
      throw new Error('Apple Music is not available right now.');
    }

    await this.musicKit.authorize();
    if (!this.musicKit.isAuthorized) {
      throw new Error('Apple Music sign-in was not completed.');
    }
    await this.getUserStorefront();
  }

  checkStoredToken(): boolean {
    return Boolean(this.userToken);
  }

  logout(): void {
    this.musicKit?.unauthorize();
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

  // Library Data. Apple rejects library pages above 100 and recent tracks above 30 with a 400.
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
  async generateProfileData(): Promise<Record<string, unknown>> {
    if (!this.userToken) {
      throw new Error('Connect Apple Music first.');
    }

    const results = await Promise.allSettled([
      this.getHeavyRotation(),
      this.getRecentlyPlayed(30),
      this.getLibrarySongs(100),
    ]);
    for (const r of results) {
      if (r.status === 'rejected') logger.warn('Apple Music fetch failed:', r.reason);
    }
    const [heavyRotation, recentlyPlayed, library] = results.map((r) =>
      r.status === 'fulfilled' && Array.isArray(r.value?.data) ? r.value.data : []
    );

    const { topArtists, topTracks } = buildAppleMusicProfile({ heavyRotation, recentlyPlayed, library });

    if (topArtists.length === 0) {
      // Never overwrite a saved profile with an empty one — the triggers would wipe the
      // user's signals. Surface the real API error if there was one.
      const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      throw failure?.reason instanceof Error
        ? failure.reason
        : new Error('No Apple Music listening history found yet. Play some music in Apple Music, then sync again.');
    }

    return enrichProfileDataWithGenres({
      storefront: this.storefront,
      topArtists,
      topTracks,
      // Flat list for the apple-music genre trigger and older readers.
      topGenres: computeTopGenresFromArtistList(topArtists).map((g) => g.genre),
      lastUpdated: new Date().toISOString(),
    });
  }

  /**
   * Writes straight to streaming_profiles (RLS: own row), same as the Spotify web sync.
   * This used to POST to the Express backend, which prod never reached: no backend URL is
   * set on Vercel (so it hit join.getsynth.app/api/user/streaming-profile → 404), the request
   * had no bearer token (401 on the backend), and the backend capped payloads at 50KB.
   */
  async saveProfileData(profileData: Record<string, unknown>): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Sign in to Synth to sync Apple Music.');
    }

    const { error } = await supabase.from('streaming_profiles').upsert(
      {
        user_id: user.id,
        service_type: 'apple-music',
        profile_data: profileData,
        sync_status: 'completed',
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'user_id,service_type' }
    );
    if (error) {
      logger.error('Apple Music profile save failed:', error.code, error.message);
      throw new Error(
        error.code === '57014'
          ? 'Apple Music data loaded, but saving it timed out on our side. Try again in a minute.'
          : `Could not save Apple Music data: ${error.message} (${error.code})`
      );
    }

    // Dynamic import: streamingSyncActions imports this module.
    const { refreshFeedAfterStreamingSync } = await import('@/services/streamingSyncActions');
    await refreshFeedAfterStreamingSync(user.id);
  }

  /** Pull listening data from Apple Music and save it. Throws a user-facing message on failure. */
  async syncProfileData(): Promise<void> {
    await this.saveProfileData(await this.generateProfileData());
    this.markSyncCompleted();
  }

  markSyncCompleted(): void {
    localStorage.setItem('apple-music-last-sync', new Date().toISOString());
  }
}

export const appleMusicService = new AppleMusicService();
