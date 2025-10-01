import React, { useMemo, useState } from 'react';
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
  Clock
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

export interface FilterState {
  genres: string[];
  selectedCities: string[];
  dateRange: {
    from?: Date;
    to?: Date;
  };
  showFilters: boolean;
}

interface EventFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableGenres: string[];
  availableCities?: string[];
  className?: string;
  onOverlayChange?: (open: boolean) => void;
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
}) => {
  const [tempSelectedCities, setTempSelectedCities] = useState<string[]>(filters.selectedCities || []);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [genresOpen, setGenresOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [customGenre, setCustomGenre] = useState('');

  const updateOverlayState = (next?: { genres?: boolean; locations?: boolean; date?: boolean }) => {
    const open = (next?.genres ?? genresOpen) || (next?.locations ?? locationsOpen) || (next?.date ?? showDatePicker);
    onOverlayChange && onOverlayChange(open);
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
    onFiltersChange({
      ...filters,
      selectedCities: tempSelectedCities
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
    onFiltersChange({
      ...filters,
      dateRange: range
    });
    setShowDatePicker(false);
  };

  const handleDateRangeClear = () => {
    onFiltersChange({
      ...filters,
      dateRange: { from: undefined, to: undefined }
    });
  };

  const handleClearAllFilters = () => {
    onFiltersChange({
      genres: [],
      selectedCities: [],
      dateRange: { from: undefined, to: undefined },
      showFilters: filters.showFilters
    });
    setTempSelectedCities([]);
  };

  const hasActiveFilters = filters.genres.length > 0 || (filters.selectedCities && filters.selectedCities.length > 0) || filters.dateRange.from || filters.dateRange.to;

  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    const list = availableCities || [];
    if (!q) return list;
    return list.filter(c => c.toLowerCase().includes(q));
  }, [availableCities, cityQuery]);

  const getDateRangeText = () => {
    if (filters.dateRange.from && filters.dateRange.to) {
      return `${format(filters.dateRange.from, 'MMM d')} - ${format(filters.dateRange.to, 'MMM d')}`;
    } else if (filters.dateRange.from) {
      return `From ${format(filters.dateRange.from, 'MMM d, yyyy')}`;
    } else if (filters.dateRange.to) {
      return `Until ${format(filters.dateRange.to, 'MMM d, yyyy')}`;
    }
    return 'Any date';
  };

  const getQuickDateOptions = () => [
    { label: 'Today', value: { from: new Date(), to: new Date() } },
    { label: 'This Week', value: { from: new Date(), to: addDays(new Date(), 7) } },
    { label: 'This Month', value: { from: new Date(), to: addDays(new Date(), 30) } },
    { label: 'Next 3 Months', value: { from: new Date(), to: addDays(new Date(), 90) } }
  ];

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Genres pill */}
        <Popover open={genresOpen} onOpenChange={(o) => { setGenresOpen(o); updateOverlayState({ genres: o }); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full">
              <Music className="h-4 w-4 mr-1" />
              Genres
              {filters.genres.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 rounded-full px-2">
                  {filters.genres.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 z-[60] bg-white border border-gray-200">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {availableGenres.map((genre) => (
                  <Badge
                    key={genre}
                    variant={filters.genres.includes(genre) ? 'default' : 'outline'}
                    className="cursor-pointer hover:bg-primary/80 hover:text-primary-foreground"
                    onClick={() => handleGenreToggle(genre)}
                  >
                    {genre}
                  </Badge>
                ))}
              </div>
              
              {/* Custom Genre Input */}
              <div className="border-t pt-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Other: _____"
                    value={customGenre}
                    onChange={(e) => setCustomGenre(e.target.value)}
                    onKeyPress={handleCustomGenreKeyPress}
                    className="flex-1 h-8 px-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <Button
                    size="sm"
                    onClick={handleCustomGenreAdd}
                    disabled={!customGenre.trim() || filters.genres.includes(customGenre.trim())}
                    className="h-8 px-3"
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
            <Button variant="outline" size="sm" className="rounded-full">
              <MapPin className="h-4 w-4 mr-1" />
              Locations
              {(filters.selectedCities?.length || 0) > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 rounded-full px-2">
                  {filters.selectedCities.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 z-[60] bg-white border border-gray-200">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search cities..."
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <Button size="sm" onClick={handleCitiesApply} disabled={tempSelectedCities.length === (filters.selectedCities?.length || 0) && tempSelectedCities.every(c => filters.selectedCities.includes(c))}>
                  Apply
                </Button>
                {(filters.selectedCities && filters.selectedCities.length > 0) && (
                  <Button size="sm" variant="outline" onClick={handleCitiesClear}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="max-h-48 overflow-auto pr-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {filteredCities.map((city) => {
                  const checked = tempSelectedCities.includes(city);
                  return (
                    <label key={city} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(val) => {
                          const isChecked = Boolean(val);
                          setTempSelectedCities(prev => isChecked ? Array.from(new Set([...prev, city])) : prev.filter(c => c !== city));
                        }}
                      />
                      <span className="truncate">{city}</span>
                    </label>
                  );
                })}
                {filteredCities.length === 0 && (
                  <div className="text-xs text-muted-foreground col-span-full">No cities match your search.</div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Date range pill */}
        <Popover open={showDatePicker} onOpenChange={(o) => { setShowDatePicker(o); updateOverlayState({ date: o }); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full">
              <CalendarIcon className="h-4 w-4 mr-1" />
              {filters.dateRange.from || filters.dateRange.to ? getDateRangeText() : 'Any date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3 z-[60] bg-white border border-gray-200" align="start">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {getQuickDateOptions().map((option) => (
                  <Button
                    key={option.label}
                    variant="outline"
                    size="sm"
                    onClick={() => handleDateRangeSelect(option.value)}
                    className="text-xs"
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    {option.label}
                  </Button>
                ))}
              </div>
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={filters.dateRange.from}
                selected={filters.dateRange.from && filters.dateRange.to ? { from: filters.dateRange.from, to: filters.dateRange.to } : undefined}
                onSelect={(range) => range && handleDateRangeSelect(range)}
                numberOfMonths={2}
              />
              {(filters.dateRange.from || filters.dateRange.to) && (
                <Button variant="outline" size="sm" onClick={handleDateRangeClear}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Clear all */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAllFilters}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Clear all
          </Button>
        )}
      </div>

      {/* Active Filters Summary as chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.genres.map((genre) => (
            <Badge key={genre} variant="secondary" className="flex items-center gap-1">
              <Music className="h-3 w-3" />
              {genre}
              <X 
                className="h-3 w-3 cursor-pointer hover:text-destructive" 
                onClick={() => handleGenreToggle(genre)}
              />
            </Badge>
          ))}
          {(filters.selectedCities || []).map((city) => (
            <Badge key={city} variant="secondary" className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {city}
              <X 
                className="h-3 w-3 cursor-pointer hover:text-destructive" 
                onClick={() => onFiltersChange({ ...filters, selectedCities: (filters.selectedCities || []).filter(c => c !== city) })}
              />
            </Badge>
          ))}
          {(filters.dateRange.from || filters.dateRange.to) && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              {getDateRangeText()}
              <X 
                className="h-3 w-3 cursor-pointer hover:text-destructive" 
                onClick={handleDateRangeClear}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};
