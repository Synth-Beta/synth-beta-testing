import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Music, ExternalLink, Calendar, MapPin, X, Loader2 } from 'lucide-react';
import { SetlistService, type SetlistData } from '@/services/setlistService';
import { useToast } from '@/hooks/use-toast';

interface SetlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  artistName: string;
  venueName?: string;
  eventDate?: string;
  onSetlistSelect?: (setlist: SetlistData) => void;
}

export function SetlistModal({ isOpen, onClose, artistName, venueName, eventDate, onSetlistSelect }: SetlistModalProps) {
  const [setlists, setSetlists] = useState<SetlistData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSetlist, setSelectedSetlist] = useState<SetlistData | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && artistName) {
      fetchSetlists();
    }
  }, [isOpen, artistName, venueName, eventDate]);

  const fetchSetlists = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🎵 SetlistModal: fetchSetlists called with:', { artistName, venueName, eventDate, eventDateType: typeof eventDate });
      
      let allResults: SetlistData[] = [];
      
      // Try most specific search first (artist + venue + date)
      if (venueName && eventDate) {
        console.log('🎵 Searching by artist, venue, and date:', { artistName, venueName, eventDate });
        const results = await SetlistService.searchSetlistsByArtistAndVenue(artistName, venueName, eventDate);
        if (results && results.length > 0) {
          allResults = [...allResults, ...results];
        }
      }
      
      // Try artist + date search
      if (eventDate) {
        console.log('🎵 Searching by artist and date:', { artistName, eventDate });
        const results = await SetlistService.searchSetlistsByArtist(artistName, eventDate);
        if (results && results.length > 0) {
          allResults = [...allResults, ...results];
        }
      }
      
      // Try artist-only search for more results
      console.log('🎵 Searching by artist only:', { artistName });
      const results = await SetlistService.searchSetlistsByArtist(artistName);
      if (results && results.length > 0) {
        allResults = [...allResults, ...results];
      }
      
      // Remove duplicates and sort by relevance (exact date matches first)
      const uniqueResults = allResults.filter((setlist, index, self) => 
        index === self.findIndex(s => s.setlistFmId === setlist.setlistFmId)
      );
      
      // Sort by relevance: exact date matches first, then by date proximity
      const sortedResults = uniqueResults.sort((a, b) => {
        if (!eventDate) return 0;
        
        const eventDateObj = new Date(eventDate);
        const aDate = new Date(a.eventDate);
        const bDate = new Date(b.eventDate);
        
        // Exact date matches first
        const aExactMatch = aDate.toDateString() === eventDateObj.toDateString();
        const bExactMatch = bDate.toDateString() === eventDateObj.toDateString();
        
        if (aExactMatch && !bExactMatch) return -1;
        if (!aExactMatch && bExactMatch) return 1;
        
        // Then by date proximity
        const aDiff = Math.abs(aDate.getTime() - eventDateObj.getTime());
        const bDiff = Math.abs(bDate.getTime() - eventDateObj.getTime());
        
        return aDiff - bDiff;
      });
      
      console.log('🎵 Final sorted setlists:', sortedResults.length);
      setSetlists(sortedResults);
      
      // Auto-select exact date match if available
      if (eventDate && sortedResults.length > 0) {
        const exactMatch = sortedResults.find(setlist => {
          const setlistDate = new Date(setlist.eventDate);
          const targetDate = new Date(eventDate);
          return setlistDate.toDateString() === targetDate.toDateString();
        });
        
        if (exactMatch) {
          console.log('🎵 Auto-selecting exact date match:', exactMatch.eventDate);
          setSelectedSetlist(exactMatch);
        }
      }
      
      if (sortedResults.length === 0) {
        setError('No setlists found for this artist');
      }
    } catch (err) {
      console.error('Error fetching setlists:', err);
      setError('Failed to fetch setlists');
      toast({
        title: "Error",
        description: "Failed to fetch setlists. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const groupSongsBySet = (songs: SetlistData['songs']) => {
    const sets: { [key: number]: SetlistData['songs'] } = {};
    songs.forEach(song => {
      if (!sets[song.setNumber]) {
        sets[song.setNumber] = [];
      }
      sets[song.setNumber].push(song);
    });
    return sets;
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] max-h-[90vh] p-0 overflow-hidden flex flex-col" hideCloseButton>
        <DialogHeader className="px-6 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">
              Setlists for {artistName}
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mr-3" />
              <span>Searching for setlists...</span>
            </div>
          )}

          {error && !loading && (
            <div className="text-center py-12">
              <Music className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Setlists Found</h3>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={fetchSetlists} variant="outline">
                Try Again
              </Button>
            </div>
          )}

          {!loading && !error && setlists.length > 0 && (
            <div className="space-y-6">
              <div className="text-sm text-gray-600">
                Found {setlists.length} setlist{setlists.length !== 1 ? 's' : ''} for {artistName}
              </div>
              
              {setlists.map((setlist, index) => {
                const sets = groupSongsBySet(setlist.songs);
                const isSelected = selectedSetlist?.setlistFmId === setlist.setlistFmId;
                const isExactDateMatch = eventDate && new Date(setlist.eventDate).toDateString() === new Date(eventDate).toDateString();
                
                return (
                  <Card key={setlist.setlistFmId} className={`overflow-hidden transition-all duration-200 ${
                    isSelected ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:shadow-md'
                  }`}>
                    <CardHeader className={`bg-gradient-to-r from-purple-50 to-pink-50 ${
                      isSelected ? 'bg-gradient-to-r from-blue-50 to-indigo-50' : ''
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-lg">
                              {setlist.artist.name}
                            </CardTitle>
                            {isExactDateMatch && (
                              <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                                Exact Match
                              </Badge>
                            )}
                            {isSelected && (
                              <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">
                                Selected
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {formatDate(setlist.eventDate)}
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4" />
                              {setlist.venue.name}, {setlist.venue.city}
                              {setlist.venue.state && `, ${setlist.venue.state}`}
                            </div>
                            {setlist.tour && (
                              <div className="text-purple-600 font-medium">
                                {setlist.tour}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant="secondary" className="mb-2">
                            {setlist.songCount} songs
                          </Badge>
                          <div className="text-xs text-gray-500">
                            {Object.keys(sets).length} set{Object.keys(sets).length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="p-6">
                      {setlist.info && (
                        <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                          {setlist.info}
                        </div>
                      )}
                      
                      <div className="space-y-4">
                        {Object.entries(sets).map(([setNumber, songs]) => (
                          <div key={setNumber} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-medium">
                                {songs[0]?.setName || `Set ${setNumber}`}
                              </Badge>
                              <span className="text-sm text-gray-500">
                                {songs.length} song{songs.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            
                            <div className="space-y-1">
                              {songs.map((song, songIndex) => (
                                <div key={songIndex} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                                  <span className="text-sm font-medium text-gray-500 w-8 text-right">
                                    {song.position}.
                                  </span>
                                  <span className="text-sm flex-1">
                                    {song.name}
                                  </span>
                                  {song.cover && (
                                    <Badge variant="secondary" className="text-xs">
                                      {song.cover.artist}
                                    </Badge>
                                  )}
                                  {song.tape && (
                                    <Badge variant="outline" className="text-xs">
                                      Tape
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                            
                            {parseInt(setNumber) < Object.keys(sets).length && (
                              <Separator className="my-4" />
                            )}
                          </div>
                        ))}
                      </div>
                      
                      <div className="mt-6 pt-4 border-t">
                        <div className="flex gap-2">
                          <Button
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              setSelectedSetlist(setlist);
                              if (onSetlistSelect) {
                                onSetlistSelect(setlist);
                              }
                              // Show success toast and close modal
                              toast({
                                title: "Setlist Selected",
                                description: `Selected setlist from ${setlist.venue.name} on ${new Date(setlist.eventDate).toLocaleDateString()}`,
                              });
                              // Close modal after a brief delay to show the toast
                              setTimeout(() => {
                                onClose();
                              }, 1000);
                            }}
                            className="flex-1"
                          >
                            {isSelected ? (
                              <>
                                <Music className="h-4 w-4 mr-2" />
                                Selected
                              </>
                            ) : (
                              <>
                                <Music className="h-4 w-4 mr-2" />
                                Select This Setlist
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(setlist.url, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View on Setlist.fm
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
