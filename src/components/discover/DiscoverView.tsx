import React, { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Filter, SlidersHorizontal } from 'lucide-react';
import { RedesignedSearchPage } from '@/components/search/RedesignedSearchPage';
import { RecommendedEventsSection } from './RecommendedEventsSection';
import { BrowseAllEventsSection } from './BrowseAllEventsSection';
import { PageActions } from '@/components/PageActions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DiscoverViewProps {
  currentUserId: string;
  onBack: () => void;
  onNavigateToNotifications?: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
  onViewChange?: (view: 'feed' | 'search' | 'profile') => void;
}

type SortOption = 'date' | 'popularity' | 'distance' | 'price';

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  currentUserId,
  onBack,
  onNavigateToNotifications,
  onNavigateToProfile,
  onNavigateToChat,
  onViewChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('date');
  const [isSearchActive, setIsSearchActive] = useState(false);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      const trimmed = searchQuery.trim();
      setDebouncedQuery(trimmed);
      setIsSearchActive(trimmed.length >= 2);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Sync search query to RedesignedSearchPage when it changes
  useEffect(() => {
    if (isSearchActive && debouncedQuery) {
      // The search will be handled by RedesignedSearchPage with initialSearchQuery prop
    }
  }, [debouncedQuery, isSearchActive]);

  const sortOptions: Array<{ value: SortOption; label: string }> = [
    { value: 'date', label: 'Date' },
    { value: 'popularity', label: 'Popularity' },
    { value: 'distance', label: 'Distance' },
    { value: 'price', label: 'Price' },
  ];

  const currentSortLabel = sortOptions.find(opt => opt.value === sortOption)?.label || 'Date';

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-4">
        {/* Search Bar with Sort Filter */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events, artists, venues, or people..."
              className="pl-9 h-10"
              autoComplete="off"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="default" className="h-10 gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">{currentSortLabel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {sortOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setSortOption(option.value)}
                  className={sortOption === option.value ? 'bg-accent' : ''}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex-shrink-0">
            <PageActions
              currentUserId={currentUserId}
              onNavigateToNotifications={onNavigateToNotifications}
              onNavigateToChat={onNavigateToChat}
            />
          </div>
        </div>

        {/* Search Results or Browse View */}
        {isSearchActive ? (
          <RedesignedSearchPage
            userId={currentUserId}
            allowedTabs={['all', 'users', 'artists', 'events', 'venues']}
            showMap={false}
            layout="compact"
            mode="embedded"
            headerTitle=""
            headerDescription=""
            showHelperText={false}
            initialSearchQuery={searchQuery}
            hideSearchInput={true}
            onSearchStateChange={({ debouncedQuery: query }) => {
              // Search state is already managed by parent
            }}
            onNavigateToProfile={onNavigateToProfile}
            onNavigateToChat={onNavigateToChat}
          />
        ) : (
          <div className="space-y-6">
            {/* Recommended Events Section */}
            <RecommendedEventsSection
              currentUserId={currentUserId}
              onNavigateToProfile={onNavigateToProfile}
              onNavigateToChat={onNavigateToChat}
            />

            {/* Browse All Events Section */}
            <BrowseAllEventsSection
              currentUserId={currentUserId}
              sortOption={sortOption}
              onNavigateToProfile={onNavigateToProfile}
              onNavigateToChat={onNavigateToChat}
            />
          </div>
        )}
      </div>
    </div>
  );
};
