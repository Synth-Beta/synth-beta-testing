import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Search, MapPin, X } from 'lucide-react';
import { UnifiedVenueSearchService } from '@/services/unifiedVenueSearchService';
import type { VenueSearchResult } from '@/services/unifiedVenueSearchService';
import { cn } from '@/lib/utils';
import { trackInteraction } from '@/services/interactionTrackingService';

interface VenueSearchBoxProps {
  onVenueSelect: (venue: VenueSearchResult) => void;
  placeholder?: string;
  className?: string;
  hideClearButton?: boolean;
  onSearchStateChange?: (isSearching: boolean) => void;
}

export function VenueSearchBox({ 
  onVenueSelect, 
  placeholder = "Search for a venue...",
  className,
  hideClearButton = false,
  onSearchStateChange
}: VenueSearchBoxProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VenueSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsOpen(false);
      onSearchStateChange?.(false);
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
      onSearchStateChange?.(true);
    } catch (error) {
      console.error('Venue search error:', error);
      setSearchResults([]);
      setIsOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVenueSelect = (venue: VenueSearchResult) => {
    try { trackInteraction.click('venue', (venue as any).id || (venue as any).identifier || venue.name, { source: 'venue_search_box', name: venue.name, city: venue.address?.addressLocality, state: venue.address?.addressRegion }); } catch {}
    onVenueSelect(venue);
    setQuery(venue.name);
    setIsOpen(false);
    setSelectedIndex(-1);
    onSearchStateChange?.(false);
    // Blur the search input
    const input = document.getElementById('venue-search-input') as HTMLInputElement;
    input?.blur();
  };

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const container = containerRef.current; // The main container div
      
      
      if (container && !container.contains(target)) {
        setIsOpen(false);
        setSelectedIndex(-1);
        onSearchStateChange?.(false);
      }
    };

    if (isOpen) {
      // Use a small delay to avoid conflicts with click events
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
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
      onSearchStateChange?.(false);
    }, 100);
  };

  const clearSearch = () => {
    setQuery('');
    setSearchResults([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    onSearchStateChange?.(false);
    // Focus the search input after clearing
    const input = document.getElementById('venue-search-input') as HTMLInputElement;
    input?.focus();
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

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <SearchBar
          value={query}
          onChange={(value) => setQuery(value)}
          placeholder={placeholder}
          widthVariant="full"
          id="venue-search-input"
          name="venueSearch"
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
          {isLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          )}
          {query && !isLoading && !hideClearButton && (
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
        <div className="absolute top-full left-0 right-0 z-[9999] mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
          {searchResults.length > 0 ? (
            <div 
              ref={listRef} 
              className="max-h-[min(500px,calc(100vh-300px))] overflow-y-auto overscroll-contain synth-scrollbar"
              style={{
                scrollBehavior: 'smooth',
              }}
            >
              {searchResults.map((venue, index) => (
                <div
                  key={venue.id}
                  className={cn(
                    "relative px-4 py-3 cursor-pointer transition-all duration-150",
                    "flex items-center gap-3",
                    "hover:bg-gray-50",
                    selectedIndex === index && "bg-blue-50"
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleVenueSelect(venue);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input blur
                    e.stopPropagation();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {/* Blue accent bar for selected item */}
                  {selectedIndex === index && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r" />
                  )}
                  
                  {/* Venue Image */}
                  <div className="flex-shrink-0">
                    {venue.image_url ? (
                      <img
                        src={venue.image_url}
                        alt={venue.name}
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-gray-100"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center ring-2 ring-gray-100">
                        <MapPin className="w-6 h-6 text-blue-500" />
                      </div>
                    )}
                  </div>
                  
                  {/* Venue Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                      {venue.name}
                    </h3>
                    {formatAddress(venue) && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {formatAddress(venue)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-gray-500">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <MapPin className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No venues found</h3>
              <p className="text-sm text-gray-600">Try a different search term</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
