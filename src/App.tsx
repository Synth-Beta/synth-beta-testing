import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import NotFound from "./pages/NotFound";
import SpotifyCallback from "./pages/SpotifyCallback";
import AppPage from "./pages/App";
import ArtistEvents from "./pages/ArtistEvents";
import VenueEvents from "./pages/VenueEvents";
import { StreamingStatsPage } from "./pages/StreamingStatsPage";
import { ArtistFollowingPage } from "./pages/ArtistFollowingPage";
import Admin from "./pages/Admin";
import MobilePreview from "./pages/mobile/MobilePreview";
import ComponentShowcase from "./pages/mobile/ComponentShowcase";
import ResetPassword from "./pages/ResetPassword";

const queryClient = new QueryClient();

const App = () => {
  console.log('🎨 App component is rendering...');
  
  return (
    <div className="synth-app">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<AppPage />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/artist/:artistId" element={<ArtistEvents />} />
              <Route path="/venue/:venueId" element={<VenueEvents />} />
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
