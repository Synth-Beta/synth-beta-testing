import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { spotifyService } from '@/services/spotifyService';
import { useToast } from '@/hooks/use-toast';

const SpotifyCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const success = await spotifyService.handleAuthCallback();
        if (success) {
          toast({
            title: "Connected to Spotify",
            description: "Successfully connected your Spotify account!",
          });
          // Navigate back to profile with a hash to open the spotify tab
          navigate('/#spotify');
        } else {
          navigate('/');
        }
      } catch (error) {
        console.error('Spotify callback error:', error);
        
        // Provide more specific error messages
        let errorMessage = "Failed to connect to Spotify. Please try again.";
        if (error instanceof Error) {
          if (error.message.includes('state mismatch')) {
            errorMessage = "Authentication session expired. Please try connecting again.";
          } else if (error.message.includes('Authentication failed')) {
            errorMessage = "Spotify authentication was cancelled or failed.";
          }
        }
        
        toast({
          title: "Connection Failed",
          description: errorMessage,
          variant: "destructive",
        });
        
        // Clear any stored auth data to ensure clean retry
        spotifyService.clearStoredData();
        navigate('/');
      }
    };

    handleCallback();
  }, [navigate, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
        <p className="text-muted-foreground">Connecting to Spotify...</p>
      </div>
    </div>
  );
};

export default SpotifyCallback;
