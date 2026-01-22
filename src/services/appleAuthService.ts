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
      const token = customEvent.detail?.token || (customEvent as any).token;
      
      if (token) {
        // Stop event propagation to prevent other listeners (like setupAppleSignInListeners) from firing
        event.stopImmediatePropagation();
        
        // Remove listeners
        window.removeEventListener('AppleSignInTokenReceived', tokenListener, true);
        window.removeEventListener('AppleSignInError', errorListener, true);
        
        // Authenticate with Supabase
        authenticateWithSupabase(token)
          .then((result) => resolve(result))
          .catch((error) => resolve({
            success: false,
            error: error.message || 'Failed to authenticate with Supabase'
          }));
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
async function authenticateWithSupabase(identityToken: string): Promise<AppleSignInResult> {
  try {
    if (!identityToken || identityToken.trim() === '') {
      console.error('❌ Apple Sign In: Empty identity token received');
      return {
        success: false,
        error: 'Invalid identity token from Apple. Please try again.'
      };
    }

    console.log('🔐 Apple Sign In: Authenticating with Supabase...');
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken
    });

    if (error) {
      console.error('❌ Apple Sign In: Supabase authentication error:', error);
      // Provide more specific error messages
      let errorMessage = 'Failed to sign in with Apple';
      if (error.message) {
        if (error.message.includes('Invalid token')) {
          errorMessage = 'The Apple Sign In token is invalid. Please try again.';
        } else if (error.message.includes('expired')) {
          errorMessage = 'The sign-in session has expired. Please try again.';
        } else {
          errorMessage = error.message;
        }
      }
      return {
        success: false,
        error: errorMessage
      };
    }

    if (!data.session) {
      console.error('❌ Apple Sign In: No session returned from Supabase');
      return {
        success: false,
        error: 'Authentication succeeded but no session was created. Please try again.'
      };
    }

    console.log('✅ Apple Sign In: Successfully authenticated with Supabase');
    return {
      success: true,
      session: data.session
    };
  } catch (error: any) {
    console.error('❌ Apple Sign In: Unexpected error:', error);
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

