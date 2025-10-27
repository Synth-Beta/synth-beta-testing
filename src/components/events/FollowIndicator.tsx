import React from 'react';
import { Badge } from '@/components/ui/badge';

interface FollowIndicatorProps {
  /** Artist names that the user follows */
  followedArtists: string[];
  /** Venues that the user follows */
  followedVenues: Array<{
    name: string;
    city?: string;
    state?: string;
  }>;
  /** Artist name of the event */
  artistName?: string;
  /** Venue name of the event */
  venueName?: string;
  /** Venue city of the event */
  venueCity?: string;
  /** Venue state of the event */
  venueState?: string;
}

/**
 * Follow Indicator Chip
 * Displays specific badges on event cards when the user follows the artist or venue
 * Shows separate indicators if both are followed
 */
export function FollowIndicator({
  followedArtists,
  followedVenues,
  artistName,
  venueName,
  venueCity,
  venueState
}: FollowIndicatorProps) {
  // Check if artist is followed
  const isArtistFollowed = artistName && followedArtists.includes(artistName);
  
  // Check if venue is followed
  const isVenueFollowed = venueName && followedVenues.some(v => 
    v.name === venueName && 
    (!v.city || v.city === venueCity) &&
    (!v.state || v.state === venueState)
  );
  
  if (!isArtistFollowed && !isVenueFollowed) {
    return null;
  }
  
  // If both are followed, show both indicators stacked vertically
  if (isArtistFollowed && isVenueFollowed) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Badge className="bg-[#FF3399] text-white text-xs px-2 py-0.5 flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          <span>Following Artist</span>
        </Badge>
        <Badge className="bg-blue-600 text-white text-xs px-2 py-0.5 flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          <span>Following Venue</span>
        </Badge>
      </div>
    );
  }
  
  // Show appropriate single indicator
  if (isArtistFollowed) {
    return (
      <Badge className="bg-[#FF3399] text-white text-xs px-2 py-1 flex items-center gap-1">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
        <span>Following Artist</span>
      </Badge>
    );
  }
  
  if (isVenueFollowed) {
    return (
      <Badge className="bg-blue-600 text-white text-xs px-2 py-1 flex items-center gap-1">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
        <span>Following Venue</span>
      </Badge>
    );
  }
  
  return null;
}
