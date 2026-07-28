import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ModernLandingPage } from "@/components/ModernLandingPage";
import Admin from "@/pages/Admin";
import Media from "@/pages/Media";
import Preview from "@/pages/Preview";

const queryClient = new QueryClient();

// Debug component to see what route is active
const RouteDebugger = () => {
  const location = useLocation();
  console.log('🔍 Route Debugger - Current location:', location.pathname);
  return null;
};

const App = () => {
  console.log('🎨 App component is rendering...');
  console.log('📍 Current pathname:', window.location.pathname);
  
  return (
    <div className="synth-app">
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/admin" element={<><RouteDebugger /><Admin /></>} />
                <Route path="/pr" element={<><RouteDebugger /><Media /></>} />
                <Route path="/preview" element={<><RouteDebugger /><Preview /></>} />
                <Route path="/" element={<><RouteDebugger /><ModernLandingPage /></>} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </div>
  );
};

export default App;
