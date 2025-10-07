import React, { useState } from 'react';
import { ArtistSearchResult } from '../../services/unifiedArtistSearchService';

interface ContentTypeSearchResultsProps {
  artists: ArtistSearchResult[];
  events: any[];
  users: any[];
  onArtistSelect: (artist: ArtistSearchResult) => void;
  onEventSelect: (event: any) => void;
  onUserSelect: (user: any) => void;
}

interface ContentGroupProps {
  title: string;
  icon: string;
  iconColor: string;
  results: any[];
  type: 'artists' | 'events' | 'users';
  onSelect: (item: any) => void;
}

const ContentGroup: React.FC<ContentGroupProps> = ({ 
  title, 
  icon, 
  iconColor, 
  results, 
  type,
  onSelect
}) => {
  const [showAll, setShowAll] = useState(false);
  const displayedResults = showAll ? results : results.slice(0, 3);

  console.log(`📊 ContentGroup [${type}]:`, {
    title,
    resultsCount: results.length,
    displayedCount: displayedResults.length,
    results: results.slice(0, 2) // Show first 2 results for debugging
  });

  if (results.length === 0) return null;

  const renderArtist = (artist: ArtistSearchResult, index: number) => (
    <div
      key={`artist-${artist.id}-${index}`}
      onClick={() => onSelect(artist)}
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
  );

  const renderEvent = (event: any, index: number) => {
    console.log(`🎵 Rendering event ${index}:`, event);
    return (
      <div
        key={`event-${event.jambase_event_id}-${index}`}
        onClick={() => onSelect(event)}
        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors group"
      >
        {/* Event Icon */}
        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
          <span className="text-blue-600 dark:text-blue-400 text-sm">🎵</span>
        </div>

        {/* Event Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
            {event.title}
          </h4>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>{event.artist_name}</span>
            <span>•</span>
            <span>{event.venue_name}</span>
            {event.event_date && (
              <>
                <span>•</span>
                <span>{new Date(event.event_date).toLocaleDateString()}</span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderUser = (user: any, index: number) => (
    <div
      key={`user-${user.user_id}-${index}`}
      onClick={() => onSelect(user)}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors group"
    >
      {/* User Avatar */}
      <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">
              {user.name?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
        )}
      </div>

      {/* User Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
          {user.name}
        </h4>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          {user.bio && (
            <span className="truncate">{user.bio}</span>
          )}
          {user.instagram_handle && (
            <>
              <span>•</span>
              <span>@{user.instagram_handle}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mb-6">
      {/* Group Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-full ${iconColor} flex items-center justify-center`}>
          <span className="text-white text-sm font-bold">{icon}</span>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </p>
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
        {displayedResults.map((item, index) => {
          console.log(`🎨 Rendering ${type} item ${index}:`, item);
          if (type === 'artists') return renderArtist(item, index);
          if (type === 'events') return renderEvent(item, index);
          if (type === 'users') return renderUser(item, index);
          return null;
        })}
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

export const ContentTypeSearchResults: React.FC<ContentTypeSearchResultsProps> = ({
  artists,
  events,
  users,
  onArtistSelect,
  onEventSelect,
  onUserSelect
}) => {
  const totalResults = artists.length + events.length + users.length;
  
  // Debug logging
  console.log('🔍 ContentTypeSearchResults received:', {
    artists: artists.length,
    events: events.length,
    users: users.length,
    total: totalResults
  });
  
  if (events.length > 0) {
    console.log('🎵 Events data:', events.map(e => ({ 
      id: e.id || e.jambase_event_id, 
      title: e.title, 
      artist: e.artist_name,
      venue: e.venue_name 
    })));
  }
  
  if (users.length > 0) {
    console.log('👤 Users data:', users.map(u => ({ name: u.name, id: u.user_id })));
  }

  if (totalResults === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 dark:text-gray-500 mb-2">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p className="text-gray-600 dark:text-gray-400">No results found</p>
        <p className="text-sm text-gray-500 dark:text-gray-500">Try a different search term</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Results Summary */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        Found {totalResults} result{totalResults !== 1 ? 's' : ''}
      </div>

      {/* Artists */}
      {artists.length > 0 ? (
        <ContentGroup
          title="Artists"
          icon="🎤"
          iconColor="bg-purple-500"
          results={artists}
          type="artists"
          onSelect={onArtistSelect}
        />
      ) : (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center">
              <span className="text-white text-sm font-bold">🎤</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Artists</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">No artist found</p>
            </div>
          </div>
        </div>
      )}

      {/* Events */}
      <ContentGroup
        title="Events"
        icon="🎵"
        iconColor="bg-blue-500"
        results={events}
        type="events"
        onSelect={onEventSelect}
      />

      {/* Users */}
      <ContentGroup
        title="Users"
        icon="👤"
        iconColor="bg-green-500"
        results={users}
        type="users"
        onSelect={onUserSelect}
      />
    </div>
  );
};
