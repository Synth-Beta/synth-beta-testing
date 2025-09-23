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

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  public async getUserProfile(): Promise<SpotifyUser> {
    return this.spotifyApiCall<SpotifyUser>('/me');
  }

  public async getTopTracks(timeRange: SpotifyTimeRange = 'short_term', limit: number = 20): Promise<SpotifyTopTracksResponse> {
    return this.spotifyApiCall<SpotifyTopTracksResponse>(`/me/top/tracks?time_range=${timeRange}&limit=${limit}`);
  }

  public async getTopArtists(timeRange: SpotifyTimeRange = 'short_term', limit: number = 20): Promise<SpotifyTopArtistsResponse> {
    return this.spotifyApiCall<SpotifyTopArtistsResponse>(`/me/top/artists?time_range=${timeRange}&limit=${limit}`);
  }

  public async getRecentlyPlayed(limit: number = 20): Promise<SpotifyRecentlyPlayedResponse> {
    return this.spotifyApiCall<SpotifyRecentlyPlayedResponse>(`/me/player/recently-played?limit=${limit}`);
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
