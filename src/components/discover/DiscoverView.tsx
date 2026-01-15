import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/Icon/Icon';
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
import { MobileHeader } from '@/components/Header/MobileHeader';
import { SearchBar } from '@/components/SearchBar/SearchBar';

interface DiscoverViewProps {
  currentUserId: string;
  onBack: () => void;
  onNavigateToNotifications?: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
  onViewChange?: (view: 'feed' | 'search' | 'profile') => void;
  menuOpen?: boolean;
  onMenuClick?: () => void;
  hideHeader?: boolean;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  currentUserId,
  onBack,
  onNavigateToNotifications,
  onNavigateToProfile,
  onNavigateToChat,
  onViewChange,
  menuOpen = false,
  onMenuClick,
  hideHeader = false,
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
    <div 
      className="min-h-screen" 
      style={{ 
        backgroundColor: 'var(--neutral-50)',
        overflow: 'visible' // Ensure content is not clipped
      }}
    >
      {/* Mobile Header with SearchBar */}
      {!hideHeader && (
      <MobileHeader menuOpen={menuOpen} onMenuClick={onMenuClick}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '6px', 
          width: '100%', 
          maxWidth: '100%'
        }}>
          <SearchBar 
            value={searchQuery}
            onChange={(value) => {
              setSearchQuery(value);
              setIsSearchActive(value.trim().length >= 2);
            }}
            placeholder='Try "Radiohead"'
            widthVariant="flex"
          />
        </div>
      </MobileHeader>
      )}
      <div 
        className="max-w-7xl mx-auto space-y-2" 
        style={{ 
          paddingLeft: 'var(--spacing-screen-margin-x, 20px)', 
          paddingRight: 'var(--spacing-screen-margin-x, 20px)', 
          paddingTop: hideHeader ? `calc(env(safe-area-inset-top, 0px) + var(--spacing-small, 12px))` : `calc(env(safe-area-inset-top, 0px) + 68px + var(--spacing-small, 12px))`, 
          paddingBottom: 'var(--spacing-bottom-nav, 112px)',
          overflow: 'visible', // Ensure content is not clipped
          minHeight: 'auto' // Allow content to determine height
        }}
      >

        {/* Browse Vibes and Location Filter - Always Visible (Above Search Results) */}
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          {/* Browse Vibes Button */}
          <Button
            onClick={() => setVibeModalOpen(true)}
            className="gap-2 flex-shrink-0" 
            style={{ backgroundColor: 'var(--brand-pink-500)', color: 'var(--neutral-50)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-pink-500)'; }}
            size="sm"
            data-tour="discover-vibes"
          >
            <Icon name="mediumShootingStar" size={16} color="var(--neutral-50)" />
            Browse Vibes
          </Button>

          {/* Location Filter */}
          <Popover open={locationPopoverOpen} onOpenChange={setLocationPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 flex-shrink-0" style={{
                height: 'var(--size-button-height, 36px)',
                paddingLeft: 'var(--spacing-small, 12px)',
                paddingRight: 'var(--spacing-small, 12px)',
                borderColor: 'var(--neutral-200)',
                color: 'var(--neutral-900)',
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)'
              }}>
                <Icon name="location" size={16} color="var(--neutral-900)" />
                <span style={{ color: 'var(--neutral-900)' }}>Location</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" style={{ backgroundColor: 'var(--neutral-50)' }} align="start">
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
                      <Icon name="refresh" size={16} className="mr-2 animate-spin" color="var(--neutral-900)" />
                      Getting location...
                    </>
                  ) : (
                    <>
                      <Icon name="location" size={16} className="mr-2" color="var(--neutral-900)" />
                      Use Current Location
                    </>
                  )}
                </Button>

                <div className="text-sm text-center" style={{ color: 'var(--neutral-600)' }}>or</div>

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
                      <span style={{ color: 'var(--neutral-600)' }}>Max: 50</span>
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
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: '22px',
                paddingLeft: 'var(--spacing-small, 12px)',
                paddingRight: 'var(--spacing-small, 12px)',
                borderRadius: 'var(--radius-corner, 10px)',
                backgroundColor: 'var(--brand-pink-050)',
                border: '2px solid var(--brand-pink-500)',
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--brand-pink-500)',
                boxShadow: '0 4px 4px 0 var(--shadow-color)',
                gap: 'var(--spacing-inline, 6px)'
              }}
            >
              <Icon name="location" size={16} color="var(--neutral-900)" />
              <span>{selectedLocationName || 'Location'} ({filters.radiusMiles || 30} mi radius)</span>
              <button
                onClick={handleClearLocation}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  marginLeft: 'var(--spacing-inline, 6px)'
                }}
                className="ml-2 hover:text-destructive"
                >
                  <Icon name="x" size={16} color="var(--neutral-900)" />
                </button>
            </div>
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
