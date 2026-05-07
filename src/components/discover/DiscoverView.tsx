import React, { useState, useEffect, Suspense } from 'react';
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
import { MapCalendarTourSection } from './MapCalendarTourSection';
import { GenreChatsSection } from './GenreChatsSection';
import { LocationService } from '@/services/locationService';
import { CityService, type CityData } from '@/services/cityService';
import { supabase } from '@/integrations/supabase/client';
import type { VibeType } from '@/services/discoverVibeService';
import type { VibeFilters } from '@/services/discoverVibeService';
import { MobileHeader } from '@/components/Header/MobileHeader';
import { SearchBar } from '@/components/SearchBar/SearchBar';
import { useViewTracking } from '@/hooks/useViewTracking';
import { Share2 } from 'lucide-react';
import { ShareService } from '@/services/shareService';
import PageShell from '@/components/layout/PageShell';
import { UniversalShareModal } from '@/components/share/UniversalShareModal';
const ArtistDetailModal = React.lazy(() => import('@/components/discover/modals/ArtistDetailModal').then(m => ({ default: m.ArtistDetailModal })));
const VenueDetailModal = React.lazy(() => import('@/components/discover/modals/VenueDetailModal').then(m => ({ default: m.VenueDetailModal })));
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { UserEventService } from '@/services/userEventService';
import { fetchEventForModal } from '@/services/eventLookupService';

type DiscoverDetailView =
  | { type: 'artist'; id: string; name: string }
  | { type: 'venue'; id: string; name: string }
  | { type: 'event'; id: string; name: string };

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
  webDesktopChrome?: boolean;
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
  webDesktopChrome = false,
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
  const [citySuggestions, setCitySuggestions] = useState<CityData[]>([]);
  const [isSearchingCities, setIsSearchingCities] = useState(false);
  const [selectedLocationName, setSelectedLocationName] = useState<string>('');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const [detailView, setDetailView] = useState<DiscoverDetailView | null>(null);

  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareDetail, setShareDetail] = useState<DiscoverDetailView | null>(null);

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

  // Debounced trigram city search (discover location filter)
  useEffect(() => {
    const q = customCityInput.trim();
    if (q.length < 2) {
      setCitySuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      setIsSearchingCities(true);
      try {
        const results = await CityService.searchCities(q, 15);
        setCitySuggestions(results);
      } finally {
        setIsSearchingCities(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [customCityInput]);

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

  const handleCloseDetail = () => {
    if (detailView?.type === 'event') {
      setEventDetailsOpen(false);
      setSelectedEvent(null);
    }
    setDetailView(null);
  };

  const handleEventClickFromVenue = async (eventId: string) => {
    if (!eventId) return;
    try {
      const { event: eventData, error } = await fetchEventForModal(eventId);
      if (error) {
        console.error('Error opening event from venue:', error);
        return;
      }

      if (!eventData) {
        console.warn('Event not found from venue click:', eventId);
        return;
      }

      setSelectedEvent(eventData);
      const interested = await UserEventService.isUserInterested(currentUserId, eventData.id);
      setSelectedEventInterested(interested);
      setEventDetailsOpen(true);
      setDetailView({
        type: 'event',
        id: eventId,
        name: eventData.artist_name || eventData.title || 'Event',
      });
    } catch (err) {
      console.error('Error opening event from venue:', err);
    }
  };

  const handleShareDetail = () => {
    if (!detailView) return;
    setShareDetail(detailView);
    setShareModalOpen(true);
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

  const applyCity = (city: CityData) => {
    const lat = city.center_latitude;
    const lng = city.center_longitude;
    if (lat == null || lng == null) return;
    setFilters({
      ...filters,
      latitude: Number(lat),
      longitude: Number(lng),
      radiusMiles: filters.radiusMiles || 30,
    });
    const label = [city.name, city.state, city.country].filter(Boolean).join(', ');
    setSelectedLocationName(label);
    setCustomCityInput('');
    setCitySuggestions([]);
    setLocationPopoverOpen(false);
  };

  const handleSelectCitySuggestion = (city: CityData) => {
    applyCity(city);
  };

  const handleCitySearch = async () => {
    const cityName = customCityInput.trim();
    if (!cityName) return;

    const results = await CityService.searchCities(cityName, 5);
    if (results.length > 0) {
      applyCity(results[0]);
      return;
    }
    const fallback = LocationService.searchCity(cityName);
    if (fallback) {
      setFilters({
        ...filters,
        latitude: fallback.lat,
        longitude: fallback.lng,
        radiusMiles: filters.radiusMiles || 30,
      });
      setSelectedLocationName(fallback.state ? `${fallback.name}, ${fallback.state}` : fallback.name);
      setCustomCityInput('');
      setLocationPopoverOpen(false);
    } else {
      alert(`City "${cityName}" not found. Try another spelling or pick from the suggestions.`);
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

  const discoverHeader = !hideHeader
    ? detailView
      ? (
        <MobileHeader
          alignLeft={true}
          leftIcon="left"
          onLeftIconClick={handleCloseDetail}
          rightButton={
            <button
              className="mobile-header__menu-button"
              onClick={handleShareDetail}
              aria-label="Share"
              type="button"
            >
              <Share2 size={24} style={{ color: 'var(--neutral-900)' }} aria-hidden="true" />
            </button>
          }
        >
          <h1
            className="font-bold truncate"
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-h2-size, 24px)',
              fontWeight: 'var(--typography-h2-weight, 700)',
              lineHeight: 'var(--typography-h2-line-height, 1.3)',
              color: 'var(--neutral-900)',
            }}
          >
            {detailView.name}
          </h1>
        </MobileHeader>
      )
      : webDesktopChrome
      ? undefined
      : (
        <MobileHeader menuOpen={menuOpen} onMenuClick={onMenuClick}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            width: '100%',
            maxWidth: '100%',
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
      )
    : undefined;

  return (
    <PageShell header={discoverHeader}>
      {!hideHeader && !detailView && webDesktopChrome && (
        <header
          className="sticky z-30 border-b border-[var(--neutral-200)] bg-[var(--neutral-50)] px-4 py-2 shadow-sm"
          style={{
            top: 'var(--onboarding-banner-height, 0px)',
            paddingTop: 'var(--mobile-header-padding-top, env(safe-area-inset-top, 0px))',
            marginBottom: 'var(--spacing-small, 12px)',
          }}
        >
          <SearchBar
            value={searchQuery}
            onChange={(value) => {
              setSearchQuery(value);
              setIsSearchActive(value.trim().length >= 2);
            }}
            placeholder='Try "Radiohead"'
            widthVariant="flex"
          />
        </header>
      )}
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
      <div
        className={webDesktopChrome ? 'w-full max-w-none mx-auto' : 'max-w-7xl mx-auto'}
        style={{
          overflow: 'visible',
          minHeight: 'auto',
          position: 'relative',
          zIndex: 1,
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

                {/* City Input + trigram typeahead */}
              <div className="space-y-2 relative">
                  <Input
                    placeholder="Search city (e.g., New York, Los Angeles)"
                    value={customCityInput}
                    onChange={(e) => setCustomCityInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCitySearch();
                      }
                    }}
                  />
                  {isSearchingCities && (
                    <div className="text-sm mt-0.5" style={{ color: 'var(--neutral-500)' }}>
                      Searching…
                    </div>
                  )}
                  {citySuggestions.length > 0 && customCityInput.trim().length >= 2 && (
                    <ul
                      className="absolute z-50 w-full mt-1 rounded-md border bg-white shadow-lg max-h-48 overflow-auto"
                      style={{
                        borderColor: 'var(--neutral-200)',
                        top: '100%',
                        left: 0,
                        right: 0,
                      }}
                    >
                      {citySuggestions.map((city) => (
                        <li key={city.id ?? `${city.name}-${city.state ?? ''}-${city.country ?? ''}`}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100"
                            style={{ color: 'var(--neutral-900)' }}
                            onClick={() => handleSelectCitySuggestion(city)}
                          >
                            {[city.name, city.state, city.country].filter(Boolean).join(', ')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
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
            onArtistClick={(artistId, artistName) => setDetailView({ type: 'artist', id: artistId, name: artistName })}
            onVenueClick={(venueId, venueName) => setDetailView({ type: 'venue', id: venueId, name: venueName })}
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

            {/* Section 3: Genre Communities */}
            <GenreChatsSection
              currentUserId={currentUserId}
              onNavigateToChat={onNavigateToChat}
            />

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

      {/* Artist/Venue detail overlays (single Discover header drives navigation) */}
      <Suspense fallback={null}>
        {detailView?.type === 'artist' && (
          <ArtistDetailModal
            isOpen={true}
            onClose={handleCloseDetail}
            artistId={detailView.id}
            artistName={detailView.name}
            currentUserId={currentUserId}
            onEventClick={(eventId) => {
              handleCloseDetail();
              handleEventClickFromVenue(eventId);
            }}
          />
        )}
        {detailView?.type === 'venue' && (
          <VenueDetailModal
            isOpen={true}
            onClose={handleCloseDetail}
            venueId={detailView.id}
            venueName={detailView.name}
            currentUserId={currentUserId}
            onEventClick={(eventId) => {
              handleCloseDetail();
              handleEventClickFromVenue(eventId);
            }}
          />
        )}
      </Suspense>

      {/* Event Details Modal (opened from venue event cards) */}
      {eventDetailsOpen && selectedEvent && (
        <EventDetailsModal
          isOpen={eventDetailsOpen}
          onClose={() => {
            setEventDetailsOpen(false);
            setSelectedEvent(null);
            if (detailView?.type === 'event') {
              setDetailView(null);
            }
          }}
          event={selectedEvent}
          currentUserId={currentUserId}
          isInterested={selectedEventInterested}
          onEventChange={(newEvent, isInterested) => {
            setSelectedEvent(newEvent);
            setSelectedEventInterested(isInterested ?? false);
            setDetailView({ type: 'event', id: newEvent.id, name: newEvent.artist_name || newEvent.title || 'Event' });
          }}
          onInterestToggle={async (eventId, interested) => {
            try {
              await UserEventService.setEventInterest(currentUserId, eventId, interested);
              setSelectedEventInterested(interested);
            } catch (error) {
              console.error('Error toggling interest:', error);
            }
          }}
          onNavigateToProfile={onNavigateToProfile}
          onNavigateToChat={onNavigateToChat}
            />
      )}

      {shareModalOpen && shareDetail && (
        <UniversalShareModal
          type={shareDetail.type}
          title={shareDetail.name}
          url={
            shareDetail.type === 'event'
              ? ShareService.getEventUrl(shareDetail.id)
              : shareDetail.type === 'artist'
                ? ShareService.getArtistUrl(shareDetail.id)
                : ShareService.getVenueUrl(shareDetail.id)
          }
          currentUserId={currentUserId}
          eventId={shareDetail.type === 'event' ? shareDetail.id : undefined}
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setShareDetail(null);
          }}
        />
      )}

    </PageShell>
  );
};
