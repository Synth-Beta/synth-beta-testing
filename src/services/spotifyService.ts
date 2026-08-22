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
import { trackInteraction, interactionTracker } from '@/services/interactionTrackingService';
import { supabase } from '@/integrations/supabase/client';
import { UserStreamingStatsService } from '@/services/userStreamingStatsService';
import { logger } from '@/utils/logger';
import { getSpotifyRedirectUri } from '@/utils/canonicalSiteUrl';
import { enrichProfileDataWithGenres } from '@/utils/streamingProfileData';

interface SpotifyAuthenticateOptions {
  onNavigate?: (url: string) => Promise<void> | void;
  /** Re-show Spotify consent (needed to grant scopes like user-top-read on reconnect). */
  forceConsent?: boolean;
}

export class SpotifyService {
  private static instance: SpotifyService;
  private accessToken: string | null = null;
  private config: SpotifyAuthConfig;

  private constructor() {
    const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';
    const redirectUri = getSpotifyRedirectUri();
    
    logger.debug('🔍 Spotify Config:', { hasClientId: !!clientId, hasRedirectUri: !!redirectUri });
    
    this.config = {
      clientId,
      redirectUri,
      scopes: [
        'user-read-private',
        'user-read-email',
        'user-top-read',
        'user-read-recently-played',
        'user-read-playback-state',
        'user-read-currently-playing'
      ]
    } as SpotifyAuthConfig;
    if (!clientId || !redirectUri) {
      logger.warn('Spotify config is missing. Set VITE_SPOTIFY_CLIENT_ID and VITE_SPOTIFY_REDIRECT_URI.');
    }
    
    if (typeof window !== 'undefined') {
      this.checkStoredToken();
    }
  }

  public static getInstance(): SpotifyService {
    if (!SpotifyService.instance) {
      SpotifyService.instance = new SpotifyService();
    }
    return SpotifyService.instance;
  }

  // Check if Spotify is properly configured
  public isConfigured(): boolean {
    return !!(this.config.clientId && this.config.redirectUri);
  }

  // Authentication methods
  public async authenticate(options?: SpotifyAuthenticateOptions): Promise<void> {
    if (!this.config.clientId || !this.config.redirectUri) {
      logger.warn('Spotify not configured. Missing VITE_SPOTIFY_CLIENT_ID or VITE_SPOTIFY_REDIRECT_URI.');
      throw new Error('Spotify integration is not configured. Please contact the administrator.');
    }

    const authUrl = await this.prepareAuthRequest(options?.forceConsent ?? false);

    if (options?.onNavigate) {
      await options.onNavigate(authUrl.toString());
      return;
    }

    window.location.href = authUrl.toString();
  }

  private async prepareAuthRequest(forceConsent = false): Promise<URL> {
    const state = this.generateRandomString(16);
    const codeVerifier = this.generateRandomString(64);
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
    if (forceConsent) {
      authUrl.searchParams.append('show_dialog', 'true');
    }

    try {
      trackInteraction.click('profile', 'connect_spotify', {
        action: 'connect_start',
        scopes: this.config.scopes,
        redirectUri: this.config.redirectUri
      });
    } catch {}

    return authUrl;
  }

  public async reauthenticate(): Promise<void> {
    // Clear existing tokens and force re-auth with consent screen for scope updates
    logger.debug('🔄 Forcing re-authentication...');
    await this.logout();
    await this.authenticate({ forceConsent: true });
  }

  public async validateTokenAndReauthIfNeeded(): Promise<boolean> {
    if (!this.accessToken) {
      logger.debug('❌ No access token available');
      return false;
    }

    // Check if we're currently in the middle of an auth callback
    const urlParams = new URLSearchParams(window.location.search);
    const isInCallback = urlParams.get('code') && urlParams.get('state');
    
    if (isInCallback) {
      logger.debug('🔄 Currently in auth callback, skipping token validation to avoid race condition');
      return false; // Let the callback handle the authentication
    }

    try {
      // Try to get user profile to test basic scopes
      logger.debug('🔍 Validating token scopes...');
      await this.spotifyApiCall<SpotifyUser>('/me');
      logger.debug('✅ Token validation successful');
      return true;
    } catch (error) {
      logger.error('❌ Token validation failed:', error);
      
      if (error instanceof Error && error.message.includes('403')) {
        logger.debug('🚨 Token has insufficient scopes, clearing old token and forcing re-authentication...');
        await this.clearStoredData();
        await this.reauthenticate();
        return false; // Will redirect, so return false
      }
      
      throw error;
    }
  }

  public async handleAuthCallback(): Promise<boolean> {
    logger.debug('🔄 Handling Spotify auth callback...');
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    logger.debug('📥 Callback params:', { code: !!code, state: !!state, error });

    if (error) {
      logger.error('❌ Authentication error:', error);
      throw new Error(`Authentication failed: ${error}`);
    }

    if (!code || !state) {
      logger.debug('ℹ️ No code or state in callback, not a Spotify auth');
      return false;
    }

    const storedState = localStorage.getItem('spotify_auth_state');
    logger.debug('🔐 State validation:', { received: state, stored: storedState, match: state === storedState });
    
    if (state !== storedState) {
      logger.error('❌ State mismatch detected');
      logger.debug('🔧 Attempting recovery...');
      
      // Check if we have any stored state at all
      if (!storedState) {
        logger.debug('⚠️ No stored state found - user may have navigated away during auth');
        logger.debug('🔄 Attempting to proceed with token exchange anyway...');
        
        // Try to exchange the code anyway - sometimes this works
        try {
          await this.exchangeCodeForToken(code);
          logger.debug('✅ Token exchange successful despite state mismatch');
          
          // Clean up and return success
          window.history.replaceState({}, document.title, window.location.pathname);
          return true;
        } catch (tokenError) {
          logger.error('❌ Token exchange failed:', tokenError);
          throw new Error('Authentication state mismatch. Please try connecting to Spotify again.');
        }
      } else {
        logger.error('❌ State mismatch with stored state present');
        logger.debug('🔧 This might be due to a race condition - attempting token exchange anyway');
        
        // Try to exchange the code anyway - sometimes this works even with state mismatch
        try {
          await this.exchangeCodeForToken(code);
          logger.debug('✅ Token exchange successful despite state mismatch');
          
          // Clean up and return success
          window.history.replaceState({}, document.title, window.location.pathname);
          localStorage.removeItem('spotify_auth_state');
          localStorage.removeItem('spotify_code_verifier');
          return true;
        } catch (tokenError) {
          logger.error('❌ Token exchange failed:', tokenError);
          throw new Error('Authentication state mismatch. Please try connecting to Spotify again.');
        }
      }
    }

    logger.debug('✅ State validated, exchanging code for token...');
    await this.exchangeCodeForToken(code);
    
    // Clean up URL first
    window.history.replaceState({}, document.title, window.location.pathname);
    
    try {
      trackInteraction.click('profile', 'connect_spotify', {
        action: 'connect_success'
      });
    } catch {}
    
    logger.debug('🎉 Authentication completed successfully!');
    
    return true;
  }

  /**
   * Pulls user's listening data (top artists, top tracks, recently played)
   * and logs normalized interactions per item into user_interactions.
   * Also saves to streaming_profiles to trigger database sync.
   */
  public async syncUserMusicPreferences(): Promise<void> {
    try {
      // If we have a refresh token in localStorage, save it to the server so the backfill
      // script can sync without the app. No need for users to "reconnect" — just Refresh Stats once.
      const refreshToken = typeof localStorage !== 'undefined' ? localStorage.getItem('spotify_refresh_token') : null;
      if (refreshToken) {
        await this.saveRefreshTokenToServer(refreshToken);
      }

      // Fetch multiple ranges for stronger signal
      const [topArtistsShort, topArtistsMed, topArtistsLong] = await Promise.all([
        this.getTopArtists('short_term', 50, 0).catch(() => ({ items: [] } as SpotifyTopArtistsResponse)),
        this.getTopArtists('medium_term', 50, 0).catch(() => ({ items: [] } as SpotifyTopArtistsResponse)),
        this.getTopArtists('long_term', 50, 0).catch(() => ({ items: [] } as SpotifyTopArtistsResponse))
      ]);

      const trackFetchResults = await Promise.all([
        this.getTopTracks('short_term', 50, 0)
          .then((data) => ({ ok: true as const, data }))
          .catch((error: unknown) => ({ ok: false as const, error })),
        this.getTopTracks('medium_term', 50, 0)
          .then((data) => ({ ok: true as const, data }))
          .catch((error: unknown) => ({ ok: false as const, error })),
        this.getTopTracks('long_term', 50, 0)
          .then((data) => ({ ok: true as const, data }))
          .catch((error: unknown) => ({ ok: false as const, error })),
      ]);

      const topTracksShort = trackFetchResults[0].ok
        ? trackFetchResults[0].data
        : ({ items: [] } as SpotifyTopTracksResponse);
      const topTracksMed = trackFetchResults[1].ok
        ? trackFetchResults[1].data
        : ({ items: [] } as SpotifyTopTracksResponse);
      const topTracksLong = trackFetchResults[2].ok
        ? trackFetchResults[2].data
        : ({ items: [] } as SpotifyTopTracksResponse);

      const trackFetchFailures = trackFetchResults.filter((r) => !r.ok);
      const allTopArtistsPreview = [
        ...topArtistsShort.items,
        ...topArtistsMed.items,
        ...topArtistsLong.items,
      ];
      const allTopTracksPreview = [
        ...topTracksShort.items,
        ...topTracksMed.items,
        ...topTracksLong.items,
      ];
      if (
        allTopArtistsPreview.length > 0 &&
        allTopTracksPreview.length === 0 &&
        trackFetchFailures.length === 3
      ) {
        const firstError = trackFetchFailures[0]?.error;
        const detail =
          firstError instanceof Error ? firstError.message : 'Spotify track API failed';
        throw new Error(
          `Spotify did not return top tracks (${detail}). Disconnect and reconnect Spotify to grant track permissions (user-top-read).`
        );
      }

      const recentlyPlayed = await this.getRecentlyPlayed(50).catch(() => ({ items: [] } as SpotifyRecentlyPlayedResponse));
      const userProfile = await this.getUserProfile().catch(() => null);

      // Combine all data for streaming_profiles table
      const allTopArtists = [
        ...topArtistsShort.items,
        ...topArtistsMed.items,
        ...topArtistsLong.items
      ];

      const allTopTracks = [
        ...topTracksShort.items,
        ...topTracksMed.items,
        ...topTracksLong.items
      ];

      // Save to streaming_profiles table to trigger database sync
      await this.saveToStreamingProfiles({
        topArtists: allTopArtists,
        topArtistsByTimeRange: {
          short_term: topArtistsShort.items,
          medium_term: topArtistsMed.items,
          long_term: topArtistsLong.items,
        },
        topTracks: allTopTracks,
        topTracksByTimeRange: {
          short_term: topTracksShort.items,
          medium_term: topTracksMed.items,
          long_term: topTracksLong.items,
        },
        recentlyPlayed: recentlyPlayed.items,
        userProfile
      });

      // Log artist preferences
      const pushArtist = (artist: SpotifyArtist, timeRange: SpotifyTimeRange) => {
        interactionTracker.queueInteraction({
          eventType: 'music_pref',
          entityType: 'artist',
          entityId: artist.id,
          metadata: {
            name: artist.name,
            genres: artist.genres,
            popularity: artist.popularity,
            timeRange
          }
        });
      };

      topArtistsShort.items.forEach(a => pushArtist(a, 'short_term'));
      topArtistsMed.items.forEach(a => pushArtist(a, 'medium_term'));
      topArtistsLong.items.forEach(a => pushArtist(a, 'long_term'));

      // Log track preferences
      const pushTrack = (track: SpotifyTrack, timeRange: SpotifyTimeRange) => {
        interactionTracker.queueInteraction({
          eventType: 'music_pref',
          entityType: 'track',
          entityId: track.id,
          metadata: {
            name: track.name,
            album: track.album?.name,
            artistNames: track.artists?.map(a => a.name),
            artistIds: track.artists?.map(a => a.id),
            popularity: track.popularity,
            timeRange
          }
        });
      };

      topTracksShort.items.forEach(t => pushTrack(t, 'short_term'));
      topTracksMed.items.forEach(t => pushTrack(t, 'medium_term'));
      topTracksLong.items.forEach(t => pushTrack(t, 'long_term'));

      // Log listening history
      recentlyPlayed.items.forEach(item => {
        const t = item.track;
        if (!t) return;
        interactionTracker.queueInteraction({
          eventType: 'listen',
          entityType: 'track',
          entityId: t.id,
          metadata: {
            name: t.name,
            album: t.album?.name,
            artistNames: t.artists?.map(a => a.name),
            artistIds: t.artists?.map(a => a.id),
            played_at: item.played_at
          }
        });
      });

      // Flush batched interactions to DB
      // Catch errors from genre interaction duplicates - these are handled by the database
      try {
      await interactionTracker.flush();
      } catch (error: any) {
        // Handle duplicate key errors gracefully - these happen when the same genre
        // is processed multiple times with the same timestamp
        if (error?.code === '23505' && error?.message?.includes('user_genre_interactions')) {
          logger.warn('Some genre interactions were duplicates (this is expected during sync)');
        } else {
          logger.error('Error flushing interactions:', error);
        }
      }

      // Store comprehensive stats permanently in user_streaming_stats_summary
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Fetch ALL data using pagination for maximum coverage
          logger.debug('📊 Fetching comprehensive streaming data...');
          
          const [allArtistsShort, allArtistsMed, allArtistsLong] = await Promise.all([
            this.getAllTopArtists('short_term').catch(() => []),
            this.getAllTopArtists('medium_term').catch(() => []),
            this.getAllTopArtists('long_term').catch(() => [])
          ]);

          const [allTracksShort, allTracksMed, allTracksLong] = await Promise.all([
            this.getAllTopTracks('short_term').catch(() => []),
            this.getAllTopTracks('medium_term').catch(() => []),
            this.getAllTopTracks('long_term').catch(() => [])
          ]);

          // Get more recently played tracks (up to 200)
          const recentlyPlayedExtended = await Promise.all([
            this.getRecentlyPlayed(50, undefined, undefined).catch(() => ({ items: [] })),
            this.getRecentlyPlayed(50, undefined, undefined).catch(() => ({ items: [] })),
            this.getRecentlyPlayed(50, undefined, undefined).catch(() => ({ items: [] })),
            this.getRecentlyPlayed(50, undefined, undefined).catch(() => ({ items: [] }))
          ]).then(results => {
            const allItems = results.flatMap(r => r.items || []);
            // Remove duplicates by track ID
            const unique = allItems.filter((item, index, self) =>
              index === self.findIndex(i => i.track?.id === item.track?.id)
            );
            return unique.slice(0, 200); // Limit to 200 most recent
          });

          // Database table removed - stats are no longer persisted
          // Removed: UserStreamingStatsService.syncComprehensiveSpotifyData call

          logger.debug('⚠️ Stats table removed - stats not persisted. Fetched:', {
            short_term: { artists: allArtistsShort.length, tracks: allTracksShort.length },
            medium_term: { artists: allArtistsMed.length, tracks: allTracksMed.length },
            long_term: { artists: allArtistsLong.length, tracks: allTracksLong.length },
            recently_played: recentlyPlayedExtended.length
          });

          // Notify sync service that sync completed (only if sync is being tracked)
          try {
            const { streamingSyncService } = await import('@/services/streamingSyncService');
            if (streamingSyncService.isSyncing()) {
              streamingSyncService.completeSync();
            }
          } catch (importError) {
            logger.warn('Could not notify sync service:', importError);
          }
        }
      } catch (statsError) {
        logger.error('Error storing comprehensive Spotify stats:', statsError);
        // Notify sync service of error
        try {
          const { streamingSyncService } = await import('@/services/streamingSyncService');
          streamingSyncService.errorSync(statsError instanceof Error ? statsError.message : 'Unknown error');
        } catch (importError) {
          logger.warn('Could not notify sync service of error:', importError);
        }
        // Don't fail the whole sync if stats storage fails
      }

      // Summary log
      trackInteraction.click('profile', 'spotify_sync', {
        action: 'sync_complete',
        artists_short: topArtistsShort.items.length,
        artists_medium: topArtistsMed.items.length,
        artists_long: topArtistsLong.items.length,
        tracks_short: topTracksShort.items.length,
        tracks_medium: topTracksMed.items.length,
        tracks_long: topTracksLong.items.length,
        recently_played: recentlyPlayed.items.length
      });
    } catch (error) {
      logger.error('Spotify sync error:', error);
      throw error;
    }
  }

  /**
   * Save refresh token to Supabase so server-side backfill can sync without the app.
   * Only the row for the current user is written; client cannot read tokens back.
   * Retries up to 3 times when session is not ready (e.g. on OAuth callback redirect).
   */
  private async saveRefreshTokenToServer(refreshToken: string): Promise<void> {
    const maxRetries = 3;
    const retryDelayMs = 500;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (attempt < maxRetries) {
            logger.debug(`Spotify token save: no user yet (attempt ${attempt}/${maxRetries}), retrying in ${retryDelayMs}ms...`);
            await new Promise((r) => setTimeout(r, retryDelayMs));
            continue;
          }
          logger.warn('Cannot save Spotify token: no authenticated user after retries (session may not be ready on callback). Will retry from sync.');
          return;
        }
        const { error } = await supabase
          .from('spotify_user_tokens')
          .upsert(
            { user_id: user.id, refresh_token: refreshToken, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        if (error) {
          logger.debug('Spotify token save failed:', { code: error.code, message: error.message });
          logger.warn('Could not save Spotify refresh token for backfill:', error.message, error.code);
        } else {
          logger.debug('✅ Spotify refresh token saved to spotify_user_tokens for user:', user.id);
        }
        return;
      } catch (e) {
        if (attempt < maxRetries) {
          logger.debug(`Save refresh token failed (attempt ${attempt}/${maxRetries}), retrying...`, e);
          await new Promise((r) => setTimeout(r, retryDelayMs));
        } else {
          logger.warn('Save refresh token to server failed after retries:', e);
        }
      }
    }
  }

  /**
   * Fill in artist genres from our own `artists` table.
   *
   * Spotify's artist objects no longer come back with a populated `genres` array (verified
   * live: 0 of 123 artists tagged, where a 2026-07-02 sync of the same account had 65 of
   * 130). Left alone, a sync writes genre-less artists and the process_spotify_genres_to_signals
   * trigger — which replaces the user's spotify_genre signals wholesale on every sync —
   * empties them, quietly degrading feed personalization.
   *
   * Display-cased to match what the stats UI renders and what refresh_user_preferences_v5
   * normalizes ("Hip Hop Rap" and "hip-hop-rap" both slug to "hip-hop-rap").
   * Mirrors backfillArtistGenresFromDb in api/spotify/sync-profile.ts, which does the same
   * for the mobile server-sync path. Best-effort: failures leave Spotify's data untouched.
   */
  private async backfillArtistGenresFromDb(artistLists: SpotifyArtist[][]): Promise<void> {
    const PLACEHOLDER_GENRES = new Set(['small artist', 'unknown', 'n/a']);
    const toDisplay = (value: string) =>
      value
        .split(/[-\s]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    const names = new Set<string>();
    for (const list of artistLists) {
      for (const artist of list) {
        const name = artist?.name?.trim();
        if (name && !(Array.isArray(artist.genres) && artist.genres.length > 0)) names.add(name);
      }
    }
    if (names.size === 0) return;

    try {
      const { data, error } = await supabase
        .from('artists')
        .select('name, genres')
        .in('name', [...names]);
      if (error || !data) return;

      const byName = new Map<string, string[]>();
      for (const row of data as Array<{ name?: string | null; genres?: string[] | null }>) {
        const rowName = row.name?.trim().toLowerCase();
        if (!rowName || !Array.isArray(row.genres)) continue;
        const cleaned = row.genres
          .filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
          .filter((g) => !PLACEHOLDER_GENRES.has(g.trim().toLowerCase()))
          .map((g) => toDisplay(g.trim()));
        if (cleaned.length > 0) byName.set(rowName, [...new Set(cleaned)]);
      }
      if (byName.size === 0) return;

      let filled = 0;
      for (const list of artistLists) {
        for (const artist of list) {
          const name = artist?.name?.trim().toLowerCase();
          if (!name || (Array.isArray(artist.genres) && artist.genres.length > 0)) continue;
          const fromDb = byName.get(name);
          if (fromDb) {
            artist.genres = fromDb;
            filled++;
          }
        }
      }
      logger.debug(`Backfilled genres for ${filled} artists from the artists table`);
    } catch (error) {
      logger.warn('Artist genre backfill skipped:', error);
    }
  }

  /**
   * Save Spotify data to streaming_profiles table to trigger database sync
   */
  private async saveToStreamingProfiles(data: {
    topArtists: SpotifyArtist[];
    topArtistsByTimeRange?: {
      short_term: SpotifyArtist[];
      medium_term: SpotifyArtist[];
      long_term: SpotifyArtist[];
    };
    topTracks: SpotifyTrack[];
    topTracksByTimeRange?: {
      short_term: SpotifyTrack[];
      medium_term: SpotifyTrack[];
      long_term: SpotifyTrack[];
    };
    recentlyPlayed: any[];
    userProfile: SpotifyUser | null;
  }): Promise<void> {
    try {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        logger.warn('No authenticated user for streaming profile save');
        return;
      }

      // Spotify stopped returning artist genres — fill them from our own artists table
      // before the row is written, so the genre trigger has something to work with.
      await this.backfillArtistGenresFromDb([
        data.topArtistsByTimeRange?.short_term ?? [],
        data.topArtistsByTimeRange?.medium_term ?? [],
        data.topArtistsByTimeRange?.long_term ?? [],
        data.topArtists,
      ]);

      // Prepare profile data for streaming_profiles table
      const { data: existingRow } = await supabase
        .from('streaming_profiles')
        .select('profile_data')
        .eq('user_id', user.id)
        .eq('service_type', 'spotify')
        .maybeSingle();

      const preserveSnapshot = Array.isArray(
        (existingRow?.profile_data as { topGenresSnapshot?: unknown } | null)?.topGenresSnapshot
      )
        ? ((existingRow?.profile_data as { topGenresSnapshot: { genre: string; count: number }[] })
            .topGenresSnapshot)
        : null;

      const profileData = enrichProfileDataWithGenres(
        {
          topArtists: data.topArtists,
          topArtistsByTimeRange: data.topArtistsByTimeRange ?? null,
          topTracks: data.topTracks,
          topTracksByTimeRange: data.topTracksByTimeRange ?? null,
          recentlyPlayed: data.recentlyPlayed,
          userProfile: data.userProfile,
          external_urls: data.userProfile?.external_urls,
          followers: data.userProfile?.followers,
          country: data.userProfile?.country,
          display_name: data.userProfile?.display_name,
          email: data.userProfile?.email,
          images: data.userProfile?.images,
          product: data.userProfile?.product,
          type: data.userProfile?.type,
          uri: data.userProfile?.uri,
        },
        { preserveSnapshot }
      );

      // Use upsert to handle both insert and update in one operation
      // This avoids the 406/409 errors by using ON CONFLICT
      // Note: Supabase upsert uses the unique constraint automatically
      const { error: upsertError } = await supabase
        .from('streaming_profiles')
        .upsert({
          user_id: user.id,
          service_type: 'spotify',
          profile_data: profileData,
          sync_status: 'completed',
          last_updated: new Date().toISOString()
        }, {
          onConflict: 'user_id,service_type',
          ignoreDuplicates: false
        });

      if (upsertError) {
        logger.debug('Streaming profile upsert failed:', { code: upsertError.code, message: upsertError.message });
        if (upsertError.code === 'PGRST205') {
          logger.warn('Table streaming_profiles does not exist or RLS policy issue');
          throw new Error(
            `Could not save streaming profile: ${upsertError.message} (${upsertError.code})`
          );
        } else if (upsertError.code === '57014') {
          // statement_timeout. The Spotify half succeeded; the DATABASE write was
          // cancelled, so this is not the user's Spotify connection and reconnecting
          // cannot help. Say so, or the UI sends them back through OAuth forever.
          logger.error('Streaming profile save timed out in the database (57014)');
          throw new Error(
            'Spotify data loaded, but saving it timed out in the database. This is a server-side issue, not your Spotify connection — reconnecting will not help.'
          );
        } else if (upsertError.code === '23505') {
          const { error: updateError } = await supabase
            .from('streaming_profiles')
            .update({
              profile_data: profileData,
              sync_status: 'completed',
              last_updated: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .eq('service_type', 'spotify');

          if (updateError) {
            logger.error('Error updating streaming profile:', updateError.code, updateError.message);
            throw new Error(
              `Could not save streaming profile: ${updateError.message} (${updateError.code})`
            );
          } else {
            logger.debug('✅ Updated streaming profile for user:', user.id);
          }
        } else {
          logger.error('Error upserting streaming profile:', upsertError.code, upsertError.message);
          throw new Error(
            `Could not save streaming profile: ${upsertError.message} (${upsertError.code})`
          );
        }
      } else {
        logger.debug('✅ Upserted streaming profile for user:', user.id);
      }

      // Also update user's music_streaming_profile field in profiles table
      if (data.userProfile?.external_urls?.spotify) {
        const { error: userUpdateError } = await supabase
          .from('users')
          .update({
            music_streaming_profile: data.userProfile.external_urls.spotify,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);

        if (userUpdateError) {
          logger.warn('Warning: Failed to update user profile with Spotify URL:', userUpdateError);
        } else {
          logger.debug('✅ Updated user profile with Spotify URL');
        }
      }
    } catch (error) {
      // Rethrow, do NOT swallow. This method used to log and return void, so a failed
      // save was indistinguishable from a successful one: UnifiedStreamingStats set
      // syncStatus('success') the moment syncUserMusicPreferences resolved, and the
      // stats silently stayed stale. That is exactly how the 57014 statement-timeout
      // outage (2026-08-21) went unnoticed on web while mobile at least said
      // "Sync failed". Every caller already handles a rejection: SpotifyCallback
      // catches and still redirects, streamingSyncActions maps it to {ok:false,
      // message}, UnifiedStreamingStats shows the error, and SpotifyStats opts out
      // explicitly with .catch(() => {}).
      logger.error('Error saving to streaming profiles:', error);
      throw error;
    }
  }

  public checkStoredToken(): boolean {
    const storedToken = localStorage.getItem('spotify_access_token');
    const tokenExpiry = localStorage.getItem('spotify_token_expiry');
    // If we have a code verifier stored, it's fine (PKCE). Do not clear.
    if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
      this.accessToken = storedToken;
      logger.debug('🔑 Found stored token, expires at:', new Date(parseInt(tokenExpiry)).toLocaleString());
      return true;
    }

    logger.debug('❌ No valid stored token found');
    return false;
  }

  /**
   * Ensure a valid session without user interaction.
   * - Loads stored token if valid
   * - If expired, attempts silent refresh using refresh_token
   * - Returns true when an access token is available
   */
  public async ensureSession(): Promise<boolean> {
    const storedToken = localStorage.getItem('spotify_access_token');
    const tokenExpiryStr = localStorage.getItem('spotify_token_expiry');
    if (storedToken && tokenExpiryStr) {
      const tokenExpiry = parseInt(tokenExpiryStr, 10);
      if (Number.isFinite(tokenExpiry) && Date.now() < tokenExpiry) {
        this.accessToken = storedToken;
        return true;
      }
      return this.refreshToken();
    }
    // Access token missing or expired — silent refresh when refresh_token remains.
    if (localStorage.getItem('spotify_refresh_token')) {
      return this.refreshToken();
    }
    return false;
  }

  /**
   * Lightweight session sync: fetch small amounts to keep personalization fresh without full reauth.
   * Safe to call at app start if ensureSession() returns true.
   */
  public async syncThisSessionLightly(): Promise<void> {
    try {
      // Keep it light: 10 top artists/tracks medium_term and 10 recently played
      await Promise.all([
        this.getTopArtists('medium_term', 10, 0).catch(() => null),
        this.getTopTracks('medium_term', 10, 0).catch(() => null),
        this.getRecentlyPlayed(10).catch(() => null)
      ]);
    } catch (e) {
      logger.warn('Light sync skipped:', e);
    }
  }

  public isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  public async checkTokenScopes(): Promise<string[]> {
    try {
      logger.debug('🔍 Checking Spotify token scopes...');
      logger.debug('📋 Requested scopes:', this.config.scopes);
      logger.debug('🔑 Access token present:', !!this.accessToken);
      
      // Try to get user profile to check basic scopes
      try {
        const profile = await this.spotifyApiCall<SpotifyUser>('/me');
        logger.debug('✅ User profile loaded successfully, basic scopes are working');
        logger.debug('👤 User profile:', profile.display_name);
      } catch (error) {
        logger.error('❌ User profile failed:', error);
        throw error;
      }
      
      // Try to get top tracks to check user-top-read scope
      try {
        await this.spotifyApiCall<SpotifyTopTracksResponse>('/me/top/tracks?limit=1');
        logger.debug('✅ user-top-read scope is working');
      } catch (error) {
        logger.warn('⚠️ user-top-read scope may be missing:', error);
      }
      
      // Try to get recently played to check user-read-recently-played scope
      try {
        await this.spotifyApiCall<SpotifyRecentlyPlayedResponse>('/me/player/recently-played?limit=1');
        logger.debug('✅ user-read-recently-played scope is working');
      } catch (error) {
        logger.warn('⚠️ user-read-recently-played scope may be missing:', error);
      }
      
      return ['user-read-private', 'user-read-email']; // Basic scopes that work
    } catch (error) {
      logger.error('❌ Token scope check failed:', error);
      throw new Error('Unable to verify token scopes. Please reconnect to Spotify.');
    }
  }

  public async logout(): Promise<void> {
    logger.debug('🚪 Logging out from Spotify...');
    this.accessToken = null;
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_token_expiry');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_auth_state');
    localStorage.removeItem('spotify_code_verifier');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('spotify_user_tokens').delete().eq('user_id', user.id);
      }
    } catch {
      // ignore
    }
    logger.debug('✅ Spotify logout completed');
  }

  public async clearStoredData(): Promise<void> {
    logger.debug('🧹 Clearing all stored Spotify data...');
    await this.logout();
    logger.debug('✅ All Spotify data cleared');
  }

  public async forceClearAndReauth(): Promise<void> {
    logger.debug('🚨 Force clearing all data and re-authenticating...');
    await this.clearStoredData();
    // Show a message to the user
    if (typeof window !== 'undefined') {
      alert('Clearing all Spotify data. Please reconnect with the new authentication method.');
    }
    this.authenticate();
  }

  /**
   * Recovery method for state mismatch issues
   * Clears auth data and provides user-friendly guidance
   */
  public async recoverFromStateMismatch(): Promise<void> {
    logger.debug('🔧 Recovering from state mismatch...');
    await this.clearStoredData();

    if (typeof window !== 'undefined') {
      // Show a more user-friendly message
      const shouldRetry = confirm(
        'Spotify authentication session expired. This can happen if you navigated away during the connection process.\n\n' +
        'Would you like to try connecting again now?'
      );

      if (shouldRetry) {
        this.authenticate();
      }
    }
  }

  public nuclearReset(): void {
    logger.debug('💥 NUCLEAR RESET: Clearing everything and forcing fresh start...');
    
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
      logger.debug(`🗑️ Removed ${key}`);
    });
    
    this.accessToken = null;
    
    if (typeof window !== 'undefined') {
      alert('Nuclear reset complete. All Spotify data cleared. Please refresh the page and reconnect.');
      window.location.reload();
    }
  }

  private async exchangeCodeForToken(code: string): Promise<void> {
    const codeVerifier = localStorage.getItem('spotify_code_verifier') || '';
    if (!this.config.clientId || !this.config.redirectUri) {
      throw new Error('Spotify not configured for token exchange');
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
        client_id: this.config.clientId,
        code_verifier: codeVerifier
      }),
    });

    const data: SpotifyAuthResponse = await response.json();

    if (!response.ok) {
      logger.error('❌ Token exchange failed:', response.status, response.statusText);
      logger.error('Response data:', data);
      throw new Error('Failed to exchange code for token');
    }

    logger.debug('🎉 Token exchange successful!');
    logger.debug('📋 Granted scopes:', data.scope);
    logger.debug('⏰ Token expires in:', data.expires_in, 'seconds');

    if (data.access_token) {
      this.accessToken = data.access_token;
      const expiryTime = Date.now() + (data.expires_in * 1000);
      
      localStorage.setItem('spotify_access_token', data.access_token);
      localStorage.setItem('spotify_token_expiry', expiryTime.toString());
      
      if (data.refresh_token) {
        localStorage.setItem('spotify_refresh_token', data.refresh_token);
        logger.debug('🔄 Refresh token saved');
        await this.saveRefreshTokenToServer(data.refresh_token);
      }
    } else {
      throw new Error('No access token received');
    }
  }

  private async refreshToken(): Promise<boolean> {
    const refreshToken = localStorage.getItem('spotify_refresh_token');
    if (!refreshToken) {
      await this.logout();
      return false;
    }

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.config.clientId
        }),
      });

      const data: SpotifyAuthResponse = await response.json();

      if (data.access_token) {
        this.accessToken = data.access_token;
        const expiryTime = Date.now() + (data.expires_in * 1000);

        localStorage.setItem('spotify_access_token', data.access_token);
        localStorage.setItem('spotify_token_expiry', expiryTime.toString());

        const tokenToPersist = data.refresh_token ?? refreshToken;
        if (data.refresh_token) {
          localStorage.setItem('spotify_refresh_token', data.refresh_token);
        }
        await this.saveRefreshTokenToServer(tokenToPersist);

        return true;
      }
      return false;
    } catch (error) {
      logger.error('Token refresh error:', error);
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
        await this.logout();
        throw new Error('Authentication failed');
      }
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
      await new Promise(res => setTimeout(res, delay));
      return this.spotifyApiCall<T>(endpoint, options);
    }

    if (response.status === 403) {
      throw new Error(
        'Spotify access forbidden (403). Try syncing again — if songs stay empty, reconnect once to refresh permissions.'
      );
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
      logger.error('Error fetching user profile:', error);
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
    
    const res = await this.spotifyApiCall<SpotifyTopTracksResponse>(`/me/top/tracks?${params.toString()}`);
    try { trackInteraction.view('profile', 'spotify_top_tracks', undefined, { resource: 'top_tracks', count: res.items?.length ?? 0, timeRange }); } catch {}
    return res;
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
    
    const res = await this.spotifyApiCall<SpotifyTopArtistsResponse>(`/me/top/artists?${params.toString()}`);
    try { trackInteraction.view('profile', 'spotify_top_artists', undefined, { resource: 'top_artists', count: res.items?.length ?? 0, timeRange }); } catch {}
    return res;
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
    
    const res = await this.spotifyApiCall<SpotifyRecentlyPlayedResponse>(`/me/player/recently-played?${params.toString()}`);
    try { trackInteraction.view('profile', 'spotify_recently_played', undefined, { resource: 'recently_played', count: res.items?.length ?? 0 }); } catch {}
    return res;
  }

  public async getCurrentPlayback(): Promise<SpotifyCurrentlyPlayingResponse | null> {
    try {
      return this.spotifyApiCall<SpotifyCurrentlyPlayingResponse>('/me/player');
    } catch (error) {
      // Player might not be active
      logger.debug('No active player found');
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
        logger.error('Error fetching top tracks:', error);
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
        logger.error('Error fetching top artists:', error);
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

  private async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return base64;
  }

  /**
   * Minimal self test to validate token and endpoints; returns summary info.
   */
  public async selfTest(): Promise<{ ok: boolean; profile?: string; topArtists?: number; recentlyPlayed?: number; error?: string }> {
    try {
      const profile = await this.getUserProfile();
      const ta = await this.getTopArtists('short_term', 1, 0);
      const rp = await this.getRecentlyPlayed(1);
      return { ok: true, profile: profile.display_name, topArtists: ta.items?.length ?? 0, recentlyPlayed: rp.items?.length ?? 0 };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

}

export const spotifyService = SpotifyService.getInstance();
