import { supabase } from '@/integrations/supabase/client';

/**
 * Apple Sign In Service
 * Handles Apple Sign In authentication flow for iOS app
 * 
 * This service bridges the native iOS Apple Sign In with Supabase authentication.
 * The iOS native layer handles the Apple Sign In UI and provides the identity token,
 * which is then sent to Supabase for verification and user creation/linking.
 */

interface AppleSignInResult {
  success: boolean;
  error?: string;
  session?: any;
}

type AppleNativeCredential = {
  /** Full name from ASAuthorizationAppleIDCredential (only present first consent) */
  fullName?: string;
  /** Email from ASAuthorizationAppleIDCredential (only present first consent) */
  email?: string;
  /** Nonce used by the native sign-in flow (optional) */
  nonce?: string;
};

type AppleIdTokenClaims = {
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
};

function safeAtobBase64Url(input: string): string {
  // Convert base64url -> base64
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // Add required padding
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return atob(b64 + pad);
}

function parseAppleIdTokenClaims(identityToken: string): AppleIdTokenClaims | null {
  try {
    const parts = identityToken.split('.');
    if (parts.length < 2) return null;
    const payload = safeAtobBase64Url(parts[1]);
    return JSON.parse(payload) as AppleIdTokenClaims;
  } catch {
    return null;
  }
}

function buildFallbackUsernameSeed(nameOrEmailPrefix: string): string {
  const base = (nameOrEmailPrefix || 'user')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '');

  const ensured = base.length >= 3 ? base : `${base}user`.slice(0, 25);
  return ensured.slice(0, 25) || 'user';
}

async function generateUsernameForNewUser(baseName: string, userId: string): Promise<string> {
  // Prefer DB function (guarantees uniqueness + matches server rules)
  try {
    const { data, error } = await supabase.rpc('generate_available_username', {
      base_name: baseName,
      exclude_user_id: userId,
    });
    if (!error && typeof data === 'string' && data.trim().length >= 3) {
      return data.trim();
    }
  } catch {
    // Ignore and fall back below
  }

  // Fallback: generate a reasonable username client-side
  const seed = buildFallbackUsernameSeed(baseName);
  const suffix = Math.random().toString(36).slice(2, 8);
  const candidate = `${seed}${suffix}`.slice(0, 30);
  return candidate.length >= 3 ? candidate : `user${suffix}`;
}

async function ensurePublicUsersRowAfterAppleAuth(params: {
  userId: string;
  identityToken: string;
  nativeCredential?: AppleNativeCredential;
  authUser?: any;
}): Promise<void> {
  const now = new Date().toISOString();
  const claims = parseAppleIdTokenClaims(params.identityToken);

  const nativeFullName = params.nativeCredential?.fullName?.trim() || '';
  const nativeEmail = params.nativeCredential?.email?.trim() || '';

  const metaName =
    params.authUser?.user_metadata?.full_name ||
    params.authUser?.user_metadata?.name ||
    params.authUser?.user_metadata?.fullName ||
    '';

  const emailFromClaims = (claims?.email || '').trim();
  const preferredEmail = nativeEmail || emailFromClaims || params.authUser?.email || '';

  const emailPrefix = preferredEmail ? preferredEmail.split('@')[0] : '';

  const displayName =
    nativeFullName ||
    (typeof metaName === 'string' ? metaName.trim() : '') ||
    (emailPrefix ? emailPrefix : '') ||
    'User';

  const appleUserId = (claims?.sub || '').trim();

  // 1) Create a minimal users row ASAP (idempotent). Username is required by DB.
  const username = await generateUsernameForNewUser(displayName, params.userId);

  const insertPayload: Record<string, any> = {
    user_id: params.userId,
    name: displayName,
    username,
    bio: 'Music lover looking to connect at events!',
    is_public_profile: true,
    created_at: now,
    updated_at: now,
  };

  // Optional Apple identity metadata columns (only set if we have values)
  if (preferredEmail) insertPayload.email = preferredEmail;
  if (appleUserId) insertPayload.apple_user_id = appleUserId;

  // UPSERT to ensure row exists (do not overwrite existing row on conflict)
  const { error: upsertError } = await supabase
    .from('users')
    .upsert(insertPayload, { onConflict: 'user_id', ignoreDuplicates: true });

  if (upsertError) {
    console.warn('Apple Sign In: could not upsert minimal users row:', upsertError);
    // Do not block login; onboarding/profile can still try later.
    return;
  }

  // 2) If the row already existed, only fill missing Apple identity fields (do not clobber existing data)
  try {
    const { data: existing, error: existingError } = await supabase
      .from('users')
      .select('user_id,name,email,apple_user_id')
      .eq('user_id', params.userId)
      .maybeSingle();

    if (existingError) {
      console.warn('Apple Sign In: could not read existing users row:', existingError);
      return;
    }

    const updatePayload: Record<string, any> = { updated_at: now };

    if (preferredEmail && !existing?.email) updatePayload.email = preferredEmail;
    if (appleUserId && !existing?.apple_user_id) updatePayload.apple_user_id = appleUserId;

    // Only set name from native credential when it is actually provided (first consent)
    // and existing name is missing/placeholder.
    if (
      nativeFullName &&
      (!existing?.name ||
        String(existing.name).trim() === '' ||
        ['user', 'new user'].includes(String(existing.name).trim().toLowerCase()))
    ) {
      updatePayload.name = nativeFullName;
    }

    if (Object.keys(updatePayload).length > 1) {
      const { error: updateError } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('user_id', params.userId);
      if (updateError) {
        console.warn('Apple Sign In: could not update users row with Apple metadata:', updateError);
      }
    }
  } catch (e) {
    console.warn('Apple Sign In: unexpected error ensuring users row:', e);
  }
}

/**
 * Listens for Apple Sign In token from iOS native layer
 * and authenticates with Supabase
 */
export async function handleAppleSignInFromNative(): Promise<AppleSignInResult> {
  return new Promise((resolve) => {
    // Check if we're on iOS
    if (!isIOS()) {
      resolve({
        success: false,
        error: 'Apple Sign In is only available on iOS devices'
      });
      return;
    }

    // Set up listeners for native events with high priority (capture phase)
    // Use capture: true to ensure these fire before any persistent listeners
    const tokenListener = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = (customEvent as any).detail || {};
      const token = detail?.token || (customEvent as any).token;
      const nativeCredential: AppleNativeCredential = {
        fullName: detail?.fullName || detail?.full_name || detail?.name,
        email: detail?.email,
        nonce: detail?.nonce,
      };
      
      if (token) {
        console.log('✅ Apple Sign In: Identity token received from iOS native layer');
        
        // Stop event propagation to prevent other listeners (like setupAppleSignInListeners) from firing
        event.stopImmediatePropagation();
        
        // Remove listeners
        window.removeEventListener('AppleSignInTokenReceived', tokenListener, true);
        window.removeEventListener('AppleSignInError', errorListener, true);
        
        // Authenticate with Supabase
        authenticateWithSupabase(token, nativeCredential)
          .then((result) => resolve(result))
          .catch((error) => {
            console.error('❌ Apple Sign In: Exception during authentication:', error);
            resolve({
              success: false,
              error: error?.message || 'Failed to authenticate with Supabase'
            });
          });
      } else {
        console.error('❌ Apple Sign In: Token listener fired but no token in event');
        // Remove listeners and resolve with error to prevent hanging
        window.removeEventListener('AppleSignInTokenReceived', tokenListener, true);
        window.removeEventListener('AppleSignInError', errorListener, true);
        resolve({
          success: false,
          error: 'No token received from Apple Sign In. Please try again.'
        });
      }
    };

    const errorListener = (event: Event) => {
      const customEvent = event as CustomEvent;
      const error = customEvent.detail?.error || (customEvent as any).error || 'Unknown error';
      
      // Stop event propagation to prevent other listeners from firing
      event.stopImmediatePropagation();
      
      // Remove listeners
      window.removeEventListener('AppleSignInTokenReceived', tokenListener, true);
      window.removeEventListener('AppleSignInError', errorListener, true);
      
      resolve({
        success: false,
        error
      });
    };

    // Add listeners with capture: true to fire before other listeners
    window.addEventListener('AppleSignInTokenReceived', tokenListener, { capture: true });
    window.addEventListener('AppleSignInError', errorListener, { capture: true });

    // Trigger native Apple Sign In
    // This will be called from the native layer via Capacitor bridge
    triggerNativeAppleSignIn();
  });
}

/**
 * Triggers native Apple Sign In via WebKit message handler or CustomEvent
 */
function triggerNativeAppleSignIn(): void {
  // Primary method: Post message via WebKit message handler (direct native communication)
  if ((window as any).webkit?.messageHandlers?.appleSignIn) {
    try {
      (window as any).webkit.messageHandlers.appleSignIn.postMessage({});
      return; // Successfully sent via message handler
    } catch (error) {
      console.warn('Failed to post via WebKit message handler:', error);
    }
  }
  
  // Fallback: Dispatch CustomEvent (JavaScript will forward it to native via injected script)
  window.dispatchEvent(new CustomEvent('RequestAppleSignIn'));
  
  // Also try Capacitor bridge if available (additional fallback)
  const Capacitor = (window as any).Capacitor;
  if (Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.Plugins) {
    try {
      if ((window as any).webkit?.messageHandlers?.capacitor) {
        (window as any).webkit.messageHandlers.capacitor.postMessage({
          type: 'plugin',
          callbackId: 'apple-sign-in',
          pluginId: 'App',
          methodName: 'handleAppleSignIn',
          options: {}
        });
      }
    } catch (error) {
      console.log('Capacitor bridge method failed');
    }
  }
}

/**
 * Authenticates with Supabase using Apple identity token
 */
async function authenticateWithSupabase(
  identityToken: string,
  nativeCredential?: AppleNativeCredential
): Promise<AppleSignInResult> {
  try {
    // Validate token is received
    if (!identityToken || identityToken.trim() === '') {
      console.error('❌ Apple Sign In: Empty identity token received');
      return {
        success: false,
        error: 'Invalid identity token from Apple. Please try again.'
      };
    }

    // Log token validation (without exposing full token)
    const tokenLength = identityToken.length;
    const tokenPrefix = identityToken.substring(0, 20);
    console.log('🔐 Apple Sign In: Token received from iOS');
    console.log('   Token length:', tokenLength, 'characters');
    console.log('   Token prefix:', tokenPrefix, '...');
    console.log('   Token format valid:', identityToken.includes('.') ? 'Yes (JWT format)' : 'No');
    
    console.log('🔐 Apple Sign In: Authenticating with Supabase...');
    
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      ...(nativeCredential?.nonce ? { nonce: nativeCredential.nonce } : {}),
    });

    if (error) {
      // Always log FULL error details for debugging
      console.error('❌ Apple Sign In: Supabase authentication error');
      console.error('   Error status:', error.status);
      console.error('   Error message:', error.message);
      console.error('   Error name:', error.name);
      console.error('   Full error object:', JSON.stringify(error, null, 2));
      
      // Check for specific Supabase error codes
      const errorCode = (error as any).code;
      const errorDescription = (error as any).description || error.message;
      
      // Provide more specific error messages based on Supabase error codes
      let errorMessage = 'Failed to sign in with Apple';
      let userFriendlyMessage = errorMessage;
      
      if (errorCode) {
        console.error('   Supabase error code:', errorCode);
      }
      
      if (error.message) {
        // Check for common Supabase Apple Sign In errors
        if (error.message.includes('Provider') && error.message.includes('not enabled')) {
          errorMessage = 'Apple Sign In is not enabled in Supabase. Please configure Apple provider in Supabase Dashboard.';
          userFriendlyMessage = 'Apple Sign In is not configured. Please contact support.';
        } else if (error.message.includes('Invalid token') || error.message.includes('invalid_token')) {
          errorMessage = 'The Apple Sign In token is invalid. Please try again.';
          userFriendlyMessage = 'Invalid Apple Sign In token. Please try again.';
        } else if (error.message.includes('expired')) {
          errorMessage = 'The sign-in session has expired. Please try again.';
          userFriendlyMessage = 'Sign-in session expired. Please try again.';
        } else if (error.status === 0 || error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error. Please check your internet connection.';
          userFriendlyMessage = 'Network error. Please check your internet connection.';
        } else if (error.status === 400) {
          // 400 errors are often configuration issues
          if (error.message.includes('client_id') || error.message.includes('Client ID')) {
            errorMessage = `Invalid Apple Sign In configuration: ${error.message}. Check Supabase Dashboard → Authentication → Providers → Apple. Use Bundle ID: com.tejpatel.synth`;
            userFriendlyMessage = 'Apple Sign In configuration error. Please contact support.';
          } else {
            errorMessage = `Invalid Apple Sign In request: ${error.message}. Check Supabase Dashboard Apple provider configuration.`;
            userFriendlyMessage = 'Invalid Apple Sign In request. Please try again.';
          }
        } else {
          errorMessage = error.message;
          userFriendlyMessage = error.message;
        }
      }
      
      return {
        success: false,
        error: userFriendlyMessage
      };
    }

    if (!data.session) {
      if (import.meta.env.DEV) {
        console.error('❌ Apple Sign In: No session returned from Supabase');
      }
      return {
        success: false,
        error: 'Authentication succeeded but no session was created. Please try again.'
      };
    }

    if (import.meta.env.DEV) {
      console.log('✅ Apple Sign In: Successfully authenticated with Supabase');
    }

    // Immediately ensure a public.users row exists (prevents ProfileView race + ensures onboarding can update).
    try {
      const authUser = data.user ?? (await supabase.auth.getUser()).data.user;
      await ensurePublicUsersRowAfterAppleAuth({
        userId: data.session.user.id,
        identityToken,
        nativeCredential,
        authUser,
      });
    } catch (e) {
      console.warn('Apple Sign In: could not ensure public.users row (continuing):', e);
    }

    return {
      success: true,
      session: data.session
    };
  } catch (error: any) {
    if (import.meta.env.DEV) {
      console.error('❌ Apple Sign In: Unexpected error:', error);
    }
    return {
      success: false,
      error: error?.message || 'An unexpected error occurred during authentication'
    };
  }
}

/**
 * Checks if the current platform is iOS
 */
function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check user agent
  const userAgent = window.navigator.userAgent || window.navigator.vendor || (window as any).opera;
  const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
  
  // Check Capacitor platform
  const Capacitor = (window as any).Capacitor;
  if (Capacitor && typeof Capacitor.getPlatform === 'function') {
    try {
      return Capacitor.getPlatform() === 'ios' || isIOSDevice;
    } catch (error) {
      console.warn('Error checking Capacitor platform:', error);
      return isIOSDevice;
    }
  }
  
  return isIOSDevice;
}

/**
 * Sets up listeners for Apple Sign In events from native layer
 * These listeners only handle errors (for logging) - they do NOT auto-authenticate
 * to prevent duplicate authentication attempts when handleAppleSignInFromNative() is called
 * 
 * @returns Cleanup function to remove listeners, or null if not iOS
 */
export function setupAppleSignInListeners(): (() => void) | null {
  if (!isIOS()) return null;

  // Listen for errors from native layer (for logging only - no auto-authentication)
  // This prevents duplicate authentication when handleAppleSignInFromNative() is used
  const errorHandler = (event: Event) => {
    const customEvent = event as CustomEvent;
    const error = customEvent.detail?.error || (customEvent as any).error;
    console.error('Apple Sign In error:', error);
  };

  window.addEventListener('AppleSignInError', errorHandler);

  // Return cleanup function
  return () => {
    window.removeEventListener('AppleSignInError', errorHandler);
  };
}

