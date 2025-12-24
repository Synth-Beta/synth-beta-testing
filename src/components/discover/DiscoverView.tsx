import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Sparkles, X, Calendar as CalendarIcon, MapPin, Music } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
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

const COMMON_GENRES = [
  'Rock', 'Pop', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'Country', 
  'R&B', 'Reggae', 'Folk', 'Blues', 'Alternative', 'Indie', 'Punk',
  'Metal', 'Funk', 'Soul', 'Gospel', 'Latin', 'World'
];

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
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [vibeModalOpen, setVibeModalOpen] = useState(false);
  const [selectedVibe, setSelectedVibe] = useState<VibeType | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // Filter state
  const [filters, setFilters] = useState<VibeFilters>({
    dateRange: undefined,
    genres: [],
    cities: [],
    radiusMiles: 25,
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [genresOpen, setGenresOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [tempSelectedCities, setTempSelectedCities] = useState<string[]>([]);
  const [citiesData, setCitiesData] = useState<Array<{ city: string; state: string; eventCount: number }>>([]);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
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
      } catch (geoError) {
        console.error('Error getting current location:', geoError);
      }
    }
  };

  // Load cities data
  useEffect(() => {
    if (locationsOpen) {
      loadCities();
    }
  }, [locationsOpen]);

  const loadCities = async () => {
    setIsLoadingCities(true);
    try {
      const { data } = await supabase
        .from('events')
        .select('venue_city, venue_state')
        .gte('event_date', new Date().toISOString())
        .not('venue_city', 'is', null)
        .limit(1000);

      const cityMap = new Map<string, { city: string; state: string; eventCount: number }>();
      (data || []).forEach((event: any) => {
        if (event.venue_city) {
          const key = `${event.venue_city}, ${event.venue_state || ''}`.trim();
          const existing = cityMap.get(key);
          if (existing) {
            existing.eventCount += 1;
          } else {
            cityMap.set(key, {
              city: event.venue_city,
              state: event.venue_state || '',
              eventCount: 1,
            });
          }
        }
      });

      setCitiesData(
        Array.from(cityMap.values())
          .sort((a, b) => b.eventCount - a.eventCount)
          .slice(0, 50)
      );
    } catch (error) {
      console.error('Error loading cities:', error);
    } finally {
      setIsLoadingCities(false);
    }
  };


  const handleSelectVibe = (vibeType: VibeType) => {
    setSelectedVibe(vibeType);
  };

  const handleBackFromVibe = () => {
    setSelectedVibe(null);
  };

  const handleGenreToggle = (genre: string) => {
    const newGenres = filters.genres?.includes(genre)
      ? filters.genres.filter(g => g !== genre)
      : [...(filters.genres || []), genre];
    
    setFilters({
      ...filters,
      genres: newGenres,
    });
  };

  const handleCitiesApply = () => {
    setFilters({
      ...filters,
      cities: tempSelectedCities,
    });
    setLocationsOpen(false);
  };

  const handleCityToggle = (cityKey: string) => {
    setTempSelectedCities(prev =>
      prev.includes(cityKey)
        ? prev.filter(c => c !== cityKey)
        : [...prev, cityKey]
    );
  };

  const clearFilters = () => {
    const newFilters: VibeFilters = {
      dateRange: undefined,
      genres: [],
      cities: [],
      radiusMiles: 30,
    };
    // Keep location if available
    if (userLocation) {
      newFilters.latitude = userLocation.latitude;
      newFilters.longitude = userLocation.longitude;
    }
    setFilters(newFilters);
    setTempSelectedCities([]);
  };

  const hasActiveFilters = Boolean(
    filters.dateRange?.from ||
    filters.dateRange?.to ||
    (filters.genres && filters.genres.length > 0) ||
    (filters.cities && filters.cities.length > 0)
  );

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-6 space-y-2">
        {/* Search Bar - Integrated Design with Pink Accent */}
        <div className="mb-2">
          <button
            onClick={() => setIsSearchActive(true)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-synth-pink/5 border border-synth-pink/30 rounded-lg hover:border-synth-pink/60 hover:bg-synth-pink/10 transition-all text-left"
          >
            <Search className="h-4 w-4 text-synth-pink" />
            <span className="text-gray-600 text-xs">Search events, artists, venues</span>
          </button>
        </div>

        {/* Browse Vibes and Filters - One Line */}
        <div className="mb-2 flex items-center gap-2 flex-wrap overflow-x-auto">
          {/* Browse Vibes Button - First */}
          <Button
            onClick={() => setVibeModalOpen(true)}
            className="bg-synth-pink hover:bg-synth-pink/90 text-white gap-2 flex-shrink-0"
            size="sm"
          >
            <Sparkles className="h-4 w-4" />
            Browse Vibes
          </Button>

          {/* Date Filter - Icon Only */}
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="p-2 flex-shrink-0">
                <CalendarIcon className="h-4 w-4 text-black" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-white" align="start">
              <Calendar
                mode="range"
                selected={{
                  from: filters.dateRange?.from,
                  to: filters.dateRange?.to,
                }}
                onSelect={(range) => {
                  setFilters({
                    ...filters,
                    dateRange: range,
                  });
                  if (range?.from && range?.to) {
                    setDatePickerOpen(false);
                  }
                }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          {/* Genre Filter - Icon Only */}
          <Popover open={genresOpen} onOpenChange={setGenresOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="p-2 relative flex-shrink-0">
                <Music className="h-4 w-4 text-black" />
                {filters.genres && filters.genres.length > 0 && (
                  <Badge variant="secondary" className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-xs flex items-center justify-center">
                    {filters.genres.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-white" align="start">
              <div className="space-y-2">
                <div className="font-semibold text-sm mb-2">Select Genres</div>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {COMMON_GENRES.map((genre) => (
                    <label
                      key={genre}
                      className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-accent"
                    >
                      <Checkbox
                        checked={filters.genres?.includes(genre) || false}
                        onCheckedChange={() => handleGenreToggle(genre)}
                      />
                      <span>{genre}</span>
                    </label>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Location Filter - Icon Only */}
          <Popover open={locationsOpen} onOpenChange={setLocationsOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="p-2 relative flex-shrink-0">
                <MapPin className="h-4 w-4 text-black" />
                {filters.cities && filters.cities.length > 0 && (
                  <Badge variant="secondary" className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-xs flex items-center justify-center">
                    {filters.cities.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-white" align="start">
              <div className="space-y-2">
                <div className="font-semibold text-sm mb-2">Select Cities</div>
                {isLoadingCities ? (
                  <div className="text-sm text-muted-foreground">Loading cities...</div>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {citiesData.map((cityData, index) => {
                      const cityKey = cityData.state
                        ? `${cityData.city}, ${cityData.state}`
                        : cityData.city;
                      const isChecked = tempSelectedCities.includes(cityKey);
                      return (
                        <label
                          key={`${cityKey}-${index}`}
                          className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-accent"
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => handleCityToggle(cityKey)}
                          />
                          <div className="flex-1">
                            <div className="font-medium">{cityData.city}</div>
                            {cityData.state && (
                              <div className="text-xs text-muted-foreground">{cityData.state}</div>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{cityData.eventCount}</div>
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2 pt-2 border-t">
                  <Button size="sm" onClick={handleCitiesApply} className="flex-1">
                    Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTempSelectedCities([]);
                      setFilters({ ...filters, cities: [] });
                    }}
                  >
                    Clear
                  </Button>
                </div>
            </div>
            </PopoverContent>
          </Popover>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="p-2 text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <X className="h-4 w-4 text-black" />
            </Button>
          )}
            </div>

        {/* Location Filter Indicator */}
        {filters.latitude && filters.longitude && (
          <div className="mb-2">
            <Badge variant="secondary" className="gap-1 bg-synth-pink/10 text-synth-pink border-synth-pink/30">
              <MapPin className="h-3 w-3" />
              Current Location ({filters.radiusMiles || 30} mi radius)
            </Badge>
          </div>
        )}

        {/* Active Filter Badges */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {filters.dateRange?.from && (
              <Badge variant="secondary" className="gap-1">
                Date: {format(filters.dateRange.from, 'MMM d')}
                {filters.dateRange.to && ` - ${format(filters.dateRange.to, 'MMM d')}`}
                <button
                  onClick={() => setFilters({ ...filters, dateRange: undefined })}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {filters.genres?.map((genre) => (
              <Badge key={genre} variant="secondary" className="gap-1">
                {genre}
                <button
                  onClick={() => handleGenreToggle(genre)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {filters.cities?.map((city) => (
              <Badge key={city} variant="secondary" className="gap-1">
                {city}
                <button
                  onClick={() => {
                    setFilters({
                      ...filters,
                      cities: filters.cities?.filter(c => c !== city),
                    });
                  }}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
        </div>
        )}

      {/* Main Content */}
      {isSearchActive ? (
          <div className="mb-2">
          <RedesignedSearchPage
            userId={currentUserId}
            allowedTabs={['all', 'users', 'artists', 'events', 'venues']}
            showMap={false}
            layout="compact"
            mode="embedded"
            headerTitle=""
            headerDescription=""
            showHelperText={false}
              initialSearchQuery=""
            hideSearchInput={true}
            onSearchStateChange={({ debouncedQuery: query }) => {
              // Search state is already managed by parent
            }}
            onNavigateToProfile={onNavigateToProfile}
            onNavigateToChat={onNavigateToChat}
          />
        </div>
      ) : (
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
          <ScenesSection
            currentUserId={currentUserId}
            onNavigateToProfile={onNavigateToProfile}
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

    </div>
  );
};
