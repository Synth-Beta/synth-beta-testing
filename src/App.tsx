import React, { useEffect, Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import { SynthLoader } from "@/components/ui/SynthLoader";
import SpotifyCallback from "./pages/SpotifyCallback";
import AppPage from "./pages/App";
import { ShareLinkBootstrap } from "@/components/ShareLinkBootstrap";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const RouteFallback = () => (
  <div className="flex min-h-[200px] items-center justify-center">
    <SynthLoader size="md" variant="spinner" inline />
  </div>
);

const Admin = React.lazy(() => import("./pages/Admin"));
const ArtistPage = React.lazy(() => import("./pages/ArtistPage").then(m => ({ default: m.default })));
const VenuePage = React.lazy(() => import("./pages/VenuePage").then(m => ({ default: m.default })));
const StreamingStatsPage = React.lazy(() => import("./pages/StreamingStatsPage").then(m => ({ default: m.StreamingStatsPage })));
const ArtistFollowingPage = React.lazy(() => import("./pages/ArtistFollowingPage").then(m => ({ default: m.ArtistFollowingPage })));
const ResetPassword = React.lazy(() => import("./pages/ResetPassword").then(m => ({ default: m.default })));
const NotFound = React.lazy(() => import("./pages/NotFound").then(m => ({ default: m.default })));
const SharePage = React.lazy(() => import("./pages/SharePage").then(m => ({ default: m.SharePage })));

// Component to handle deep links and auth callbacks
// Must be inside BrowserRouter to use useLocation and useNavigate
function DeepLinkHandlerInner() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Handle deep links from Supabase auth callbacks
    const handleAuthCallback = async () => {
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
              navigate('/#onboarding', { replace: true });
            } else {
              // Default: navigate to home
              navigate('/', { replace: true });
            }
            
            // Clear the URL hash/query params after processing
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (error) {
          console.error('Error processing auth callback:', error);
        }
      }
    };
    
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
          <BrowserRouter>
            <ShareLinkBootstrap />
            <DeepLinkHandlerInner />
            <ScrollToTop />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<AppPage />} />
                <Route path="/admin" element={<Admin />} />
              {/* Artist/Venue info pages (support id or name) */}
              <Route path="/artist/:artistIdOrName" element={<ArtistPage />} />
              <Route path="/venue/:venueIdOrName" element={<VenuePage />} />
              <Route path="/streaming-stats" element={<StreamingStatsPage />} />
              {/* Following routes for artists and venues */}
              <Route path="/following" element={<ArtistFollowingPage />} />
              <Route path="/following/:userId" element={<ArtistFollowingPage />} />
              <Route path="/auth/spotify/callback" element={<SpotifyCallback />} />
              <Route path="/share" element={<SharePage />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/not-found" element={<NotFound />} />
{/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </div>
  );
};

export default App;
