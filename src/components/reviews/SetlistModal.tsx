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

type SetlistErrorType = 'none' | 'offline' | 'not-found' | 'generic';

export function SetlistModal({ isOpen, onClose, artistName, venueName, eventDate, onSetlistSelect }: SetlistModalProps) {
  const [setlists, setSetlists] = useState<SetlistData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<SetlistErrorType>('none');
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
      setErrorType('none');
      console.log('🎵 SetlistModal: fetchSetlists called with:', { artistName, venueName, eventDate, eventDateType: typeof eventDate });
      
      let allResults: SetlistData[] = [];
      
      // Try most specific search first (artist + venue + date)
      if (venueName && eventDate) {
        try {
          console.log('🎵 Searching by artist, venue, and date:', { artistName, venueName, eventDate });
          const results = await SetlistService.searchSetlistsByArtistAndVenue(artistName, venueName, eventDate);
          if (results && results.length > 0) {
            console.log(`✅ Found ${results.length} results from venue+date search`);
            allResults = [...allResults, ...results];
          }
        } catch (error) {
          console.warn('⚠️ Venue+date search failed:', error);
        }
      }
      
      // If we found results, no need to do more searches
      if (allResults.length > 0) {
        console.log('✅ Using venue+date results, skipping additional searches to avoid rate limits');
        setSetlists(allResults);
        setLoading(false);
        return;
      }
      
      // Try artist + date search
      if (eventDate) {
        try {
          console.log('🎵 Searching by artist and date:', { artistName, eventDate });
          const results = await SetlistService.searchSetlistsByArtist(artistName, eventDate);
          if (results && results.length > 0) {
            console.log(`✅ Found ${results.length} results from artist+date search`);
            allResults = [...allResults, ...results];
          }
        } catch (error) {
          console.warn('⚠️ Artist+date search failed:', error);
        }
      }
      
      // If we found results, no need to do more searches
      if (allResults.length > 0) {
        console.log('✅ Using artist+date results, skipping additional searches to avoid rate limits');
        setSetlists(allResults);
        setLoading(false);
        return;
      }
      
      // Try artist-only search as last resort
      try {
        console.log('🎵 Searching by artist only:', { artistName });
        const results = await SetlistService.searchSetlistsByArtist(artistName);
        if (results && results.length > 0) {
          console.log(`✅ Found ${results.length} results from artist-only search`);
          allResults = [...allResults, ...results];
        }
      } catch (error) {
        console.warn('⚠️ Artist-only search failed:', error);
      }
      
      // Filter out results that don't match the artist name
      // For "Goose" we want only exact matches or close variations, not "Duck Fight Goose" or "Silly Goose"
      const filteredResults = allResults.filter(setlist => {
        const artistNameLower = artistName.toLowerCase().trim();
        const setlistArtistLower = (setlist.artist?.name || '').toLowerCase().trim();
        
        // Exact match
        if (setlistArtistLower === artistNameLower) {
          return true;
        }
        
        // Close match - artist name starts with search term and is within reasonable length
        // This catches "Goose" but not "Silly Goose" or "Duck Fight Goose"
        const wordsInSetlistName = setlistArtistLower.split(' ');
        const firstWord = wordsInSetlistName[0];
        
        // Allow if first word matches and the total name isn't significantly longer
        if (firstWord === artistNameLower && setlistArtistLower.length <= artistNameLower.length + 2) {
          return true;
        }
        
        // Disallow anything else
        return false;
      });
      
      console.log(`🎵 Filtered ${allResults.length} results to ${filteredResults.length} matching artist name`);
      console.log('🎵 Filtered results:', filteredResults.map(r => r.artist?.name));
      
      // Remove duplicates
      const uniqueResults = filteredResults.filter((setlist, index, self) => 
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
          const setlistDate = parseSetlistDate(setlist.eventDate);
          const targetDate = parseSetlistDate(eventDate) || new Date(eventDate);
          if (!setlistDate) return false;
          return setlistDate.toDateString() === targetDate.toDateString();
        });
        
        if (exactMatch) {
          console.log('🎵 Auto-selecting exact date match:', exactMatch.eventDate);
          setSelectedSetlist(exactMatch);
        }
      }
      
      if (sortedResults.length === 0) {
        setErrorType('not-found');
        setError('We couldn’t find official setlists for this artist. Feel free to add the songs manually below.');
      }
    } catch (err) {
      console.error('Error fetching setlists:', err);
      if (err instanceof Error && err.name === 'SetlistServiceOfflineError') {
        setErrorType('offline');
        setError('Setlist import is offline. Start the local proxy or add the setlist manually in the form.');
        toast({
          title: 'Setlist import unavailable',
          description: 'Run `npm run backend:dev` in another terminal or enter the songs manually.',
          variant: 'destructive'
        });
      } else {
        setErrorType('generic');
        setError('Failed to fetch setlists. Please try again.');
        toast({
          title: "Error",
          description: "Failed to fetch setlists. Please try again.",
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Helper function to parse dates from setlist.fm API (DD-MM-YYYY) or standard formats
  const parseSetlistDate = (dateString: string): Date | null => {
    if (!dateString) return null;
    
    try {
      // Handle DD-MM-YYYY format from setlist.fm API
      if (dateString.includes('-') && dateString.length === 10) {
        const parts = dateString.split('-');
        if (parts.length === 3) {
          // Check if it's DD-MM-YYYY format (first part is 2 digits, second is 2 digits, third is 4 digits)
          if (parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
            // DD-MM-YYYY format - parse as local date to preserve the date value
            const year = parseInt(parts[2], 10);
            const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
            const day = parseInt(parts[0], 10);
            return new Date(year, month, day);
          } else if (parts[0].length === 4) {
            // YYYY-MM-DD format
            return new Date(dateString);
          }
        }
      }
      
      // Try standard Date parsing
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch {
      // Fall through to return null
    }
    
    return null;
  };

  const formatDate = (dateString: string) => {
    const date = parseSetlistDate(dateString);
    
    if (!date || isNaN(date.getTime())) {
        console.warn('Invalid date string:', dateString);
        return 'Date TBD';
      }
    
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
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
              <h3 className="text-lg font-semibold mb-2">
                {errorType === 'offline'
                  ? 'Setlist Import Offline'
                  : errorType === 'not-found'
                    ? 'No Setlists Found'
                    : 'Something Went Wrong'}
              </h3>
              <p className="text-gray-600 mb-4 max-w-lg mx-auto whitespace-pre-wrap">
                {error}
              </p>

              {errorType === 'offline' && (
                <div className="bg-pink-50 border border-pink-100 rounded-lg p-4 text-left max-w-md mx-auto mb-6 text-sm text-pink-900">
                  <p className="font-medium mb-2">To import from setlist.fm locally:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open a new terminal window</li>
                    <li>Run <code className="px-1 py-0.5 bg-white rounded border border-pink-200 text-xs">npm run backend:dev</code></li>
                    <li>Keep it running while you use the import</li>
                  </ol>
                  <p className="mt-3">
                    Or close this modal and add the songs manually using the “Add your own setlist” section in the form.
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button onClick={fetchSetlists} variant="outline">
                  Try Again
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Close & add manually
                </Button>
              </div>
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
                const setlistDate = parseSetlistDate(setlist.eventDate);
                const targetDate = eventDate ? (parseSetlistDate(eventDate) || new Date(eventDate)) : null;
                const isExactDateMatch = eventDate && setlistDate && targetDate && setlistDate.toDateString() === targetDate.toDateString();
                
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
                                description: `Selected setlist from ${setlist.venue.name} on ${formatDate(setlist.eventDate)}`,
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
