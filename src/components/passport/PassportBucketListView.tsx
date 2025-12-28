import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Music, Building2, X, Plus } from 'lucide-react';
import { BucketListService, type BucketListItem } from '@/services/bucketListService';
import { ArtistSearchBox } from '@/components/ArtistSearchBox';
import { VenueSearchBox } from '@/components/VenueSearchBox';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { Artist } from '@/types/concertSearch';
import type { VenueSearchResult } from '@/services/unifiedVenueSearchService';

interface PassportBucketListViewProps {
  userId: string;
}


export const PassportBucketListView: React.FC<PassportBucketListViewProps> = ({ userId }) => {
  const [bucketList, setBucketList] = useState<BucketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddArtist, setShowAddArtist] = useState(false);
  const [showAddVenue, setShowAddVenue] = useState(false);
  const [adding, setAdding] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    loadBucketList();
  }, [userId]);

  const loadBucketList = async () => {
    setLoading(true);
    try {
      const items = await BucketListService.getBucketList(userId);
      setBucketList(items);
    } catch (error) {
      console.error('Error loading bucket list:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleArtistSelect = async (artist: Artist) => {
    setAdding(true);
    try {
      const success = await BucketListService.addArtist(userId, artist.id, artist.name);
      if (success) {
        setShowAddArtist(false);
        await loadBucketList();
      }
    } catch (error) {
      console.error('Error adding artist:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleVenueSelect = async (venue: VenueSearchResult) => {
    setAdding(true);
    try {
      const success = await BucketListService.addVenue(userId, venue.id, venue.name);
      if (success) {
        setShowAddVenue(false);
        await loadBucketList();
      }
    } catch (error) {
      console.error('Error adding venue:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (itemId: string) => {
    try {
      const success = await BucketListService.removeItem(userId, itemId);
      if (success) {
        await loadBucketList();
      }
    } catch (error) {
      console.error('Error removing item:', error);
    }
  };

  const handleItemClick = (item: BucketListItem) => {
    if (item.entity_type === 'artist') {
      // Dispatch event to open artist card
      window.dispatchEvent(new CustomEvent('open-artist-card', {
        detail: {
          artistId: item.entity_id,
          artistName: item.entity_name,
        },
      }));
    } else if (item.entity_type === 'venue') {
      // Dispatch event to open venue card
      window.dispatchEvent(new CustomEvent('open-venue-card', {
        detail: {
          venueId: item.entity_id,
          venueName: item.entity_name,
        },
      }));
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-visible">
      {/* Add Items Section */}
      <Card className={isSearching ? "mb-4" : ""} style={{ overflow: 'visible' }}>
        <CardContent className="p-4" style={{ overflow: 'visible' }}>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddArtist(!showAddArtist);
                setShowAddVenue(false);
                setIsSearching(false);
              }}
              className="flex-1"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Artist
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddVenue(!showAddVenue);
                setShowAddArtist(false);
                setIsSearching(false);
              }}
              className="flex-1"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Venue
            </Button>
          </div>

          {showAddArtist && (
            <div className="mt-4 relative" style={{ zIndex: 1000 }}>
              <ArtistSearchBox
                onArtistSelect={handleArtistSelect}
                placeholder="Search for an artist to add..."
                onSearchStateChange={setIsSearching}
              />
              {adding && (
                <div className="flex items-center justify-center mt-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mr-2" />
                  <span className="text-sm text-muted-foreground">Adding...</span>
                </div>
              )}
            </div>
          )}

          {showAddVenue && (
            <div className="mt-4 relative" style={{ zIndex: 1000 }}>
              <VenueSearchBox
                onVenueSelect={handleVenueSelect}
                placeholder="Search for a venue to add..."
                onSearchStateChange={setIsSearching}
              />
              {adding && (
                <div className="flex items-center justify-center mt-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mr-2" />
                  <span className="text-sm text-muted-foreground">Adding...</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bucket List Items - Hide when searching to prioritize search results */}
      {!isSearching && (
        <>
          {bucketList.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground mb-2">Your bucket list is empty</p>
                <p className="text-sm text-muted-foreground">
                  Add artists or venues to get notified when new shows are announced!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="max-h-[600px] overflow-y-auto pr-2 space-y-3">
              {bucketList.map((item) => (
            <Card
              key={item.id}
              className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-synth-pink/50"
              onClick={() => handleItemClick(item)}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    {(item.entity_type === 'artist' && item.artist?.image_url) ||
                     (item.entity_type === 'venue' && item.venue?.image_url) ? (
                      <AvatarImage
                        src={
                          item.entity_type === 'artist'
                            ? item.artist?.image_url
                            : item.venue?.image_url
                        }
                        alt={item.entity_name}
                      />
                    ) : (
                      <AvatarFallback className="text-xs">
                        {item.entity_type === 'artist' ? (
                          <Music className="w-5 h-5" />
                        ) : (
                          <Building2 className="w-5 h-5" />
                        )}
                      </AvatarFallback>
                    )}
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-semibold text-sm truncate">{item.entity_name}</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0 hover:bg-red-100 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(item.id);
                        }}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant="secondary"
                        className={`text-xs ${
                          item.entity_type === 'artist'
                            ? 'bg-pink-100 text-pink-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {item.entity_type === 'artist' ? (
                          <>
                            <Music className="w-2.5 h-2.5 mr-1" />
                            Artist
                          </>
                        ) : (
                          <>
                            <Building2 className="w-2.5 h-2.5 mr-1" />
                            Venue
                          </>
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Added {new Date(item.added_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

