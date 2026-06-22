/**
 * In-app Spotify OAuth for Expo (PKCE / public client — no client secret).
 *
 * Uses expo-auth-session to open an embedded auth browser (ASWebAuthenticationSession on iOS,
 * Chrome Custom Tab on Android) — not a full Safari tab. On success persists the refresh token
 * to `spotify_user_tokens` so `api/spotify/sync-profile` can use it for background sync.
 *
 * Required: EXPO_PUBLIC_SPOTIFY_CLIENT_ID in app environment.
 *
 * The redirect URI returned by getSpotifyExpoRedirectUri() MUST be registered in the
 * Spotify Developer Dashboard. It will look like: exp+synth://spotify-callback
 */

import * as Crypto from 'expo-crypto';
import {
  makeRedirectUri,
  AuthRequest,
  type AuthSessionResult,
  ResponseType,
  CodeChallengeMethod,
  type DiscoveryDocument,
} from 'expo-auth-session';
import { supabase } from '../integrations/supabase/client';

const SPOTIFY_DISCOVERY: DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-read-recently-played',
  'user-read-playback-state',
  'user-read-currently-playing',
];

/** Characters used for PKCE verifier strings. */
const PKCE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function pkceGenerateRandom(size: number): string {
  const bytes = Crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes)
    .map((b) => PKCE_CHARSET[b % PKCE_CHARSET.length])
    .join('');
}

function base64UrlSafe(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function pkceDeriveChallengeAsync(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return base64UrlSafe(digest);
}

async function buildPkceCodesAsync(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = pkceGenerateRandom(128);
  const codeChallenge = await pkceDeriveChallengeAsync(codeVerifier);
  return { codeVerifier, codeChallenge };
}

function getSpotifyClientId(): string {
  const id = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID?.trim() ?? '';
  if (!id) {
    console.warn(
      '[spotifyAuth] EXPO_PUBLIC_SPOTIFY_CLIENT_ID is not set. ' +
        'Add it to .env / eas.json and register the redirect URI in the Spotify Developer Dashboard.'
    );
  }
  return id;
}

/**
 * The redirect URI expo-auth-session generates for this app.
 * Register this EXACTLY in the Spotify Developer Dashboard, e.g.:
 *   exp+synth://spotify-callback
 */
export function getSpotifyExpoRedirectUri(): string {
  return makeRedirectUri({ scheme: 'synth', path: 'spotify-callback' });
}

export type SpotifyInAppAuthResult =
  | { ok: true; refreshToken: string; accessToken: string }
  | { ok: false; error: string; cancelled?: boolean };

function formatAuthSessionError(err: unknown): string {
  if (!err) return 'Spotify auth error.';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;

  // expo-auth-session's AuthError type varies by version; safely extract common fields.
  const anyErr = err as Record<string, unknown>;
  const desc = anyErr.error_description;
  if (typeof desc === 'string' && desc) return desc;
  const code = anyErr.error;
  if (typeof code === 'string' && code) return code;

  try {
    return JSON.stringify(err);
  } catch {
    return 'Spotify auth error.';
  }
}

async function exchangeCodeForTokens(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Spotify token exchange failed (non-JSON): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg =
      typeof data.error_description === 'string'
        ? data.error_description
        : typeof data.error === 'string'
          ? data.error
          : `HTTP ${res.status}`;
    throw new Error(`Spotify token exchange error: ${msg}`);
  }

  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;

  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('Spotify token exchange: missing access_token.');
  }
  if (typeof refreshToken !== 'string' || !refreshToken) {
    throw new Error(
      'Spotify token exchange: missing refresh_token. ' +
        'Ensure the Spotify app has not been revoked and the scopes include user-top-read.'
    );
  }

  return { accessToken, refreshToken };
}

async function persistRefreshToken(refreshToken: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new Error('Cannot persist Spotify token: not signed in to Synth.');
  }

  const { error } = await supabase
    .from('spotify_user_tokens')
    .upsert(
      { user_id: user.id, refresh_token: refreshToken, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (error) {
    throw new Error(`Failed to save Spotify refresh token: ${error.message}`);
  }
}

/**
 * Run the full Spotify in-app OAuth + token persistence flow.
 *
 * Opens an embedded auth browser — not a full Safari tab.
 * On success the refresh token is stored in Supabase so the server sync API can work.
 */
export async function authenticateSpotifyInApp(options?: {
  /** Force the Spotify consent screen — use when re-granting scopes. */
  forceConsent?: boolean;
}): Promise<SpotifyInAppAuthResult> {
  const clientId = getSpotifyClientId();
  if (!clientId) {
    return {
      ok: false,
      error:
        'Spotify client ID not configured (EXPO_PUBLIC_SPOTIFY_CLIENT_ID). ' +
        'Set it and register the redirect URI in the Spotify Developer Dashboard.',
    };
  }

  const redirectUri = getSpotifyExpoRedirectUri();

  let codeVerifier: string;
  let codeChallenge: string;
  try {
    ({ codeVerifier, codeChallenge } = await buildPkceCodesAsync());
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to build PKCE challenge.',
    };
  }

  const request = new AuthRequest({
    clientId,
    scopes: SCOPES,
    redirectUri,
    responseType: ResponseType.Code,
    codeChallenge,
    codeChallengeMethod: CodeChallengeMethod.S256,
    usePKCE: false, // We supply codeChallenge manually above
    extraParams: options?.forceConsent ? { show_dialog: 'true' } : {},
  });

  let result: AuthSessionResult;
  try {
    result = await request.promptAsync(SPOTIFY_DISCOVERY);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Spotify auth prompt failed.',
    };
  }

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { ok: false, error: 'Cancelled.', cancelled: true };
  }

  if (result.type === 'error') {
    return {
      ok: false,
      error: formatAuthSessionError(result.error),
    };
  }

  if (result.type !== 'success' || !result.params?.code) {
    return { ok: false, error: 'Spotify did not return an authorization code.' };
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code: result.params.code,
      codeVerifier,
      redirectUri,
      clientId,
    });

    await persistRefreshToken(tokens.refreshToken);

    return { ok: true, refreshToken: tokens.refreshToken, accessToken: tokens.accessToken };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Token exchange or persistence failed.',
    };
  }
}
