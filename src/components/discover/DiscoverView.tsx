import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, MapPin, X, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { RedesignedSearchPage } from '@/components/search/RedesignedSearchPage';
import { VibeSelectorModal } from './VibeSelectorModal';
import { DiscoverResultsView } from './DiscoverResultsView';
import { BecauseYouLikeSection } from './BecauseYouLikeSection';
import { ScenesSection } from './ScenesSection';
import { MapCalendarTourSection } from './MapCalendarTourSection';
import { LocationService } from '@/services/locationService';
import { supabase } from '@/integrations/supabase/client';
import type { VibeType } from '@/services/discoverVibeService';
import type { VibeFilters } from '@/services/discoverVibeService';
import { TopRightMenu } from '@/components/TopRightMenu';

interface DiscoverViewProps {
  currentUserId: string;
  onBack: () => void;
  onNavigateToNotifications?: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
  onViewChange?: (view: 'feed' | 'search' | 'profile') => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  currentUserId,
  onBack,
  onNavigateToNotifications,
  onNavigateToProfile,
  onNavigateToChat,
  onViewChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [vibeModalOpen, setVibeModalOpen] = useState(false);
  const [selectedVibe, setSelectedVibe] = useState<VibeType | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // Filter state - only location with coordinates
  const [filters, setFilters] = useState<VibeFilters>({
    radiusMiles: 30,
  });
  const [locationPopoverOpen, setLocationPopoverOpen] = useState(false);
  const [customCityInput, setCustomCityInput] = useState('');
  const [selectedLocationName, setSelectedLocationName] = useState<string>('');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load user location and set as default
  useEffect(() => {
    loadUserLocation();
  }, [currentUserId]);

  const loadUserLocation = async () => {
    try {
      // First try to get from user profile
      const { data: userProfile } = await supabase
        .from('users')
        .select('latitude, longitude, location_city')
        .eq('user_id', currentUserId)
        .single();
      
      if (userProfile?.latitude && userProfile?.longitude) {
        const location = {
          latitude: userProfile.latitude,
          longitude: userProfile.longitude,
        };
        setUserLocation(location);
        // Set as default location filter
        setFilters(prev => ({
          ...prev,
          latitude: location.latitude,
          longitude: location.longitude,
          radiusMiles: 30,
        }));
        setSelectedLocationName(userProfile.location_city || 'Current Location');
      } else {
        // Fallback to browser geolocation
        try {
          const currentLocation = await LocationService.getCurrentLocation();
          setUserLocation(currentLocation);
          setFilters(prev => ({
            ...prev,
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            radiusMiles: 30,
          }));
          
          // Get city name from coordinates
          try {
            const cityName = await LocationService.reverseGeocode(
              currentLocation.latitude,
              currentLocation.longitude
            );
            setSelectedLocationName(cityName || 'Current Location');
          } catch (geoError) {
            console.error('Error reverse geocoding:', geoError);
            setSelectedLocationName('Current Location');
          }
        } catch (geoError) {
          console.error('Error getting current location:', geoError);
        }
      }
    } catch (error) {
      console.error('Error loading user location:', error);
      // Try browser geolocation as fallback
      try {
        const currentLocation = await LocationService.getCurrentLocation();
        setUserLocation(currentLocation);
        setFilters(prev => ({
          ...prev,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          radiusMiles: 30,
        }));
        
        // Get city name from coordinates
        try {
          const cityName = await LocationService.reverseGeocode(
            currentLocation.latitude,
            currentLocation.longitude
          );
          setSelectedLocationName(cityName || 'Current Location');
        } catch (geoError) {
          console.error('Error reverse geocoding:', geoError);
          setSelectedLocationName('Current Location');
        }
      } catch (geoError) {
        console.error('Error getting current location:', geoError);
      }
    }
  };

  const handleSelectVibe = (vibeType: VibeType) => {
    setSelectedVibe(vibeType);
  };

  const handleBackFromVibe = () => {
    setSelectedVibe(null);
  };

  const handleUseCurrentLocation = async () => {
    setIsLoadingLocation(true);
    try {
      const currentLocation = await LocationService.getCurrentLocation();
      setUserLocation(currentLocation);
      setFilters({
        ...filters,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        radiusMiles: filters.radiusMiles || 30,
      });
      
      // Get city name from coordinates
      try {
        const cityName = await LocationService.reverseGeocode(
          currentLocation.latitude,
          currentLocation.longitude
        );
        setSelectedLocationName(cityName || 'Current Location');
      } catch (geoError) {
        console.error('Error reverse geocoding:', geoError);
        setSelectedLocationName('Current Location');
      }
      
      setLocationPopoverOpen(false);
    } catch (error) {
      console.error('Error getting current location:', error);
      alert('Failed to get your current location. Please try again or enter a city name.');
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const handleCitySearch = () => {
    const cityName = customCityInput.trim();
    if (!cityName) return;

    const city = LocationService.searchCity(cityName);
    if (city) {
      setFilters({
        ...filters,
        latitude: city.lat,
        longitude: city.lng,
        radiusMiles: filters.radiusMiles || 30,
      });
      setSelectedLocationName(city.state ? `${city.name}, ${city.state}` : city.name);
      setCustomCityInput('');
      setLocationPopoverOpen(false);
    } else {
      alert(`City "${cityName}" not found. Please try a major city name.`);
    }
  };

  const handleRadiusChange = (value: number[]) => {
    setFilters({
      ...filters,
      radiusMiles: value[0],
    });
  };

  const handleClearLocation = () => {
    setFilters({
      ...filters,
      latitude: undefined,
      longitude: undefined,
      radiusMiles: 30,
    });
    setSelectedLocationName('');
  };

  const hasActiveLocation = Boolean(filters.latitude && filters.longitude);

  // If a vibe is selected, show results view
  if (selectedVibe) {
    return (
      <DiscoverResultsView
        vibeType={selectedVibe}
        userId={currentUserId}
        filters={filters}
        onBack={handleBackFromVibe}
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToChat={onNavigateToChat}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#fcfcfc] pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* Top bar with search and menu */}
      <div className="sticky top-0 z-50 bg-[#fcfcfc] border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
          <RedesignedSearchPage
            userId={currentUserId}
            allowedTabs={['artists', 'venues', 'users', 'events']}
            showMap={false}
            layout="compact"
            mode="embedded"
            headerTitle=""
            headerDescription=""
            showHelperText={false}
            initialSearchQuery={searchQuery}
            hideSearchInput={false}
            showResults={false}
            onSearchStateChange={({ query, debouncedQuery }) => {
              setSearchQuery(query);
              setIsSearchActive(debouncedQuery.trim().length >= 2);
            }}
            onNavigateToProfile={onNavigateToProfile}
            onNavigateToChat={onNavigateToChat}
          />
        </div>
            <TopRightMenu />
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-6 space-y-2">

        {/* Browse Vibes and Location Filter - Always Visible (Above Search Results) */}
        <div className="mb-2 flex items-center gap-2 flex-wrap overflow-x-auto">
          {/* Browse Vibes Button */}
          <Button
            onClick={() => setVibeModalOpen(true)}
            className="bg-synth-pink hover:bg-synth-pink/90 text-white gap-2 flex-shrink-0"
            size="sm"
          >
            <Sparkles className="h-4 w-4" />
            Browse Vibes
          </Button>

          {/* Location Filter */}
          <Popover open={locationPopoverOpen} onOpenChange={setLocationPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 flex-shrink-0">
                <MapPin className="h-4 w-4" />
                Location
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-white" align="start">
              <div className="space-y-4">
                <div className="font-semibold text-sm">Set Location</div>
                
                {/* Current Location Button */}
                <Button
                  onClick={handleUseCurrentLocation}
                  disabled={isLoadingLocation}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  {isLoadingLocation ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Getting location...
                    </>
                  ) : (
                    <>
                      <MapPin className="h-4 w-4 mr-2" />
                      Use Current Location
                    </>
                  )}
                </Button>

                <div className="text-sm text-muted-foreground text-center">or</div>

                {/* City Input */}
              <div className="space-y-2">
                  <Input
                    placeholder="Enter city name (e.g., New York, Los Angeles)"
                    value={customCityInput}
                    onChange={(e) => setCustomCityInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCitySearch();
                      }
                    }}
                      />
                  <Button
                    onClick={handleCitySearch}
                    disabled={!customCityInput.trim()}
                    className="w-full"
                    size="sm"
                  >
                    Search City
                  </Button>
                </div>

                {/* Radius Slider */}
                {hasActiveLocation && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span>Radius: {filters.radiusMiles || 30} miles</span>
                      <span className="text-muted-foreground">Max: 50</span>
              </div>
                    <Slider
                      value={[filters.radiusMiles || 30]}
                      onValueChange={handleRadiusChange}
                      min={1}
                      max={50}
                      step={1}
                      className="w-full"
                    />
                  </div>
                )}

                {/* Clear Location */}
                {hasActiveLocation && (
                  <Button
                    onClick={handleClearLocation}
                    variant="ghost"
                    size="sm"
                    className="w-full"
                  >
                    Clear Location
                  </Button>
                )}
            </div>
            </PopoverContent>
          </Popover>
            </div>

        {/* Location Indicator Badge */}
        {hasActiveLocation && (
          <div className="mb-2">
            <Badge variant="secondary" className="gap-1 bg-synth-pink/10 text-synth-pink border-synth-pink/30">
              <MapPin className="h-3 w-3" />
              {selectedLocationName || 'Location'} ({filters.radiusMiles || 30} mi radius)
                <button
                onClick={handleClearLocation}
                className="ml-2 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
        </div>
        )}

        {/* Search Results - Below Filters when searching */}
        {isSearchActive && (
          <div className="mt-4">
          <RedesignedSearchPage
            userId={currentUserId}
              allowedTabs={['artists', 'venues', 'users', 'events']}
            showMap={false}
            layout="compact"
            mode="embedded"
            headerTitle=""
            headerDescription=""
            showHelperText={false}
              initialSearchQuery={searchQuery}
            hideSearchInput={true}
              showResults={true}
            onNavigateToProfile={onNavigateToProfile}
            onNavigateToChat={onNavigateToChat}
          />
        </div>
        )}

      {/* Main Content */}
      {!isSearchActive && (
          <>
            {/* Section 1: Because You Like ___ */}
            <BecauseYouLikeSection
            currentUserId={currentUserId}
            onNavigateToProfile={onNavigateToProfile}
            onNavigateToChat={onNavigateToChat}
          />

            {/* Section 2: Map/Calendar/Tour Section */}
            <MapCalendarTourSection
            currentUserId={currentUserId}
              filters={filters}
            onNavigateToProfile={onNavigateToProfile}
            onNavigateToChat={onNavigateToChat}
          />

            {/* Section 3: Scenes & Signals */}
            <div className="mt-8">
          <ScenesSection
            currentUserId={currentUserId}
            onNavigateToProfile={onNavigateToProfile}
            onNavigateToChat={onNavigateToChat}
          />
            </div>
          </>
        )}
        </div>

      {/* Vibe Selector Modal */}
      <VibeSelectorModal
        isOpen={vibeModalOpen}
        onClose={() => setVibeModalOpen(false)}
        onSelectVibe={handleSelectVibe}
        isMobile={isMobile}
      />

    </div>
  );
};
