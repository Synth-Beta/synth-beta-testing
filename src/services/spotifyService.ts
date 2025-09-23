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
      clientSecret: '0c8ae2f4f5b54f1bb5b00511f7da52ad', // For development mode
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
  public authenticate(): void {
    const state = this.generateRandomString(16);
    localStorage.setItem('spotify_auth_state', state);

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('client_id', this.config.clientId);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', this.config.scopes.join(' '));

    console.log('🚀 Starting Spotify authentication...');
    console.log('📋 Requesting scopes:', this.config.scopes);
    console.log('🔗 Redirect URI:', this.config.redirectUri);
    console.log('🆔 Client ID:', this.config.clientId);
    console.log('🔐 Using client secret flow (development mode)');
    console.log('🌐 Full auth URL:', authUrl.toString());
    
    window.location.href = authUrl.toString();
  }

  public reauthenticate(): void {
    // Clear existing tokens and force re-auth
    console.log('🔄 Forcing re-authentication...');
    this.logout();
    this.authenticate();
  }

  public async validateTokenAndReauthIfNeeded(): Promise<boolean> {
    if (!this.accessToken) {
      console.log('❌ No access token available');
      return false;
    }

    try {
      // Try to get user profile to test basic scopes
      console.log('🔍 Validating token scopes...');
      await this.spotifyApiCall<SpotifyUser>('/me');
      console.log('✅ Token validation successful');
      return true;
    } catch (error) {
      console.error('❌ Token validation failed:', error);
      
      if (error instanceof Error && error.message.includes('403')) {
        console.log('🚨 Token has insufficient scopes, clearing old token and forcing re-authentication...');
        this.clearStoredData();
        this.reauthenticate();
        return false; // Will redirect, so return false
      }
      
      throw error;
    }
  }

  public async handleAuthCallback(): Promise<boolean> {
    console.log('🔄 Handling Spotify auth callback...');
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    console.log('📥 Callback params:', { code: !!code, state: !!state, error });

    if (error) {
      console.error('❌ Authentication error:', error);
      throw new Error(`Authentication failed: ${error}`);
    }

    if (!code || !state) {
      console.log('ℹ️ No code or state in callback, not a Spotify auth');
      return false;
    }

    const storedState = localStorage.getItem('spotify_auth_state');
    console.log('🔐 State validation:', { received: state, stored: storedState, match: state === storedState });
    
    if (state !== storedState) {
      console.error('❌ State mismatch');
      throw new Error('Authentication state mismatch');
    }

    console.log('✅ State validated, exchanging code for token...');
    await this.exchangeCodeForToken(code);
    
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
    console.log('🎉 Authentication completed successfully!');
    
    return true;
  }

  public checkStoredToken(): boolean {
    const storedToken = localStorage.getItem('spotify_access_token');
    const tokenExpiry = localStorage.getItem('spotify_token_expiry');
    const codeVerifier = localStorage.getItem('spotify_code_verifier');

    // If we have a code verifier, this is an old PKCE token - clear it
    if (codeVerifier) {
      console.log('🧹 Detected old PKCE token, clearing stored data...');
      this.clearStoredData();
      return false;
    }

    // Check if token was created before we switched to client secret flow
    // If token is older than 1 hour, it's likely from the old PKCE flow
    if (storedToken && tokenExpiry) {
      const tokenAge = Date.now() - parseInt(tokenExpiry) + (3600 * 1000); // Add 1 hour to get creation time
      const oneHourAgo = 60 * 60 * 1000; // 1 hour in milliseconds
      
      if (tokenAge > oneHourAgo) {
        console.log('🧹 Token is older than 1 hour, likely from old PKCE flow, clearing...');
        this.clearStoredData();
        return false;
      }
    }

    if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
      this.accessToken = storedToken;
      console.log('🔑 Found stored token, expires at:', new Date(parseInt(tokenExpiry)).toLocaleString());
      return true;
    }

    console.log('❌ No valid stored token found');
    return false;
  }

  public isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  public async checkTokenScopes(): Promise<string[]> {
    try {
      console.log('🔍 Checking Spotify token scopes...');
      console.log('📋 Requested scopes:', this.config.scopes);
      console.log('🔑 Access token present:', !!this.accessToken);
      
      // Try to get user profile to check basic scopes
      try {
        const profile = await this.spotifyApiCall<SpotifyUser>('/me');
        console.log('✅ User profile loaded successfully, basic scopes are working');
        console.log('👤 User profile:', profile.display_name);
      } catch (error) {
        console.error('❌ User profile failed:', error);
        throw error;
      }
      
      // Try to get top tracks to check user-top-read scope
      try {
        await this.spotifyApiCall<SpotifyTopTracksResponse>('/me/top/tracks?limit=1');
        console.log('✅ user-top-read scope is working');
      } catch (error) {
        console.warn('⚠️ user-top-read scope may be missing:', error);
      }
      
      // Try to get recently played to check user-read-recently-played scope
      try {
        await this.spotifyApiCall<SpotifyRecentlyPlayedResponse>('/me/player/recently-played?limit=1');
        console.log('✅ user-read-recently-played scope is working');
      } catch (error) {
        console.warn('⚠️ user-read-recently-played scope may be missing:', error);
      }
      
      return ['user-read-private', 'user-read-email']; // Basic scopes that work
    } catch (error) {
      console.error('❌ Token scope check failed:', error);
      throw new Error('Unable to verify token scopes. Please reconnect to Spotify.');
    }
  }

  public logout(): void {
    console.log('🚪 Logging out from Spotify...');
    this.accessToken = null;
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_token_expiry');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_auth_state');
    localStorage.removeItem('spotify_code_verifier');
    console.log('✅ Spotify logout completed');
  }

  public clearStoredData(): void {
    console.log('🧹 Clearing all stored Spotify data...');
    this.logout();
    console.log('✅ All Spotify data cleared');
  }

  public forceClearAndReauth(): void {
    console.log('🚨 Force clearing all data and re-authenticating...');
    this.clearStoredData();
    // Show a message to the user
    if (typeof window !== 'undefined') {
      alert('Clearing all Spotify data. Please reconnect with the new authentication method.');
    }
    this.authenticate();
  }

  public nuclearReset(): void {
    console.log('💥 NUCLEAR RESET: Clearing everything and forcing fresh start...');
    
    // Clear all possible localStorage keys
    const keysToRemove = [
      'spotify_access_token',
      'spotify_token_expiry', 
      'spotify_refresh_token',
      'spotify_auth_state',
      'spotify_code_verifier'
    ];
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`🗑️ Removed ${key}`);
    });
    
    this.accessToken = null;
    
    if (typeof window !== 'undefined') {
      alert('Nuclear reset complete. All Spotify data cleared. Please refresh the page and reconnect.');
      window.location.reload();
    }
  }

  private async exchangeCodeForToken(code: string): Promise<void> {
    if (!this.config.clientSecret) {
      throw new Error('Client secret not configured');
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${this.config.clientId}:${this.config.clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.config.redirectUri,
      }),
    });

    const data: SpotifyAuthResponse = await response.json();

    if (!response.ok) {
      console.error('❌ Token exchange failed:', response.status, response.statusText);
      console.error('Response data:', data);
      throw new Error('Failed to exchange code for token');
    }

    console.log('🎉 Token exchange successful!');
    console.log('📋 Granted scopes:', data.scope);
    console.log('⏰ Token expires in:', data.expires_in, 'seconds');

    if (data.access_token) {
      this.accessToken = data.access_token;
      const expiryTime = Date.now() + (data.expires_in * 1000);
      
      localStorage.setItem('spotify_access_token', data.access_token);
      localStorage.setItem('spotify_token_expiry', expiryTime.toString());
      
      if (data.refresh_token) {
        localStorage.setItem('spotify_refresh_token', data.refresh_token);
        console.log('🔄 Refresh token saved');
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

    if (!this.config.clientSecret) {
      console.error('Client secret not configured for token refresh');
      this.logout();
      return false;
    }

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${this.config.clientId}:${this.config.clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
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
      // Forbidden - likely missing scopes or old token
      console.log('🚨 403 Forbidden detected, clearing all stored data...');
      this.clearStoredData();
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
    try {
      return await this.spotifyApiCall<SpotifyUser>('/me');
    } catch (error) {
      console.error('Error fetching user profile:', error);
      // Check if it's a scope issue
      if (error instanceof Error && error.message.includes('403')) {
        throw new Error('Insufficient permissions. Please reconnect with proper Spotify permissions.');
      }
      throw error;
    }
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

}

export const spotifyService = SpotifyService.getInstance();
