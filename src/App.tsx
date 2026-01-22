import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import NotFound from "./pages/NotFound";
import SpotifyCallback from "./pages/SpotifyCallback";
import AppPage from "./pages/App";
// ArtistEvents and VenueEvents removed - using detail modals instead
import { StreamingStatsPage } from "./pages/StreamingStatsPage";
import { ArtistFollowingPage } from "./pages/ArtistFollowingPage";
import Admin from "./pages/Admin";
import MobilePreview from "./pages/mobile/MobilePreview";
import ComponentShowcase from "./pages/mobile/ComponentShowcase";
import ResetPassword from "./pages/ResetPassword";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

const queryClient = new QueryClient();

// Component to handle deep links and auth callbacks
// Must be inside BrowserRouter to use useLocation and useNavigate
function DeepLinkHandlerInner() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Handle deep links from Supabase auth callbacks
    const handleAuthCallback = async () => {
      const isMobile = Capacitor.isNativePlatform();
      
      // Check for Supabase auth tokens in URL hash (web) or query params (mobile)
      const hash = location.hash.substring(1);
      const search = location.search;
      
      // Parse hash params (web format: #access_token=...&type=...)
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');
      
      // Parse query params (mobile deep link format: ?access_token=...&type=...)
      const searchParams = new URLSearchParams(search);
      const queryAccessToken = searchParams.get('access_token');
      const queryRefreshToken = searchParams.get('refresh_token');
      const queryType = searchParams.get('type');
      
      // Use hash params if available, otherwise use query params
      const token = accessToken || queryAccessToken;
      const refresh = refreshToken || queryRefreshToken;
      const authType = type || queryType;
      
      if (token && authType) {
        try {
          // Set the session using the tokens from the URL
          const { data, error } = await supabase.auth.setSession({
            access_token: token,
            refresh_token: refresh || '',
          });
          
          if (error) {
            console.error('Error setting session from deep link:', error);
            return;
          }
          
          if (data.session) {
            console.log('✅ Successfully authenticated via deep link');
            
            // Route based on auth type
            if (authType === 'recovery') {
              // Password reset - navigate to reset password page
              navigate('/reset-password', { replace: true });
            } else if (authType === 'signup' || authType === 'email') {
              // Email confirmation - navigate to onboarding
              navigate('/#onboarding', { replace: true });
            } else {
              // Default: navigate to home
              navigate('/', { replace: true });
            }
            
            // Clear the URL hash/query params after processing
            if (isMobile) {
              // On mobile, we can't easily clear query params, but that's okay
              window.history.replaceState({}, document.title, window.location.pathname);
            } else {
              // On web, clear the hash
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          }
        } catch (error) {
          console.error('Error processing auth callback:', error);
        }
      }
    };
    
    // Also listen for Capacitor app URL events (for mobile deep links)
    if (Capacitor.isNativePlatform()) {
      const handleAppUrl = async (event: any) => {
        const url = event.url;
        if (url && url.startsWith('synth://')) {
          // Don't log full URL to avoid exposing sensitive auth tokens
          console.log('📱 Received synth:// deep link (auth callback)');
          
          try {
            // Parse the deep link URL
            // Supabase sends URLs like: synth://#access_token=...&type=recovery
            // or: synth://reset-password?access_token=...&type=recovery
            const urlObj = new URL(url);
            const path = urlObj.pathname;
            const hash = urlObj.hash.substring(1);
            const search = urlObj.search.substring(1); // Remove leading ?
            
            // Check for auth tokens in hash (Supabase default format)
            if (hash) {
              const hashParams = new URLSearchParams(hash);
              const accessToken = hashParams.get('access_token');
              const refreshToken = hashParams.get('refresh_token');
              const type = hashParams.get('type');
              
              if (accessToken && type) {
                // Set session directly from hash params
                const { data, error } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken || '',
                });
                
                if (error) {
                  console.error('Error setting session from deep link hash:', error);
                  return;
                }
                
                if (data.session) {
                  console.log('✅ Successfully authenticated via deep link (hash)');
                  
                  // Route based on auth type
                  if (type === 'recovery') {
                    navigate('/reset-password', { replace: true });
                  } else if (type === 'signup' || type === 'email') {
                    navigate('/#onboarding', { replace: true });
                  } else {
                    navigate('/', { replace: true });
                  }
                  
                  // Clear URL
                  window.history.replaceState({}, document.title, window.location.pathname);
                }
                return;
              }
            }
            
            // Check for auth tokens in query params (alternative format)
            if (search) {
              const searchParams = new URLSearchParams(search);
              const accessToken = searchParams.get('access_token');
              const refreshToken = searchParams.get('refresh_token');
              const type = searchParams.get('type');
              
              if (accessToken && type) {
                // Set session directly from query params
                const { data, error } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken || '',
                });
                
                if (error) {
                  console.error('Error setting session from deep link query:', error);
                  return;
                }
                
                if (data.session) {
                  console.log('✅ Successfully authenticated via deep link (query)');
                  
                  // Route based on auth type
                  if (type === 'recovery') {
                    navigate('/reset-password', { replace: true });
                  } else if (type === 'signup' || type === 'email') {
                    navigate('/#onboarding', { replace: true });
                  } else {
                    navigate('/', { replace: true });
                  }
                  
                  // Clear URL
                  window.history.replaceState({}, document.title, window.location.pathname);
                }
                return;
              }
            }
            
            // No auth tokens - regular deep link navigation
            if (path && path !== '/') {
              navigate(path, { replace: true });
            } else {
              navigate('/', { replace: true });
            }
          } catch (error) {
            console.error('Error processing deep link:', error);
            // Fallback: navigate to home
            navigate('/', { replace: true });
          }
        }
      };
      
      CapacitorApp.addListener('appUrlOpen', handleAppUrl);
      
      return () => {
        CapacitorApp.removeAllListeners();
      };
    }
    
    // Process auth callback on mount and when location changes
    handleAuthCallback();
  }, [location, navigate]);
  
  return null;
}

const App = () => {
  console.log('🎨 App component is rendering...');
  
  return (
    <div className="synth-app">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <DeepLinkHandlerInner />
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<AppPage />} />
              <Route path="/admin" element={<Admin />} />
              {/* Artist/Venue routes removed - using detail modals instead */}
              <Route path="/streaming-stats" element={<StreamingStatsPage />} />
              {/* Following routes for artists and venues */}
              <Route path="/following" element={<ArtistFollowingPage />} />
              <Route path="/following/:userId" element={<ArtistFollowingPage />} />
              <Route path="/auth/spotify/callback" element={<SpotifyCallback />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* Component showcase route */}
              <Route path="/components" element={<ComponentShowcase />} />
              {/* Mobile preview route for beta testing */}
              <Route path="/mobile-preview/*" element={<MobilePreview />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </div>
  );
};

export default App;
