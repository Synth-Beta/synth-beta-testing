import { useEffect, useState } from 'react';
import { spotifyService } from '@/services/spotifyService';
import { streamingSyncService } from '@/services/streamingSyncService';
import { logger } from '@/utils/logger';

const SpotifyCallback = () => {
  const [status, setStatus] = useState<'connecting' | 'syncing' | 'complete' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        setStatus('connecting');

        // Authenticate (exchanges code for token; saves refresh token to DB inside exchangeCodeForToken)
        const success = await spotifyService.handleAuthCallback();

        if (success) {
          streamingSyncService.startSync('spotify');
          setStatus('syncing');

          // Await sync so token + streaming_profiles are written before redirect (otherwise redirect kills the request)
          const syncTimeoutMs = 45000;
          await Promise.race([
            spotifyService.syncUserMusicPreferences(),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error('Sync timed out')), syncTimeoutMs)
            ),
          ]          ).catch((error) => {
            logger.error('Spotify sync error:', error);
            streamingSyncService.errorSync(error?.message || 'Sync failed');
            // Still proceed to complete so user gets redirected; data may be partial
          });

          setStatus('complete');
          setTimeout(() => {
            try {
              const source = typeof window !== 'undefined'
                ? localStorage.getItem('spotify_connect_source')
                : null;
              
              if (typeof window !== 'undefined') {
                localStorage.removeItem('spotify_connect_source');
              }

              if (source === 'streaming_stats') {
                window.location.href = '/streaming-stats';
                return;
              }

              if (source === 'onboarding') {
                localStorage.setItem('intendedView', 'onboarding');
                window.location.href = '/';
                return;
              }

              if (source === 'profile') {
                localStorage.setItem('intendedView', 'profile');
                window.location.href = '/';
                return;
              }
            } catch {
              // Ignore and fall through to default redirect
            }

            localStorage.setItem('intendedView', 'feed');
            window.location.href = '/';
          }, 1500);
        } else {
          setStatus('error');
          setErrorMessage("Authentication was not successful. Please try again.");
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
        }
      } catch (error) {
        logger.error('Spotify callback error:', error);
        setStatus('error');
        
        // Provide more specific error messages
        let errorMsg = "Failed to connect to Spotify. Please try again.";
        if (error instanceof Error) {
          if (error.message.includes('state mismatch')) {
            errorMsg = "Authentication session expired. Please try connecting again.";
          } else if (error.message.includes('Authentication failed')) {
            errorMsg = "Spotify authentication was cancelled or failed.";
          } else {
            errorMsg = error.message;
          }
        }
        
        setErrorMessage(errorMsg);
        // Clear any stored auth data to ensure clean retry
        await spotifyService.clearStoredData();

        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-beige-50">
      <div className="text-center max-w-md mx-auto p-8">
        {status === 'connecting' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold mb-2">Connecting to Spotify...</h2>
            <p className="text-muted-foreground">Please wait while we authenticate your account.</p>
          </>
        )}

        {status === 'syncing' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold mb-2">Syncing your music...</h2>
            <p className="text-muted-foreground">Saving your taste to personalize your feed. This may take a moment.</p>
          </>
        )}

        {status === 'complete' && (
          <>
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 var(--neutral-0)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">Successfully Connected!</h2>
            <p className="text-muted-foreground mb-2">Your stats are syncing in the background.</p>
            <p className="text-sm text-muted-foreground">You'll be notified when they're ready. Redirecting to app...</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 var(--neutral-0)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 text-red-600">Connection Failed</h2>
            <p className="text-muted-foreground mb-4">{errorMessage}</p>
            <p className="text-sm text-muted-foreground">Redirecting to home...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default SpotifyCallback;
