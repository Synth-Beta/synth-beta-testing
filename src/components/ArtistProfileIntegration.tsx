import React, { useState } from 'react';
import { ArtistSelector } from './ArtistSelector';
import { ArtistProfile } from './ArtistProfile';
import type { Artist } from '@/types/concertSearch';

interface ArtistProfileIntegrationProps {
  userId?: string;
  className?: string;
}

/**
 * Example integration showing how to use ArtistProfile with ArtistSelector
 * This component demonstrates the complete flow from artist selection to profile viewing
 */
export function ArtistProfileIntegration({ userId, className }: ArtistProfileIntegrationProps) {
  const [selectedArtists, setSelectedArtists] = useState<Artist[]>([]);
  const [viewingArtist, setViewingArtist] = useState<Artist | null>(null);

  const handleArtistAdd = (artist: Artist) => {
    if (!selectedArtists.find(a => a.id === artist.id)) {
      setSelectedArtists(prev => [...prev, artist]);
    }
  };

  const handleArtistRemove = (artistId: string) => {
    setSelectedArtists(prev => prev.filter(a => a.id !== artistId));
  };

  const handleViewEvents = (artist: Artist) => {
    setViewingArtist(artist);
  };

  const handleBackToArtists = () => {
    setViewingArtist(null);
  };

  const handleInterestToggle = (eventId: string, interested: boolean) => {
    console.log(`User ${userId} ${interested ? 'interested in' : 'not interested in'} event ${eventId}`);
    // Here you would typically update your app state or make API calls
  };

  const handleReview = (eventId: string) => {
    console.log(`User ${userId} wants to review event ${eventId}`);
    // Here you would typically open a review modal or navigate to a review page
  };

  if (viewingArtist) {
    return (
      <ArtistProfile
        artist={viewingArtist}
        onBack={handleBackToArtists}
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
        <h2 className="text-2xl font-bold mb-4">Your Artists</h2>
        <p className="text-muted-foreground">
          Select artists to view their events and express interest in upcoming shows
        </p>
      </div>

      {selectedArtists.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-muted-foreground mb-4">No artists selected yet</p>
          <p className="text-sm text-muted-foreground">
            Use the artist search to find and add artists to your list
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {selectedArtists.map((artist) => (
            <ArtistSelector
              key={artist.id}
              artist={artist}
              onViewEvents={handleViewEvents}
              onRemove={() => handleArtistRemove(artist.id)}
              onToggleFavorite={(artistId) => {
                console.log(`Toggle favorite for artist ${artistId}`);
                // Implement favorite toggle logic here
              }}
              isFavorite={false} // Implement favorite state logic here
            />
          ))}
        </div>
      )}
    </div>
  );
}
