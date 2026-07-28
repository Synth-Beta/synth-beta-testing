import React, { useState } from 'react';
import { SearchResultsPage } from './SearchResultsPage';
import { ArtistProfile } from './ArtistProfile';
import { UnifiedArtistSearchService, ArtistSearchResult } from '@/services/unifiedArtistSearchService';
import type { Artist } from '@/types/concertSearch';

interface SearchResultsWithProfileProps {
  searchQuery: string;
  searchType: 'artists' | 'people';
  onBack: () => void;
  userId: string;
}

export function SearchResultsWithProfile({ 
  searchQuery, 
  searchType, 
  onBack, 
  userId 
}: SearchResultsWithProfileProps) {
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const convertToArtist = (searchResult: ArtistSearchResult): Artist => {
    return {
      id: searchResult.id,
      jambase_artist_id: searchResult.identifier,
      name: searchResult.name,
      description: `Artist found with ${searchResult.num_upcoming_events || 0} upcoming events`,
      genres: searchResult.genres || [],
      image_url: searchResult.image_url,
      popularity_score: searchResult.num_upcoming_events || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source: searchResult.is_from_database ? 'database' : 'jambase'
    };
  };

  const handleArtistSelect = (searchResult: ArtistSearchResult) => {
    const artist = convertToArtist(searchResult);
    setSelectedArtist(artist);
    setShowProfile(true);
    console.log('🎯 Artist selected:', artist);
  };

  const handleBackToSearch = () => {
    setShowProfile(false);
    setSelectedArtist(null);
  };

  const handleInterestToggle = (eventId: string, interested: boolean) => {
    console.log(`User ${userId} ${interested ? 'interested in' : 'not interested in'} event ${eventId}`);
  };

  const handleReview = (eventId: string) => {
    console.log(`User ${userId} wants to review event ${eventId}`);
  };

  if (showProfile && selectedArtist) {
    return (
      <ArtistProfile
        artist={selectedArtist}
        onBack={handleBackToSearch}
        onInterestToggle={handleInterestToggle}
        onReview={handleReview}
        userId={userId}
      />
    );
  }

  return (
    <SearchResultsPage
      searchQuery={searchQuery}
      searchType={searchType}
      onBack={onBack}
      userId={userId}
      onArtistSelect={handleArtistSelect}
    />
  );
}
