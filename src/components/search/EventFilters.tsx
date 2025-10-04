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
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center gap-3 bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
        {/* Genres pill */}
        <Popover open={genresOpen} onOpenChange={(o) => { setGenresOpen(o); updateOverlayState({ genres: o }); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full bg-white/80 backdrop-blur-sm border-synth-pink/20 hover:border-synth-pink/40">
              <Music className="h-4 w-4 mr-1" />
              Genres
              {filters.genres.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 rounded-full px-2 bg-synth-pink/20 text-synth-pink border-synth-pink/30">
                  {filters.genres.length}
                </Badge>
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
            <Button variant="outline" size="sm" className="rounded-full bg-white/80 backdrop-blur-sm border-synth-pink/20 hover:border-synth-pink/40">
              <MapPin className="h-4 w-4 mr-1" />
              Locations
              {(filters.selectedCities?.length || 0) > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 rounded-full px-2 bg-synth-pink/20 text-synth-pink border-synth-pink/30">
                  {filters.selectedCities.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 z-[60] bg-white/95 backdrop-blur-md border border-gray-200/50 rounded-2xl shadow-xl">
            <div className="space-y-4 p-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search cities..."
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  className="synth-input flex-1 h-9 text-sm"
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
              <div className="max-h-48 overflow-auto pr-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 synth-scrollbar">
                {filteredCities.map((city) => {
                  const checked = tempSelectedCities.includes(city);
                  return (
                    <label key={city} className="flex items-center gap-2 text-sm cursor-pointer select-none p-2 rounded-lg hover:bg-synth-pink/5 transition-colors">
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
                  <div className="text-xs text-muted-foreground col-span-full text-center py-4">No cities match your search.</div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Date range pill */}
        <Popover open={showDatePicker} onOpenChange={(o) => { setShowDatePicker(o); updateOverlayState({ date: o }); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full bg-white/80 backdrop-blur-sm border-synth-pink/20 hover:border-synth-pink/40">
              <CalendarIcon className="h-4 w-4 mr-1" />
              {filters.dateRange.from || filters.dateRange.to ? getDateRangeText() : 'Any date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4 z-[60] bg-white/95 backdrop-blur-md border border-gray-200/50 rounded-2xl shadow-xl" align="start">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {getQuickDateOptions().map((option) => (
                  <Button
                    key={option.label}
                    variant="outline"
                    size="sm"
                    onClick={() => handleDateRangeSelect(option.value)}
                    className="text-xs bg-white/80 backdrop-blur-sm border-synth-pink/20 hover:border-synth-pink/40"
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
                <Button variant="outline" size="sm" onClick={handleDateRangeClear} className="bg-white/80 backdrop-blur-sm border-synth-pink/20 hover:border-synth-pink/40">
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
            className="text-muted-foreground hover:text-foreground bg-white/60 backdrop-blur-sm border border-white/20 hover:bg-white/80"
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
          {(filters.selectedCities || []).map((city) => (
            <Badge key={city} variant="secondary" className="flex items-center gap-1 bg-synth-beige/30 text-synth-black border-synth-beige-dark hover:bg-synth-beige/50 transition-colors">
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
        </div>
      )}
    </div>
  );
};
