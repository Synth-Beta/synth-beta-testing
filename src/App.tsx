import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SpotifyCallback from "./pages/SpotifyCallback";
import Landing from "./pages/Landing";
import About from "./pages/About";
import AppPage from "./pages/App";

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
              <Route path="/" element={<Index />} />
              <Route path="/home" element={<Landing />} />
              <Route path="/about" element={<About />} />
              <Route path="/app" element={<AppPage />} />
              <Route path="/auth/spotify/callback" element={<SpotifyCallback />} />
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
