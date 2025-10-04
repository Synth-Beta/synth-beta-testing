import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, Loader2 } from 'lucide-react';
import { UnifiedArtistSearchService, ArtistSearchResult } from '@/services/unifiedArtistSearchService';
import { supabase } from '@/integrations/supabase/client';

interface CompactSearchBarProps {
  onSearch: (query: string, type: 'artists' | 'events' | 'all') => void;
  onClear: () => void;
  isLoading?: boolean;
  userId: string;
}

interface SearchResult {
  id: string;
  name: string;
  type: 'artist' | 'user';
  image_url?: string;
  genres?: string[];
  location?: string;
}

export const CompactSearchBar: React.FC<CompactSearchBarProps> = ({
  onSearch,
  onClear,
  isLoading = false,
  userId
}) => {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search for suggestions
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      await loadSuggestions(query);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, userId]);

  const loadSuggestions = async (searchQuery: string) => {
    setIsLoadingSuggestions(true);
    try {
      // Search both artists and users
      const [artistResults, userResults] = await Promise.all([
        searchArtists(searchQuery, 3),
        searchUsers(searchQuery, 2)
      ]);

      const combinedSuggestions: SearchResult[] = [
        ...artistResults.map(artist => ({
          id: artist.id,
          name: artist.name,
          type: 'artist' as const,
          image_url: artist.image_url,
          genres: artist.genres,
        })),
        ...userResults.map(user => ({
          id: user.user_id,
          name: user.name,
          type: 'user' as const,
          location: user.bio || undefined,
        }))
      ];

      setSuggestions(combinedSuggestions);
      setShowSuggestions(combinedSuggestions.length > 0);
    } catch (error) {
      console.error('Error loading suggestions:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const searchArtists = async (searchQuery: string, limit: number): Promise<ArtistSearchResult[]> => {
    try {
      return await UnifiedArtistSearchService.searchArtists(searchQuery, limit);
    } catch (error) {
      console.error('Error searching artists:', error);
      return [];
    }
  };

  const searchUsers = async (searchQuery: string, limit: number) => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('name', `%${searchQuery}%`)
        .neq('user_id', userId)
        .limit(limit);

      if (error) throw error;
      return profiles || [];
    } catch (error) {
      console.error('Error searching users:', error);
      return [];
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    
    if (value.length === 0) {
      onClear();
    }
  };

  const handleSearch = (searchType: 'artists' | 'events' | 'all' = 'all') => {
    if (query.trim()) {
      onSearch(query.trim(), searchType);
      setShowSuggestions(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  const handleSuggestionClick = (suggestion: SearchResult) => {
    if (suggestion.type === 'user') {
      // Dispatch a global event so the app can navigate to the user's profile
      window.dispatchEvent(new CustomEvent('open-user-profile', { detail: { userId: suggestion.id }}));
      setShowSuggestions(false);
      return;
    }
    setQuery(suggestion.name);
    onSearch(suggestion.name, 'artists');
    setShowSuggestions(false);
  };

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    onClear();
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    // Delay hiding suggestions to allow for clicks
    setTimeout(() => setShowSuggestions(false), 150);
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 z-10">
          <Search className="h-5 w-5 hover-icon" />
        </div>
        
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search events, artists, or people..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyPress}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="pl-12 pr-20 h-12 text-base border-2 border-gray-200 hover:border-pink-300 focus:border-pink-400 rounded-xl transition-all duration-200"
          disabled={isLoading}
        />
        
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
          {isLoading && (
            <Loader2 className="h-5 w-5 animate-spin" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
          )}
          
          {query && !isLoading && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-8 w-8 p-0 hover-button"
            >
              <X className="h-4 w-4 hover-icon" />
            </Button>
          )}
          
          <Button
            size="sm"
            onClick={() => handleSearch()}
            disabled={!query.trim() || isLoading}
            className="h-9 px-4 hover-button gradient-button"
          >
            Search
          </Button>
        </div>
      </div>

      {/* Search Suggestions Dropdown */}
      {showSuggestions && (
        <div className="absolute top-full left-0 right-0 mt-1 glass-card inner-glow rounded-lg shadow-lg z-[100] max-h-64 overflow-y-auto floating-shadow">
          {isLoadingSuggestions ? (
            <div className="p-4 text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Searching...</p>
            </div>
          ) : (
            <div className="py-2">
              {suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.type}-${suggestion.id}`}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full px-4 py-3 text-left hover:bg-muted/50 flex items-center gap-3 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {suggestion.image_url ? (
                      <img
                        src={suggestion.image_url}
                        alt={suggestion.name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {suggestion.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{suggestion.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="capitalize">{suggestion.type}</span>
                      {suggestion.genres && suggestion.genres.length > 0 && (
                        <>
                          <span>•</span>
                          <span>{suggestion.genres.slice(0, 2).join(', ')}</span>
                        </>
                      )}
                      {suggestion.location && (
                        <>
                          <span>•</span>
                          <span className="truncate">{suggestion.location}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              
              {suggestions.length === 0 && query.length >= 2 && (
                <div className="px-4 py-3 text-center text-sm text-muted-foreground">
                  No suggestions found for "{query}"
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
