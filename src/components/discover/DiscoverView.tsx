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
import { useViewTracking } from '@/hooks/useViewTracking';

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

  // Track discover view
  useViewTracking('view', 'discover', { source: 'discover' });

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
          } catch (geoError: any) {
            // Only log unexpected errors, not permission denials
            if (geoError?.code !== 1) { // 1 = PERMISSION_DENIED
              console.error('Error reverse geocoding:', geoError);
            }
            setSelectedLocationName('Current Location');
          }
        } catch (geoError: any) {
          // Only log unexpected errors, not permission denials
          if (geoError?.code !== 1) { // 1 = PERMISSION_DENIED
            console.error('Error getting current location:', geoError);
          }
          // Set fallback values when geolocation fails
          // Don't set userLocation or filters - let user manually select location
          setSelectedLocationName('');
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
          // Only log unexpected errors, not permission denials
          if ((geoError as any)?.code !== 1) { // 1 = PERMISSION_DENIED
            console.error('Error reverse geocoding:', geoError);
          }
          setSelectedLocationName('Current Location');
        }
      } catch (geoError: any) {
        // Only log unexpected errors, not permission denials
        if (geoError?.code !== 1) { // 1 = PERMISSION_DENIED
          console.error('Error getting current location:', geoError);
        }
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

  const handleClearRadius = () => {
    setFilters({
      ...filters,
      radiusMiles: 30,
    });
    // Close the location popover if open to provide clear feedback
    // The popover will re-open if user clicks location again
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
    <main 
      className="page-container" 
      style={{ 
        overflow: 'visible',
        backgroundColor: 'var(--neutral-50)',
        position: 'relative',
        minHeight: '100vh'
      }}
    >
      {/* Glass backdrop context - blobs and noise */}
      <div 
        className="swift-ui-discover-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 0,
          overflow: 'hidden'
        }}
      >
        {/* Gradient blobs */}
        <div 
          className="swift-ui-discover-blob"
          style={{
            position: 'absolute',
            top: '10%',
            left: '5%',
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-pink-500) 20%, transparent) 0%, transparent 70%)',
            filter: 'blur(80px)',
            opacity: 0.4,
            pointerEvents: 'none'
          }}
        />
        <div 
          className="swift-ui-discover-blob"
          style={{
            position: 'absolute',
            top: '50%',
            right: '10%',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-pink-400) 15%, transparent) 0%, transparent 70%)',
            filter: 'blur(100px)',
            opacity: 0.3,
            pointerEvents: 'none'
          }}
        />
        <div 
          className="swift-ui-discover-blob"
          style={{
            position: 'absolute',
            bottom: '20%',
            left: '20%',
            width: '250px',
            height: '250px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-pink-300) 18%, transparent) 0%, transparent 70%)',
            filter: 'blur(60px)',
            opacity: 0.35,
            pointerEvents: 'none'
          }}
        />
        {/* Noise overlay */}
        <div 
          className="swift-ui-discover-noise"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: 0.05
          }}
        />
      </div>
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
        className="max-w-7xl mx-auto" 
        style={{ 
          paddingLeft: 'var(--spacing-screen-margin-x, 20px)', 
          paddingRight: 'var(--spacing-screen-margin-x, 20px)', 
          paddingTop: hideHeader ? `calc(env(safe-area-inset-top, 0px) + var(--spacing-small, 12px))` : `calc(env(safe-area-inset-top, 0px) + 68px + var(--spacing-small, 12px))`, 
          paddingBottom: 'var(--spacing-bottom-nav, 32px)',
          overflow: 'visible',
          minHeight: 'auto',
          position: 'relative',
          zIndex: 1
        }}
      >
        {/* Browse Vibes and Location Filter */}
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 'var(--spacing-small, 12px)' }}>
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
            <Icon name="mediumShootingStar" size={24} color="var(--neutral-50)" />
            Browse Vibes
          </Button>

          {/* Location Filter */}
          <Popover open={locationPopoverOpen} onOpenChange={setLocationPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="secondary-neutral" className="gap-2 flex-shrink-0" style={{
                height: 'var(--size-button-height, 36px)',
                paddingLeft: 'var(--spacing-small, 12px)',
                paddingRight: 'var(--spacing-small, 12px)',
                borderColor: 'var(--neutral-200)',
                color: 'var(--neutral-900) !important',
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)'
              }}>
                <Icon name="location" size={24} color="var(--neutral-900)" />
                Location
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 swift-ui-card" align="start">
              <div className="swift-ui-card-content space-y-4">
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

        {/* Location Indicator Badges */}
        <div className="flex flex-wrap gap-2" style={{ marginBottom: '24px' }}>
          {/* Location Pill - Only show when location is active */}
          {hasActiveLocation && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: '25px',
                paddingLeft: 'var(--spacing-small, 12px)',
                paddingRight: 'var(--spacing-small, 12px)',
                borderRadius: '999px',
                backgroundColor: 'var(--brand-pink-050)',
                border: '2px solid var(--brand-pink-500)',
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--brand-pink-500)',
                gap: 'var(--spacing-inline, 6px)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                width: 'fit-content',
                maxWidth: '100%'
              }}
            >
              <Icon name="location" size={19} color="var(--brand-pink-500)" />
              <span style={{ 
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--brand-pink-500)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flexShrink: 1
              }}>
                {selectedLocationName || 'Location'}
              </span>
              <button
                onClick={handleClearLocation}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  marginLeft: 'var(--spacing-inline, 6px)'
                }}
                className="hover:text-destructive"
                aria-label="Clear location"
              >
                <Icon name="x" size={19} color="var(--brand-pink-500)" />
              </button>
            </div>
          )}

          {/* Radius Pill - Show only when a custom radius is set (different from default 30) */}
          {(filters.radiusMiles && filters.radiusMiles !== 30) && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: '25px',
                paddingLeft: 'var(--spacing-small, 12px)',
                paddingRight: 'var(--spacing-small, 12px)',
                borderRadius: '999px',
                backgroundColor: 'var(--brand-pink-050)',
                border: '2px solid var(--brand-pink-500)',
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--brand-pink-500)',
                gap: 'var(--spacing-inline, 6px)',
                whiteSpace: 'nowrap',
                width: 'fit-content'
              }}
            >
              <span style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--brand-pink-500)'
              }}>{filters.radiusMiles || 30} mi radius</span>
              <button
                onClick={handleClearRadius}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  marginLeft: 'var(--spacing-inline, 6px)'
                }}
                className="hover:text-destructive"
                aria-label="Clear radius"
              >
                <Icon name="x" size={19} color="var(--brand-pink-500)" />
              </button>
            </div>
          )}
        </div>

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
            <div style={{ marginBottom: '32px' }}>
            <BecauseYouLikeSection
            currentUserId={currentUserId}
            onNavigateToProfile={onNavigateToProfile}
            onNavigateToChat={onNavigateToChat}
          />
            </div>

            {/* Section 2: Map/Calendar/Tour Section */}
            <div style={{ marginBottom: '32px' }}>
            <MapCalendarTourSection
            currentUserId={currentUserId}
              filters={filters}
            onNavigateToProfile={onNavigateToProfile}
            onNavigateToChat={onNavigateToChat}
          />
            </div>

            {/* Section 3: Scenes & Signals */}
            <div>
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

    </main>
  );
};
