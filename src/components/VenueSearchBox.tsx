import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Search, MapPin, X, Check, PlusCircle } from 'lucide-react';
import { UnifiedVenueSearchService } from '@/services/unifiedVenueSearchService';
import type { VenueSearchResult } from '@/services/unifiedVenueSearchService';
import { cn } from '@/lib/utils';
import { trackInteraction } from '@/services/interactionTrackingService';
import { ManualVenueForm } from '@/components/search/ManualVenueForm';

interface VenueSearchBoxProps {
  onVenueSelect: (venue: VenueSearchResult) => void;
  placeholder?: string;
  className?: string;
}

export function VenueSearchBox({ 
  onVenueSelect, 
  placeholder = "Search for a venue...",
  className 
}: VenueSearchBoxProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VenueSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showManualForm, setShowManualForm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsOpen(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      await performSearch(query);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || !searchResults) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < searchResults.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
            handleVenueSelect(searchResults[selectedIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSelectedIndex(-1);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, searchResults, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedItem = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const performSearch = async (searchQuery: string) => {
    try {
      setIsLoading(true);
      const results = await UnifiedVenueSearchService.searchVenues(searchQuery, 10);
      
      setSearchResults(results);
      setIsOpen(true);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Venue search error:', error);
      setSearchResults([]);
      setIsOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVenueSelect = (venue: VenueSearchResult) => {
    console.log('🎯 VenueSearchBox: Venue selected:', venue);
    try { trackInteraction.click('venue', (venue as any).id || (venue as any).identifier || venue.name, { source: 'venue_search_box', name: venue.name, city: venue.address?.addressLocality, state: venue.address?.addressRegion }); } catch {}
    onVenueSelect(venue);
    setQuery(venue.name);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  };

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const container = inputRef.current?.parentElement?.parentElement; // The main container div
      
      if (container && !container.contains(target)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleInputFocus = () => {
    if (searchResults && searchResults.length > 0) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // Check if focus is moving to the dropdown
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget && listRef.current?.contains(relatedTarget)) {
      return; // Don't close if focus is moving to dropdown
    }
    
    // Delay closing to allow for click events
    setTimeout(() => {
      setIsOpen(false);
      setSelectedIndex(-1);
    }, 100);
  };

  const clearSearch = () => {
    setQuery('');
    setSearchResults([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const formatAddress = (venue: VenueSearchResult) => {
    const parts = [];
    if (venue.address?.addressLocality) parts.push(venue.address.addressLocality);
    if (venue.address?.addressRegion) parts.push(venue.address.addressRegion);
    return parts.join(', ');
  };

  const formatCapacity = (capacity?: number) => {
    if (!capacity) return '';
    if (capacity >= 1000) {
      return `${(capacity / 1000).toFixed(1)}k capacity`;
    }
    return `${capacity} capacity`;
  };

  const handleManualVenueCreated = (venue: VenueSearchResult) => {
    onVenueSelect(venue);
    setQuery(venue.name);
    setIsOpen(false);
  };

  return (
    <>
      <ManualVenueForm
        open={showManualForm}
        onClose={() => setShowManualForm(false)}
        onVenueCreated={handleManualVenueCreated}
        initialQuery={query}
      />
    <div className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          id="venue-search-input"
          name="venueSearch"
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          className="pl-10 pr-20"
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
          {isLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          )}
          {query && !isLoading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              className="h-6 w-6 p-0 hover:bg-gray-100"
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Search Results Dropdown */}
      {isOpen && searchResults && (
        <Card className="relative top-0 left-0 right-0 z-[100] mt-2 max-h-48 overflow-y-auto shadow-lg border bg-white">
          <CardContent className="p-0">
            {searchResults.length > 0 ? (
              <div ref={listRef} className="py-2">
                {searchResults.map((venue, index) => (
                  <div
                    key={venue.id}
                    className={cn(
                      "px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors",
                      "flex items-start gap-3",
                      selectedIndex === index && "bg-blue-50 border-l-4 border-blue-500"
                    )}
                    onClick={() => handleVenueSelect(venue)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="flex-shrink-0 mt-1">
                      {venue.image_url ? (
                        <img
                          src={venue.image_url}
                          alt={venue.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                          <MapPin className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-gray-900 truncate">
                          {venue.name}
                        </h3>
                        {venue.num_upcoming_events && venue.num_upcoming_events > 0 && (
                          <div className="flex items-center gap-1">
                            <Check className="w-3 h-3 text-green-400" />
                            <span className="text-xs text-gray-500">
                              {venue.num_upcoming_events} events
                            </span>
                          </div>
                        )}
                        {venue.is_from_database && (
                          <Badge 
                            variant="outline" 
                            className="text-xs text-green-600 border-green-300"
                          >
                            Database
                          </Badge>
                        )}
                      </div>
                      
                      {formatAddress(venue) && (
                        <p className="text-sm text-gray-600 mb-1">
                          {formatAddress(venue)}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {formatCapacity(venue.maximumAttendeeCapacity) && (
                          <span>{formatCapacity(venue.maximumAttendeeCapacity)}</span>
                        )}
                        {venue.geo && (
                          <span>
                            {venue.geo.latitude?.toFixed(2)}, {venue.geo.longitude?.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-gray-500">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p>No venues found for "{query}"</p>
                <p className="text-sm text-gray-400 mb-3">Try a different search term</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsOpen(false);
                    setShowManualForm(true);
                  }}
                  className="gap-2"
                >
                  <PlusCircle className="w-4 h-4" />
                  Add "{query}" Manually
                </Button>
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="border-t px-4 py-3 bg-gray-50">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsOpen(false);
                    setShowManualForm(true);
                  }}
                  className="w-full gap-2 text-blue-600 hover:text-blue-700"
                >
                  <PlusCircle className="w-4 h-4" />
                  Can't find "{query}"? Add manually
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
    </>
  );
}
