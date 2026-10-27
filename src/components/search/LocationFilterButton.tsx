import React, { useEffect, useState } from 'react';
import { MapPin, LocateFixed, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { useBrowseLocation } from '@/contexts/BrowseLocationContext';
import { CityService, type CityData } from '@/services/cityService';
import { LocationService } from '@/services/locationService';
import './LocationFilterButton.css';

const MAX_RADIUS = 50;

/**
 * Small "📍 City · 50 mi" pill under the search bar. Sets the app-wide browse
 * location (city or current location) and radius that the home feed reads.
 * Same behavior the old Discover "Location" popover had.
 */
export const LocationFilterButton: React.FC = () => {
  const browse = useBrowseLocation();
  const [open, setOpen] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [suggestions, setSuggestions] = useState<CityData[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [radius, setRadius] = useState(browse.radiusMiles);

  useEffect(() => setRadius(browse.radiusMiles), [browse.radiusMiles]);

  // Debounced city typeahead
  useEffect(() => {
    const q = cityInput.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        setSuggestions(await CityService.searchCities(q, 8));
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [cityInput]);

  const close = () => {
    setOpen(false);
    setCityInput('');
    setSuggestions([]);
    setError('');
  };

  const applyCity = (city: CityData) => {
    if (city.center_latitude == null || city.center_longitude == null) return;
    const label = [city.name, city.state].filter(Boolean).join(', ');
    browse.setManualLocation(
      { latitude: Number(city.center_latitude), longitude: Number(city.center_longitude) },
      label,
      radius
    );
    close();
  };

  const searchTyped = async () => {
    const q = cityInput.trim();
    if (!q) return;
    const results = await CityService.searchCities(q, 5);
    if (results.length > 0) return applyCity(results[0]);
    const fallback = LocationService.searchCity(q);
    if (fallback) {
      browse.setManualLocation(
        { latitude: fallback.lat, longitude: fallback.lng },
        fallback.state ? `${fallback.name}, ${fallback.state}` : fallback.name,
        radius
      );
      close();
    } else {
      setError(`Couldn't find "${q}". Try another spelling or pick a suggestion.`);
    }
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    setError('');
    try {
      // Ask first so a blocked permission shows a message instead of silently failing.
      await LocationService.getCurrentLocation();
      browse.resetToCurrentLocation();
      close();
    } catch (e: any) {
      setError(
        e?.code === 1
          ? 'Location access is blocked for this site. Allow it in your browser settings, or search a city.'
          : "Couldn't get your location. Try again or search a city."
      );
    } finally {
      setLocating(false);
    }
  };

  const label = browse.loading ? 'Finding you…' : browse.label || 'Set location';

  return (
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <button type="button" className="location-pill" aria-label={`Location: ${label}, ${browse.radiusMiles} miles. Change`}>
          <MapPin size={14} strokeWidth={2.4} aria-hidden="true" />
          <span className="location-pill__label">{label}</span>
          <span className="location-pill__radius">· {browse.radiusMiles} mi</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="text-sm font-semibold">Show events near</div>

          <Button onClick={useCurrentLocation} disabled={locating} variant="outline" size="sm" className="w-full gap-2">
            {locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
            {locating ? 'Getting location…' : 'Use current location'}
          </Button>

          <div className="relative">
            <Input
              placeholder="Search a city"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void searchTyped()}
              aria-label="Search a city"
            />
            {searching && <div className="mt-1 text-xs" style={{ color: 'var(--neutral-500)' }}>Searching…</div>}
            {suggestions.length > 0 && cityInput.trim().length >= 2 && (
              <ul
                className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-auto rounded-md border bg-white shadow-lg"
                style={{ borderColor: 'var(--neutral-200)' }}
              >
                {suggestions.map((city) => (
                  <li key={city.id ?? `${city.name}-${city.state ?? ''}-${city.country ?? ''}`}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-100"
                      onClick={() => applyCity(city)}
                    >
                      {[city.name, city.state, city.country].filter(Boolean).join(', ')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="text-xs" style={{ color: 'var(--status-error-500, #dc2626)' }}>{error}</p>}

          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between text-sm">
              <span>Radius</span>
              <span className="font-semibold">{radius} mi</span>
            </div>
            <Slider
              value={[radius]}
              onValueChange={(v) => setRadius(v[0])}
              onValueCommit={(v) => browse.setRadiusMiles(v[0])}
              min={5}
              max={MAX_RADIUS}
              step={5}
              aria-label="Radius in miles"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
