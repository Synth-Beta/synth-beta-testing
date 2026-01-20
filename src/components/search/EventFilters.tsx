import React, { useMemo, useState, useEffect } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Filter, 
  X, 
  MapPin, 
  Calendar as CalendarIcon, 
  Music,
  ChevronDown,
  Clock,
  Loader2,
  Users
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { normalizeCityName, getCanonicalCityName, deduplicateCities, formatCityNameForDisplay, formatCityStateForDisplay } from '@/utils/cityNormalization';

export interface FilterState {
  genres: string[];
  selectedCities: string[];
  dateRange: {
    from?: Date;
    to?: Date;
  };
  showFilters: boolean;
  radiusMiles: number;
  latitude?: number;
  longitude?: number;
  filterByFollowing: 'all' | 'following';
  daysOfWeek: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
}

interface CityData {
  city: string;
  state: string;
  eventCount: number;
}

interface EventFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableGenres: string[];
  availableCities?: string[];
  className?: string;
  onOverlayChange?: (open: boolean) => void;
  onClearVenueSelection?: () => void;
}

const COMMON_GENRES = [
  'Rock', 'Pop', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'Country', 
  'R&B', 'Reggae', 'Folk', 'Blues', 'Alternative', 'Indie', 'Punk',
  'Metal', 'Funk', 'Soul', 'Gospel', 'Latin', 'World'
];

export const EventFilters: React.FC<EventFiltersProps> = ({
  filters,
  onFiltersChange,
  availableGenres = COMMON_GENRES,
  availableCities = [],
  className = '',
  onOverlayChange,
  onClearVenueSelection,
}) => {
  const [tempSelectedCities, setTempSelectedCities] = useState<string[]>(filters.selectedCities || []);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [genresOpen, setGenresOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [customGenre, setCustomGenre] = useState('');
  const [citiesData, setCitiesData] = useState<CityData[]>([]);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [daysOfWeekOpen, setDaysOfWeekOpen] = useState(false);

  // Ensure selectedCities are always deduplicated
  useEffect(() => {
    if (filters.selectedCities && filters.selectedCities.length > 0) {
      const deduplicated = deduplicateCities(filters.selectedCities);
      if (deduplicated.length !== filters.selectedCities.length || 
          !deduplicated.every((city, i) => city === filters.selectedCities[i])) {
        // Cities need to be deduplicated, update filters
        onFiltersChange({
          ...filters,
          selectedCities: deduplicated
        });
      }
    }
  }, [filters.selectedCities]);

  // Load cities data
  useEffect(() => {
    if (locationsOpen) {
      loadCities();
    }
  }, [locationsOpen]);


  const loadCities = async () => {
    setIsLoadingCities(true);
    try {
      // Use the database function to get available cities (already normalized)
      const { data: citiesData, error } = await supabase.rpc('get_available_cities_for_filter', {
        min_event_count: 1,
        limit_count: 500
      });

      if (error) {
        console.warn('Error loading cities from database function, falling back to direct query:', error);
        // Fallback to direct query using display_city
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('display_city, venue_state')
          .not('display_city', 'is', null)
          .gte('event_date', new Date().toISOString());

        if (eventsError) throw eventsError;

        // Group by display_city and state
        const cityMap = new Map<string, { state: string; count: number }>();
        
        (eventsData || []).forEach((event: any) => {
          const city = event.display_city?.trim();
          const state = event.venue_state?.trim() || '';
          const key = `${city}|${state}`;
          
          if (city) {
            if (!cityMap.has(key)) {
              cityMap.set(key, { state, count: 0 });
            }
            cityMap.get(key)!.count++;
          }
        });

        const finalCities: CityData[] = Array.from(cityMap.entries())
          .map(([key, data]) => {
            const city = key.split('|')[0];
            return {
              city: formatCityNameForDisplay(city), // Format city name consistently
              state: data.state,
              eventCount: data.count
            };
          })
          .sort((a, b) => b.eventCount - a.eventCount);

        setCitiesData(finalCities);
      } else {
        // Use data from database function
        const rawCities: CityData[] = (citiesData || []).map((row: any) => ({
          city: row.city_name,
          state: row.state || '',
          eventCount: Number(row.event_count)
        }));
        
        // Deduplicate cities by normalizing city name and state
        // Normalize state: "DC", "D.C.", "District of Columbia" all become "DC"
        const normalizeState = (state: string): string => {
          if (!state) return '';
          const s = state.trim().toUpperCase();
          if (s === 'DC' || s === 'D.C.' || s === 'DISTRICT OF COLUMBIA') return 'DC';
          return state.trim();
        };
        
        // Normalize city name: lowercase, trim, and handle common variations
        const normalizeCityName = (name: string): string => {
          let normalized = name.trim().toLowerCase();
          // Remove common suffixes that cause duplicates: "Dc" -> "", "DC" -> ""
          normalized = normalized.replace(/\s+dc$/, '');
          normalized = normalized.replace(/\s+d\.c\.$/, '');
          // Remove extra spaces
          normalized = normalized.replace(/\s+/g, ' ');
          return normalized;
        };
        
        const cityMap = new Map<string, CityData>();
        
        rawCities.forEach(cityData => {
          const normalizedCity = normalizeCityName(cityData.city);
          const normalizedState = normalizeState(cityData.state);
          // Use normalized city + state as deduplication key
          // For cities with same name and state (e.g., "Washington" + "DC" and "Washington Dc" + "DC"), keep one
          const key = `${normalizedCity}|${normalizedState}`;
          
          // Keep the entry with the highest event count if duplicate
          // Also prefer entries that have state info over those without
          if (!cityMap.has(key)) {
            cityMap.set(key, cityData);
          } else {
            const existing = cityMap.get(key)!;
            // Prefer entry with higher event count, or if equal, prefer one with state
            if (cityData.eventCount > existing.eventCount || 
                (cityData.eventCount === existing.eventCount && cityData.state && !existing.state)) {
              cityMap.set(key, cityData);
            }
          }
        });
        
        // Format all cities for consistent display
        const finalCities = Array.from(cityMap.values())
          .map(cityData => ({
            ...cityData,
            city: formatCityNameForDisplay(cityData.city) // Expand abbreviations and normalize
          }))
          .sort((a, b) => b.eventCount - a.eventCount);
        
        setCitiesData(finalCities);
      }

    } catch (error) {
      console.error('Error loading cities:', error);
      setCitiesData([]);
    } finally {
      setIsLoadingCities(false);
    }
  };

  const updateOverlayState = (next?: { genres?: boolean; locations?: boolean; date?: boolean; daysOfWeek?: boolean }) => {
    const open = (next?.genres ?? genresOpen) || (next?.locations ?? locationsOpen) || (next?.date ?? showDatePicker) || (next?.daysOfWeek ?? daysOfWeekOpen);
    if (onOverlayChange) {
      onOverlayChange(open);
    }
  };

  const handleGenreToggle = (genre: string) => {
    const newGenres = filters.genres.includes(genre)
      ? filters.genres.filter(g => g !== genre)
      : [...filters.genres, genre];
    
    onFiltersChange({
      ...filters,
      genres: newGenres
    });
  };

  const handleCustomGenreAdd = () => {
    if (customGenre.trim() && !filters.genres.includes(customGenre.trim())) {
      const newGenres = [...filters.genres, customGenre.trim()];
      onFiltersChange({
        ...filters,
        genres: newGenres
      });
      setCustomGenre('');
    }
  };

  const handleCustomGenreKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCustomGenreAdd();
    }
  };

  const handleCitiesApply = () => {
    // Deduplicate cities to remove variations like "Washington" and "Washington DC"
    const deduplicatedCities = deduplicateCities(tempSelectedCities);
    onFiltersChange({
      ...filters,
      selectedCities: deduplicatedCities
    });
  };

  const handleCitiesClear = () => {
    setTempSelectedCities([]);
    onFiltersChange({
      ...filters,
      selectedCities: []
    });
  };

  const handleDateRangeSelect = (range: { from?: Date; to?: Date }) => {
    // Normalize dates to ensure proper comparison and filtering
    const normalizedRange: { from?: Date; to?: Date } = {
      from: range.from
        ? (() => {
            const d = new Date(range.from!);
            d.setHours(0, 0, 0, 0);
            return d;
          })()
        : undefined,
      to: range.to
        ? (() => {
            const d = new Date(range.to!);
            d.setHours(23, 59, 59, 999);
            return d;
          })()
        : undefined,
    };

    if (normalizedRange.from && !normalizedRange.to) {
      const endOfDay = new Date(normalizedRange.from);
      endOfDay.setHours(23, 59, 59, 999);
      normalizedRange.to = endOfDay;
    } else if (!normalizedRange.from && normalizedRange.to) {
      const startOfDay = new Date(normalizedRange.to);
      startOfDay.setHours(0, 0, 0, 0);
      normalizedRange.from = startOfDay;
    }

    onFiltersChange({
      ...filters,
      dateRange: normalizedRange,
    });

    // Only close the picker when both dates are selected (complete range)
    if (normalizedRange.from && normalizedRange.to) {
      setShowDatePicker(false);
    }
  };

  const handleDateRangeClear = () => {
    onFiltersChange({
      ...filters,
      dateRange: { from: undefined, to: undefined }
    });
  };

  const handleTimeRangeSelect = (range: { from: Date; to: Date }) => {
    // Ensure dates are properly normalized when using quick date options
    const normalizedRange = {
      from: (() => {
        const d = new Date(range.from);
        d.setHours(0, 0, 0, 0);
        return d;
      })(),
      to: (() => {
        const d = new Date(range.to);
        d.setHours(23, 59, 59, 999);
        return d;
      })()
    };
    
    onFiltersChange({
      ...filters,
      dateRange: normalizedRange
    });
    setShowDatePicker(false);
  };

  const getActiveTimeRange = () => {
    if (!filters.dateRange.from || !filters.dateRange.to) return null;
    
    const options = getQuickDateOptions();
    const filterFrom = filters.dateRange.from;
    const filterTo = filters.dateRange.to;
    
    // Compare dates by normalizing to start of day (ignore time components)
    const normalizeDate = (date: Date) => {
      const normalized = new Date(date);
      normalized.setHours(0, 0, 0, 0);
      return normalized.getTime();
    };
    
    // Normalize both filter dates and option dates to start of day for comparison
    const filterFromTime = normalizeDate(filterFrom);
    const filterToTime = normalizeDate(filterTo);
    
    return options.find(opt => {
      const optFromTime = normalizeDate(opt.value.from);
      const optToTime = normalizeDate(opt.value.to);
      // Compare normalized dates (ignoring time of day)
      return optFromTime === filterFromTime && optToTime === filterToTime;
    });
  };

  const handleDayToggle = (day: number) => {
    const newDays = filters.daysOfWeek.includes(day)
      ? filters.daysOfWeek.filter(d => d !== day)
      : [...filters.daysOfWeek, day];
    
    onFiltersChange({
      ...filters,
      daysOfWeek: newDays
    });
  };

  const handleWeekdaysSelect = () => {
    // Weekdays: Sunday through Thursday (0, 1, 2, 3, 4)
    const weekdays = [0, 1, 2, 3, 4];
    const allWeekdaysSelected = weekdays.every(day => filters.daysOfWeek.includes(day));
    
    if (allWeekdaysSelected) {
      // Deselect all weekdays
      onFiltersChange({
        ...filters,
        daysOfWeek: filters.daysOfWeek.filter(d => !weekdays.includes(d))
      });
    } else {
      // Select all weekdays
      const newDays = [...new Set([...filters.daysOfWeek, ...weekdays])];
      onFiltersChange({
        ...filters,
        daysOfWeek: newDays
      });
    }
  };

  const handleWeekendSelect = () => {
    // Weekend: Friday (5) and Saturday (6)
    const weekend = [5, 6];
    const allWeekendSelected = weekend.every(day => filters.daysOfWeek.includes(day));
    
    if (allWeekendSelected) {
      // Deselect all weekend days
      onFiltersChange({
        ...filters,
        daysOfWeek: filters.daysOfWeek.filter(d => !weekend.includes(d))
      });
    } else {
      // Select all weekend days
      const newDays = [...new Set([...filters.daysOfWeek, ...weekend])];
      onFiltersChange({
        ...filters,
        daysOfWeek: newDays
      });
    }
  };

  const handleClearAllFilters = () => {
    onFiltersChange({
      genres: [],
      selectedCities: [],
      dateRange: { from: undefined, to: undefined },
      showFilters: filters.showFilters,
      radiusMiles: filters.radiusMiles,
      filterByFollowing: 'all',
      daysOfWeek: []
    });
    setTempSelectedCities([]);
    // Clear venue selection if callback is provided
    if (onClearVenueSelection) {
      onClearVenueSelection();
    }
  };

  const hasActiveFilters = filters.genres.length > 0 || (filters.selectedCities && filters.selectedCities.length > 0) || filters.dateRange.from || filters.dateRange.to || filters.filterByFollowing === 'following' || filters.daysOfWeek.length > 0;

  // Get major cities (top 10 by event count)
  const majorCities = useMemo(() => {
    return citiesData.slice(0, 10);
  }, [citiesData]);

  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    const list = citiesData.length > 0 ? citiesData : (availableCities || []).map(city => ({ city, state: '', eventCount: 0 }));
    
    if (!q) return list;
    
    return list.filter(cityData => {
      const city = typeof cityData === 'string' ? cityData : cityData.city;
      const state = typeof cityData === 'string' ? '' : cityData.state;
      
      // Normalize both the search query and city names for better matching
      const normalizedCity = normalizeCityName(city);
      const normalizedState = state.toLowerCase().trim();
      const normalizedQuery = normalizeCityName(q);
      
      return normalizedCity.includes(normalizedQuery) || 
             normalizedState.includes(normalizedQuery) ||
             city.toLowerCase().includes(q) || 
             state.toLowerCase().includes(q);
    });
  }, [citiesData, availableCities, cityQuery]);

  const getDateRangeText = () => {
    if (filters.dateRange.from && filters.dateRange.to) {
      // Check if it's a single day (same date)
      const fromStr = filters.dateRange.from.toDateString();
      const toStr = filters.dateRange.to.toDateString();
      
      if (fromStr === toStr) {
        // Single day selection - show just the date without "From"
        return format(filters.dateRange.from, 'MMM d, yyyy');
      } else {
        // Date range - show range
        return `${format(filters.dateRange.from, 'MMM d')} - ${format(filters.dateRange.to, 'MMM d')}`;
      }
    } else if (filters.dateRange.from) {
      // Only "from" date set - treat as single day
      return format(filters.dateRange.from, 'MMM d, yyyy');
    } else if (filters.dateRange.to) {
      return `Until ${format(filters.dateRange.to, 'MMM d, yyyy')}`;
    }
    return 'Calendar';
  };

  const getQuickDateOptions = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    // Today: from today to end of today
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);
    
    // This Week: from today to 7 days from today (end of day)
    const weekEnd = addDays(today, 7);
    weekEnd.setHours(23, 59, 59, 999);
    
    // This Month: from today to 30 days from today (end of day)
    const monthEnd = addDays(today, 30);
    monthEnd.setHours(23, 59, 59, 999);
    
    // Next 3 Months: from today to 90 days from today (end of day)
    const threeMonthsEnd = addDays(today, 90);
    threeMonthsEnd.setHours(23, 59, 59, 999);
    
    return [
      { label: 'Today', value: { from: new Date(today), to: endOfToday } },
      { label: 'This Week', value: { from: new Date(today), to: weekEnd } },
      { label: 'This Month', value: { from: new Date(today), to: monthEnd } },
      { label: 'Next 3 Months', value: { from: new Date(today), to: threeMonthsEnd } }
    ];
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/20 overflow-x-auto">
        {/* Genres pill */}
        <Popover open={genresOpen} onOpenChange={(o) => { setGenresOpen(o); updateOverlayState({ genres: o }); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full bg-white/80 backdrop-blur-sm border-synth-pink/20 hover:border-synth-pink/40 flex-shrink-0">
              <Music className="h-4 w-4 mr-1" />
              Genres
              {filters.genres.length > 0 && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: '25px',
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
                    marginLeft: 'var(--spacing-inline, 6px)'
                  }}
                >
                  {filters.genres.length}
                </div>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 z-[60] bg-white/95 backdrop-blur-md border border-gray-200/50 rounded-2xl shadow-xl">
            <div className="space-y-4 p-2">
              <div className="flex flex-wrap gap-2">
                {availableGenres.map((genre) => (
                  <Badge
                    key={genre}
                    variant={filters.genres.includes(genre) ? 'default' : 'outline'}
                    className={`cursor-pointer transition-all duration-200 ${
                      filters.genres.includes(genre) 
                        ? 'bg-synth-pink text-white hover:bg-synth-pink-dark' 
                        : 'hover:bg-synth-pink/10 hover:text-synth-pink hover:border-synth-pink/30'
                    }`}
                    onClick={() => handleGenreToggle(genre)}
                  >
                    {genre}
                  </Badge>
                ))}
              </div>
              
              {/* Custom Genre Input */}
              <div className="border-t border-gray-200/50 pt-4">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Other: _____"
                    value={customGenre}
                    onChange={(e) => setCustomGenre(e.target.value)}
                    onKeyPress={handleCustomGenreKeyPress}
                    className="synth-input flex-1 h-9 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleCustomGenreAdd}
                    disabled={!customGenre.trim() || filters.genres.includes(customGenre.trim())}
                    className="h-9 px-4"
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Locations pill */}
        <Popover open={locationsOpen} onOpenChange={(o) => { setLocationsOpen(o); updateOverlayState({ locations: o }); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full bg-white/80 backdrop-blur-sm border-synth-pink/20 hover:border-synth-pink/40 flex-shrink-0">
              <MapPin className="h-4 w-4 mr-1" />
              Locations
              {(filters.selectedCities?.length || 0) > 0 && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: '25px',
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
                    marginLeft: 'var(--spacing-inline, 6px)'
                  }}
                >
                  {filters.selectedCities.length}
                </div>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 z-[60] bg-white/95 backdrop-blur-md border border-gray-200/50 rounded-2xl shadow-xl">
            <div className="space-y-4 p-2">
              {/* Search Input */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SearchBar
                    value={cityQuery}
                    onChange={(value) => setCityQuery(value)}
                    placeholder="Search cities..."
                    widthVariant="full"
                    className="h-9"
                  />
                </div>
                <Button size="sm" onClick={handleCitiesApply} disabled={tempSelectedCities.length === (filters.selectedCities?.length || 0) && tempSelectedCities.every(c => filters.selectedCities.includes(c))}>
                  Apply
                </Button>
                {(filters.selectedCities && filters.selectedCities.length > 0) && (
                  <Button size="sm" variant="outline" onClick={handleCitiesClear}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Radius Selector - only show when cities are selected or being selected */}
              {(tempSelectedCities.length > 0 || (filters.selectedCities && filters.selectedCities.length > 0)) && (
                <div className="border-t border-gray-200/50 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">
                      Search Radius
                    </label>
                    <span className="text-sm text-gray-600">
                      {filters.radiusMiles} miles
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={filters.radiusMiles || 25}
                    onChange={(e) => {
                      onFiltersChange({
                        ...filters,
                        radiusMiles: parseInt(e.target.value, 10)
                      });
                    }}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-synth-pink"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>5 mi</span>
                    <span>25 mi</span>
                    <span>50 mi</span>
                    <span>100 mi</span>
                  </div>
                </div>
              )}

              {/* Cities List */}
              <div className="max-h-48 overflow-auto pr-1 space-y-1 synth-scrollbar">
                {isLoadingCities ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-sm text-gray-600">Loading cities...</span>
                  </div>
                ) : (
                  filteredCities.map((cityData, index) => {
                    // Extract and normalize city and state
                    let rawCity = typeof cityData === 'string' ? cityData : cityData.city;
                    let rawState = typeof cityData === 'string' ? '' : cityData.state;
                    
                    // If city name already includes state (e.g., "Boston, MA"), parse it out
                    const cityStateMatch = rawCity.match(/^(.+?),\s*([A-Z]{2})$/);
                    if (cityStateMatch) {
                      rawCity = cityStateMatch[1].trim();
                      rawState = cityStateMatch[2].trim() || rawState;
                    }
                    
                    // Format for consistent display: always use full city name (expand abbreviations)
                    const displayCity = formatCityNameForDisplay(rawCity);
                    // Clean and format state code (uppercase, remove periods)
                    const displayState = rawState ? rawState.trim().toUpperCase().replace(/\./g, '') : '';
                    
                    // For storage and comparison, use formatted city name (without state in name)
                    const cityKey = displayCity;
                    const checked = tempSelectedCities.some(c => {
                      // Parse stored city if it has state in it
                      const storedCityOnly = c.includes(',') ? c.split(',')[0].trim() : c;
                      const normalizedStored = normalizeCityName(storedCityOnly);
                      const normalizedDisplay = normalizeCityName(displayCity);
                      return normalizedStored === normalizedDisplay;
                    });
                    
                    // Create unique key using formatted city + state
                    const uniqueKey = displayState ? `${displayCity}-${displayState}-${index}` : `${displayCity}-${index}`;
                    
                    return (
                      <label key={uniqueKey} className="flex items-center gap-2 text-sm cursor-pointer select-none p-2 rounded-lg hover:bg-synth-pink/5 transition-colors">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(val) => {
                            const isChecked = Boolean(val);
                            if (isChecked) {
                              // Add formatted city name (full name, not abbreviated) and deduplicate
                              setTempSelectedCities(prev => {
                                const updated = [...prev, cityKey];
                                return deduplicateCities(updated);
                              });
                            } else {
                              // Remove city and any variations of it
                              const normalizedToRemove = normalizeCityName(displayCity);
                              setTempSelectedCities(prev => prev.filter(c => {
                                const storedCityOnly = c.includes(',') ? c.split(',')[0].trim() : c;
                                return normalizeCityName(storedCityOnly) !== normalizedToRemove;
                              }));
                            }
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{displayCity}</div>
                          {displayState && (
                            <div className="text-xs text-gray-500 truncate">{displayState}</div>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
                {!isLoadingCities && filteredCities.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4">
                    {cityQuery ? `No cities found for "${cityQuery}"` : 'No cities available'}
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Days of Week button */}
        <Popover open={daysOfWeekOpen} onOpenChange={(o) => { setDaysOfWeekOpen(o); updateOverlayState({ daysOfWeek: o }); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full bg-white/80 backdrop-blur-sm border-synth-pink/20 hover:border-synth-pink/40 flex-shrink-0">
              <CalendarIcon className="h-4 w-4 mr-1" />
              Days
              {filters.daysOfWeek.length > 0 && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: '25px',
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
                    marginLeft: 'var(--spacing-inline, 6px)'
                  }}
                >
                  {filters.daysOfWeek.length}
                </div>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 z-[60] bg-white/95 backdrop-blur-md border border-gray-200/50 rounded-2xl shadow-xl">
            <div className="space-y-4 p-2">
              {/* Quick Select Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleWeekdaysSelect}
                  className={cn(
                    "flex-1 text-xs",
                    [0, 1, 2, 3, 4].every(d => filters.daysOfWeek.includes(d))
                      ? "bg-synth-pink text-white hover:bg-synth-pink-dark"
                      : "bg-white/80 border-synth-pink/20 hover:border-synth-pink/40"
                  )}
                >
                  Weekdays
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleWeekendSelect}
                  className={cn(
                    "flex-1 text-xs",
                    [5, 6].every(d => filters.daysOfWeek.includes(d))
                      ? "bg-synth-pink text-white hover:bg-synth-pink-dark"
                      : "bg-white/80 border-synth-pink/20 hover:border-synth-pink/40"
                  )}
                >
                  Weekend
                </Button>
              </div>

              {/* Individual Day Buttons */}
              <div className="grid grid-cols-7 gap-2">
                {[
                  { label: 'Su', value: 0 },
                  { label: 'M', value: 1 },
                  { label: 'T', value: 2 },
                  { label: 'W', value: 3 },
                  { label: 'Th', value: 4 },
                  { label: 'F', value: 5 },
                  { label: 'Sa', value: 6 }
                ].map((day) => (
                  <Button
                    key={day.value}
                    variant="outline"
                    size="sm"
                    onClick={() => handleDayToggle(day.value)}
                    className={cn(
                      "h-10 p-0 text-xs font-medium",
                      filters.daysOfWeek.includes(day.value)
                        ? "bg-synth-pink text-white hover:bg-synth-pink-dark border-synth-pink"
                        : "bg-white/80 border-gray-300 hover:border-synth-pink/40 hover:bg-synth-pink/10"
                    )}
                  >
                    {day.label}
                  </Button>
                ))}
              </div>

              {/* Clear Button */}
              {filters.daysOfWeek.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => onFiltersChange({ ...filters, daysOfWeek: [] })}
                  className="w-full bg-white/80 backdrop-blur-sm border-synth-pink/20 hover:border-synth-pink/40"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear Days
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Calendar button with time range options */}
        <Popover open={showDatePicker} onOpenChange={(o) => { setShowDatePicker(o); updateOverlayState({ date: o }); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full bg-white/80 backdrop-blur-sm border-synth-pink/20 hover:border-synth-pink/40 flex-shrink-0 max-w-[180px]">
              <CalendarIcon className="h-4 w-4 mr-1 flex-shrink-0" />
              <span className="truncate">
                {getActiveTimeRange()
                  ? getActiveTimeRange()?.label
                  : (filters.dateRange.from || filters.dateRange.to ? getDateRangeText() : 'Calendar')}
              </span>
              {(filters.dateRange.from || filters.dateRange.to) && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: '25px',
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
                    marginLeft: 'var(--spacing-inline, 6px)',
                    flexShrink: 0
                  }}
                >
                  {getActiveTimeRange() ? 'Range' : 'Custom'}
                </div>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4 z-[60] bg-white/95 backdrop-blur-md border border-gray-200/50 rounded-2xl shadow-xl" align="start">
            <div className="flex flex-col gap-4">
              {/* Quick Time Range Options */}
              <div className="flex flex-wrap gap-2">
                {getQuickDateOptions().map((option) => {
                  const isActive = getActiveTimeRange()?.label === option.label;
                  return (
                    <Button
                      key={option.label}
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleTimeRangeSelect(option.value)}
                      className={`text-xs ${isActive ? 'bg-synth-pink text-white hover:bg-synth-pink-dark' : 'bg-white/80 backdrop-blur-sm border-synth-pink/20 hover:border-synth-pink/40'}`}
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      {option.label}
                    </Button>
                  );
                })}
              </div>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">Or select custom dates</span>
                </div>
              </div>

              {/* Calendar for custom date selection */}
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={filters.dateRange.from || new Date()}
                selected={
                  filters.dateRange.from 
                    ? { 
                        from: filters.dateRange.from, 
                        to: filters.dateRange.to || filters.dateRange.from 
                      } 
                    : undefined
                }
                onSelect={(range) => {
                  // Handle both partial and complete selections
                  if (range) {
                    // If selecting the same date twice (clicking same date), treat as single day
                    if (range.from && range.to && range.from.getTime() === range.to.getTime()) {
                      const sameDay = new Date(range.from);
                      sameDay.setHours(0, 0, 0, 0);
                      const endOfDay = new Date(range.from);
                      endOfDay.setHours(23, 59, 59, 999);
                      handleDateRangeSelect({ from: sameDay, to: endOfDay });
                    } else {
                      handleDateRangeSelect(range);
                    }
                  } else if (range === null) {
                    // User clicked outside to clear - only clear if explicitly clicking clear button
                    // Don't auto-clear on outside click to avoid accidental clears
                  }
                }}
                numberOfMonths={2}
                disabled={(date) => {
                  // Disable all dates before today
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const dateToCheck = new Date(date);
                  dateToCheck.setHours(0, 0, 0, 0);
                  return dateToCheck < today;
                }}
              />
              {(filters.dateRange.from || filters.dateRange.to) && (
                <Button variant="outline" size="sm" onClick={handleDateRangeClear} className="bg-white/80 backdrop-blur-sm border-synth-pink/20 hover:border-synth-pink/40">
                  <X className="h-4 w-4 mr-1" />
                  Clear Date
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Following Filter */}
        <Button 
          variant={filters.filterByFollowing === 'following' ? "default" : "outline"} 
          size="sm" 
          onClick={() => onFiltersChange({
            ...filters,
            filterByFollowing: filters.filterByFollowing === 'following' ? 'all' : 'following'
          })}
          className={`rounded-full backdrop-blur-sm border-synth-pink/20 hover:border-synth-pink/40 flex-shrink-0 ${
            filters.filterByFollowing === 'following' 
              ? 'bg-synth-pink text-white' 
              : 'bg-white/80'
          }`}
        >
          <Users className="h-4 w-4 mr-1" />
          Following
        </Button>

        {/* Clear all */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAllFilters}
            className="text-muted-foreground hover:text-foreground bg-white/60 backdrop-blur-sm border border-white/20 hover:bg-white/80 flex-shrink-0"
          >
            <X className="h-4 w-4 mr-1" />
            Clear all
          </Button>
        )}
      </div>

      {/* Active Filters Summary as chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 bg-white/40 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
          {filters.genres.map((genre) => (
            <Badge key={genre} variant="secondary" className="flex items-center gap-1 bg-synth-pink/20 text-synth-pink border-synth-pink/30 hover:bg-synth-pink/30 transition-colors">
              <Music className="h-3 w-3" />
              {genre}
              <X 
                className="h-3 w-3 cursor-pointer hover:text-destructive" 
                onClick={() => handleGenreToggle(genre)}
              />
            </Badge>
          ))}
          {deduplicateCities(filters.selectedCities || []).map((city, index) => (
            <Badge key={`selected-city-${city}-${index}`} variant="secondary" className="flex items-center gap-1 bg-synth-beige/30 text-synth-black border-synth-beige-dark hover:bg-synth-beige/50 transition-colors">
              <MapPin className="h-3 w-3" />
              {city}
              <X 
                className="h-3 w-3 cursor-pointer hover:text-destructive" 
                onClick={() => onFiltersChange({ ...filters, selectedCities: (filters.selectedCities || []).filter(c => c !== city) })}
              />
            </Badge>
          ))}
          {(filters.dateRange.from || filters.dateRange.to) && (
            <Badge variant="secondary" className="flex items-center gap-1 bg-synth-pink/20 text-synth-pink border-synth-pink/30 hover:bg-synth-pink/30 transition-colors">
              <CalendarIcon className="h-3 w-3" />
              {getDateRangeText()}
              <X 
                className="h-3 w-3 cursor-pointer hover:text-destructive" 
                onClick={handleDateRangeClear}
              />
            </Badge>
          )}
          {filters.daysOfWeek.length > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1 bg-synth-beige/30 text-synth-black border-synth-beige-dark hover:bg-synth-beige/50 transition-colors">
              <CalendarIcon className="h-3 w-3" />
              {filters.daysOfWeek.length === 7 ? 'All Days' : 
               filters.daysOfWeek.sort().map(d => ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'][d]).join(', ')}
              <X 
                className="h-3 w-3 cursor-pointer hover:text-destructive" 
                onClick={() => onFiltersChange({ ...filters, daysOfWeek: [] })}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};
