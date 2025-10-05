import React, { useState } from 'react';
import { ArtistSearchResult } from '../../services/unifiedArtistSearchService';

interface GroupedSearchResultsProps {
  exactMatches: ArtistSearchResult[];
  closeMatches: ArtistSearchResult[];
  relatedMatches: ArtistSearchResult[];
  onArtistSelect: (artist: ArtistSearchResult) => void;
}

interface SearchGroupProps {
  title: string;
  subtitle: string;
  results: ArtistSearchResult[];
  onArtistSelect: (artist: ArtistSearchResult) => void;
  icon: string;
  iconColor: string;
}

const SearchGroup: React.FC<SearchGroupProps> = ({ 
  title, 
  subtitle, 
  results, 
  onArtistSelect, 
  icon, 
  iconColor 
}) => {
  const [showAll, setShowAll] = useState(false);
  const displayedResults = showAll ? results : results.slice(0, 3);

  if (results.length === 0) return null;

  return (
    <div className="mb-6">
      {/* Group Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-full ${iconColor} flex items-center justify-center`}>
          <span className="text-white text-sm font-bold">{icon}</span>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
        </div>
        {results.length > 3 && (
          <div className="ml-auto">
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
            >
              {showAll ? 'Show Less' : `Show All ${results.length}`}
            </button>
          </div>
        )}
      </div>

      {/* Results List */}
      <div className="space-y-2">
        {displayedResults.map((artist, index) => (
          <div
            key={`${artist.id}-${index}`}
            onClick={() => onArtistSelect(artist)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors group"
          >
            {/* Artist Image */}
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
              {artist.image_url ? (
                <img
                  src={artist.image_url}
                  alt={artist.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                    {artist.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Artist Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {artist.name}
                </h4>
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full">
                  {artist.band_or_musician === 'musician' ? 'Artist' : 'Band'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                {artist.genres && artist.genres.length > 0 && (
                  <span>{artist.genres.slice(0, 2).join(', ')}</span>
                )}
                {artist.num_upcoming_events && artist.num_upcoming_events > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 bg-green-500 rounded-full"></span>
                    {artist.num_upcoming_events} upcoming
                  </span>
                )}
              </div>
            </div>

          </div>
        ))}
      </div>

      {/* Show More/Less Button for Mobile */}
      {results.length > 3 && (
        <div className="mt-3 text-center md:hidden">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
          >
            {showAll ? 'Show Less' : `Show All ${results.length} ${title.toLowerCase()}`}
          </button>
        </div>
      )}
    </div>
  );
};

export const GroupedSearchResults: React.FC<GroupedSearchResultsProps> = ({
  exactMatches,
  closeMatches,
  relatedMatches,
  onArtistSelect
}) => {
  const totalResults = exactMatches.length + closeMatches.length + relatedMatches.length;

  if (totalResults === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 dark:text-gray-500 mb-2">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p className="text-gray-600 dark:text-gray-400">No matching artists found</p>
        <p className="text-sm text-gray-500 dark:text-gray-500">Try a different search term</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Results Summary */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        Found {totalResults} artist{totalResults !== 1 ? 's' : ''}
      </div>

      {/* Top Matches */}
      <SearchGroup
        title="Top Matches"
        subtitle="Most relevant results"
        results={exactMatches}
        onArtistSelect={onArtistSelect}
        icon="⭐"
        iconColor="bg-yellow-500"
      />

      {/* Similar Artists */}
      <SearchGroup
        title="Similar Artists"
        subtitle="Artists like your search"
        results={closeMatches}
        onArtistSelect={onArtistSelect}
        icon="🎵"
        iconColor="bg-blue-500"
      />

      {/* More Artists */}
      <SearchGroup
        title="More Artists"
        subtitle="You might also like"
        results={relatedMatches}
        onArtistSelect={onArtistSelect}
        icon="🎤"
        iconColor="bg-purple-500"
      />
    </div>
  );
};
