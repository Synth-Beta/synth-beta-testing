import React, { useState } from 'react';
import { ArtistSearch } from './ArtistSearch';
import { ArtistProfile } from './ArtistProfile';
import type { Artist } from '@/types/concertSearch';

interface ArtistSearchWithProfileProps {
  userId?: string;
  className?: string;
}

export function ArtistSearchWithProfile({ userId, className }: ArtistSearchWithProfileProps) {
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const handleArtistSelect = (artist: Artist) => {
    console.log('Artist selected:', artist);
    setSelectedArtist(artist);
    setShowProfile(true);
  };

  const handleBack = () => {
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
        onBack={handleBack}
        onInterestToggle={handleInterestToggle}
        onReview={handleReview}
        userId={userId}
        className={className}
      />
    );
  }

  return (
    <div className={className}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Search for an Artist</h2>
        <p className="text-muted-foreground mb-4">
          Search for an artist to view their profile and events
        </p>
      </div>
      
      <ArtistSearch
        onArtistSelect={handleArtistSelect}
        placeholder="Search for artists like Taylor Swift, The Beatles, Radiohead..."
        showResults={false}
        maxResults={10}
      />
    </div>
  );
}
