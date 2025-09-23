import {
  SpotifyUser,
  SpotifyTopTracksResponse,
  SpotifyTopArtistsResponse,
  SpotifyRecentlyPlayedResponse,
  SpotifyCurrentlyPlayingResponse,
  SpotifyAuthResponse,
  SpotifyTimeRange,
  SpotifyListeningStats,
  SpotifyAuthConfig,
  SpotifyTrack,
  SpotifyArtist
} from '@/types/spotify';

export class SpotifyService {
  private static instance: SpotifyService;
  private accessToken: string | null = null;
  private config: SpotifyAuthConfig;

  private constructor() {
    this.config = {
      clientId: '00c8ab88043a4d53bc3ec13684885ca9',
      redirectUri: import.meta.env.VITE_SPOTIFY_REDIRECT_URI || (typeof window !== 'undefined' ? `${window.location.origin}/auth/spotify/callback` : ''),
      scopes: [
        'user-read-private',
        'user-read-email',
        'user-top-read',
        'user-read-recently-played',
        'user-read-playback-state',
        'user-read-currently-playing'
      ]
    };
  }

  public static getInstance(): SpotifyService {
    if (!SpotifyService.instance) {
      SpotifyService.instance = new SpotifyService();
    }
    return SpotifyService.instance;
  }

  // Authentication methods
  public async authenticate(): Promise<void> {
    const state = this.generateRandomString(16);
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    
    localStorage.setItem('spotify_auth_state', state);
    localStorage.setItem('spotify_code_verifier', codeVerifier);

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('client_id', this.config.clientId);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', this.config.scopes.join(' '));
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('code_challenge', codeChallenge);

    window.location.href = authUrl.toString();
  }

  public async handleAuthCallback(): Promise<boolean> {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    if (error) {
      console.error('Authentication error:', error);
      throw new Error(`Authentication failed: ${error}`);
    }

    if (!code || !state) {
      return false;
    }

    const storedState = localStorage.getItem('spotify_auth_state');
    if (state !== storedState) {
      console.error('State mismatch');
      throw new Error('Authentication state mismatch');
    }

    await this.exchangeCodeForToken(code);
    
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
    
    return true;
  }

  public checkStoredToken(): boolean {
    const storedToken = localStorage.getItem('spotify_access_token');
    const tokenExpiry = localStorage.getItem('spotify_token_expiry');

    if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
      this.accessToken = storedToken;
      return true;
    }

    return false;
  }

  public isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  public logout(): void {
    this.accessToken = null;
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_token_expiry');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_auth_state');
    localStorage.removeItem('spotify_code_verifier');
  }

  private async exchangeCodeForToken(code: string): Promise<void> {
    const codeVerifier = localStorage.getItem('spotify_code_verifier');
    if (!codeVerifier) {
      throw new Error('Code verifier not found');
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.config.redirectUri,
        client_id: this.config.clientId,
        code_verifier: codeVerifier,
      }),
    });

    const data: SpotifyAuthResponse = await response.json();

    if (!response.ok) {
      throw new Error('Failed to exchange code for token');
    }

    if (data.access_token) {
      this.accessToken = data.access_token;
      const expiryTime = Date.now() + (data.expires_in * 1000);
      
      localStorage.setItem('spotify_access_token', data.access_token);
      localStorage.setItem('spotify_token_expiry', expiryTime.toString());
      
      if (data.refresh_token) {
        localStorage.setItem('spotify_refresh_token', data.refresh_token);
      }
    } else {
      throw new Error('No access token received');
    }
  }

  private async refreshToken(): Promise<boolean> {
    const refreshToken = localStorage.getItem('spotify_refresh_token');
    if (!refreshToken) {
      this.logout();
      return false;
    }

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.config.clientId,
        }),
      });

      const data: SpotifyAuthResponse = await response.json();

      if (data.access_token) {
        this.accessToken = data.access_token;
        const expiryTime = Date.now() + (data.expires_in * 1000);
        
        localStorage.setItem('spotify_access_token', data.access_token);
        localStorage.setItem('spotify_token_expiry', expiryTime.toString());
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  }

  // API methods
  private async spotifyApiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const url = `https://api.spotify.com/v1${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (response.status === 401) {
      // Token expired, try to refresh
      const refreshed = await this.refreshToken();
      if (refreshed) {
        // Retry the request with new token
        return this.spotifyApiCall<T>(endpoint, options);
      } else {
        this.logout();
        throw new Error('Authentication failed');
      }
    }

    if (response.status === 429) {
      // Rate limited - check for Retry-After header
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
      throw new Error(`Rate limited. Please try again in ${delay / 1000} seconds.`);
    }

    if (response.status === 403) {
      // Forbidden - likely missing scopes
      throw new Error('Access forbidden. Please reconnect with proper permissions.');
    }

    if (response.status === 404) {
      // Not found - endpoint doesn't exist or user has no data
      throw new Error('No data found. This might be because you haven\'t listened to enough music yet.');
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Spotify API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  public async getUserProfile(): Promise<SpotifyUser> {
    return this.spotifyApiCall<SpotifyUser>('/me');
  }

  public async getTopTracks(timeRange: SpotifyTimeRange = 'medium_term', limit: number = 20, offset: number = 0): Promise<SpotifyTopTracksResponse> {
    // Validate parameters according to API docs
    if (limit < 1 || limit > 50) {
      throw new Error('Limit must be between 1 and 50');
    }
    if (offset < 0) {
      throw new Error('Offset must be 0 or greater');
    }
    
    const params = new URLSearchParams({
      time_range: timeRange,
      limit: limit.toString(),
      offset: offset.toString()
    });
    
    return this.spotifyApiCall<SpotifyTopTracksResponse>(`/me/top/tracks?${params.toString()}`);
  }

  public async getTopArtists(timeRange: SpotifyTimeRange = 'medium_term', limit: number = 20, offset: number = 0): Promise<SpotifyTopArtistsResponse> {
    // Validate parameters according to API docs
    if (limit < 1 || limit > 50) {
      throw new Error('Limit must be between 1 and 50');
    }
    if (offset < 0) {
      throw new Error('Offset must be 0 or greater');
    }
    
    const params = new URLSearchParams({
      time_range: timeRange,
      limit: limit.toString(),
      offset: offset.toString()
    });
    
    return this.spotifyApiCall<SpotifyTopArtistsResponse>(`/me/top/artists?${params.toString()}`);
  }

  public async getRecentlyPlayed(limit: number = 20, after?: number, before?: number): Promise<SpotifyRecentlyPlayedResponse> {
    // Validate limit according to API docs (max 50)
    if (limit < 1 || limit > 50) {
      throw new Error('Limit must be between 1 and 50');
    }
    
    const params = new URLSearchParams({
      limit: limit.toString()
    });
    
    if (after !== undefined) {
      params.append('after', after.toString());
    }
    if (before !== undefined) {
      params.append('before', before.toString());
    }
    
    return this.spotifyApiCall<SpotifyRecentlyPlayedResponse>(`/me/player/recently-played?${params.toString()}`);
  }

  public async getCurrentPlayback(): Promise<SpotifyCurrentlyPlayingResponse | null> {
    try {
      return this.spotifyApiCall<SpotifyCurrentlyPlayingResponse>('/me/player');
    } catch (error) {
      // Player might not be active
      console.log('No active player found');
      return null;
    }
  }

  // Get all top items with pagination support
  public async getAllTopTracks(timeRange: SpotifyTimeRange = 'medium_term'): Promise<SpotifyTrack[]> {
    const allTracks: SpotifyTrack[] = [];
    let offset = 0;
    const limit = 50; // Maximum allowed by API
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.getTopTracks(timeRange, limit, offset);
        allTracks.push(...response.items);
        
        hasMore = response.next !== null;
        offset += limit;
      } catch (error) {
        console.error('Error fetching top tracks:', error);
        break;
      }
    }

    return allTracks;
  }

  public async getAllTopArtists(timeRange: SpotifyTimeRange = 'medium_term'): Promise<SpotifyArtist[]> {
    const allArtists: SpotifyArtist[] = [];
    let offset = 0;
    const limit = 50; // Maximum allowed by API
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.getTopArtists(timeRange, limit, offset);
        allArtists.push(...response.items);
        
        hasMore = response.next !== null;
        offset += limit;
      } catch (error) {
        console.error('Error fetching top artists:', error);
        break;
      }
    }

    return allArtists;
  }

  // Utility methods
  public calculateListeningStats(tracks: SpotifyTrack[], artists: SpotifyArtist[]): SpotifyListeningStats {
    const totalTracks = tracks.length;

    if (totalTracks === 0) {
      return {
        totalTracks: 0,
        uniqueArtists: 0,
        uniqueAlbums: 0,
        totalHours: 0,
        avgPopularity: 0,
        topGenres: []
      };
    }

    const uniqueArtists = new Set(tracks.flatMap(t => t.artists.map(a => a.id))).size;
    const uniqueAlbums = new Set(tracks.map(t => t.album.id)).size;
    const avgPopularity = Math.round(tracks.reduce((sum, t) => sum + t.popularity, 0) / totalTracks);

    // Calculate total duration
    const totalDurationMs = tracks.reduce((sum, track) => sum + track.duration_ms, 0);
    const totalHours = Math.round(totalDurationMs / (1000 * 60 * 60) * 10) / 10;

    // Get most common genres
    const genreCount: Record<string, number> = {};
    artists.forEach(artist => {
      artist.genres.forEach(genre => {
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
      avgPopularity,
      topGenres
    };
  }

  public formatDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins} minutes ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hours ago`;
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, Array.from(array)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}

export const spotifyService = SpotifyService.getInstance();
