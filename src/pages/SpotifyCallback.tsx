import { useEffect, useState } from 'react';
import { spotifyService } from '@/services/spotifyService';
import { useToast } from '@/hooks/use-toast';

const SpotifyCallback = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<'connecting' | 'syncing' | 'complete' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        setStatus('connecting');
        const success = await spotifyService.handleAuthCallback();
        
        if (success) {
          // handleAuthCallback already performs the sync, so we're done
          setStatus('complete');
          toast({
            title: "Connected to Spotify",
            description: "Successfully connected and synced! Redirecting to your stats...",
          });
          
          // Wait a moment for toast to show, then redirect
          setTimeout(() => {
            // Use window.location.href for full page redirect (consistent with app pattern)
            window.location.href = '/streaming-stats';
          }, 1500);
        } else {
          setStatus('error');
          setErrorMessage("Authentication was not successful. Please try again.");
          toast({
            title: "Connection Failed",
            description: "Failed to connect to Spotify. Please try again.",
            variant: "destructive",
          });
          
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
        }
      } catch (error) {
        console.error('Spotify callback error:', error);
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
        toast({
          title: "Connection Failed",
          description: errorMsg,
          variant: "destructive",
        });
        
        // Clear any stored auth data to ensure clean retry
        spotifyService.clearStoredData();
        
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      }
    };

    handleCallback();
  }, [toast]);

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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold mb-2">Syncing Your Stats...</h2>
            <p className="text-muted-foreground">This may take 10-30 seconds. We're fetching all your streaming data.</p>
          </>
        )}
        
        {status === 'complete' && (
          <>
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">Successfully Connected!</h2>
            <p className="text-muted-foreground">Redirecting to your streaming stats...</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
