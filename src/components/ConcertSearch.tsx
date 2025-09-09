import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Calendar, MapPin, Music, Filter, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Concert {
  id: string;
  artist: string;
  date: string;
  venue: string;
  profile_pic?: string;
  tour?: string;
  setlist?: string[];
  venue_location?: string;
  source: string;
  confidence: string;
  created_at: string;
}

interface ConcertSearchProps {
  currentUserId: string;
  onBack: () => void;
  onSelectConcert?: (concert: Concert) => void;
}

export const ConcertSearch = ({ currentUserId, onBack, onSelectConcert }: ConcertSearchProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentConcerts, setRecentConcerts] = useState<Concert[]>([]);
  const { toast } = useToast();

  // Mock data
  const mockConcerts: Concert[] = [
    {
      id: '1',
      artist: 'Taylor Swift',
      date: '2024-06-15',
      venue: 'Madison Square Garden',
      profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face',
      tour: 'The Eras Tour',
      setlist: ['Anti-Hero', 'Love Story', 'Shake It Off', 'All Too Well'],
      venue_location: 'New York, NY',
      source: 'jambase_api',
      confidence: 'high',
      created_at: '2024-01-15T10:30:00Z'
    },
    {
      id: '2',
      artist: 'The Weeknd',
      date: '2024-07-22',
      venue: 'SoFi Stadium',
      profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face',
      tour: 'After Hours Til Dawn Tour',
      setlist: ['Blinding Lights', 'Starboy', 'The Hills', 'Save Your Tears'],
      venue_location: 'Inglewood, CA',
      source: 'jambase_api',
      confidence: 'high',
      created_at: '2024-01-20T14:45:00Z'
    },
    {
      id: '3',
      artist: 'Billie Eilish',
      date: '2024-08-10',
      venue: 'Hollywood Bowl',
      profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face',
      tour: 'Happier Than Ever Tour',
      setlist: ['Bad Guy', 'Therefore I Am', 'Happier Than Ever', 'Ocean Eyes'],
      venue_location: 'Los Angeles, CA',
      source: 'manual',
      confidence: 'medium',
      created_at: '2024-01-25T09:15:00Z'
    }
  ];

  // Load recent concerts on mount
  useState(() => {
    setRecentConcerts(mockConcerts.slice(0, 3));
  });

  const searchConcerts = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Search Required",
        description: "Please enter a search term",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      setHasSearched(true);
      
      // Simulate search delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Filter mock data
      const filtered = mockConcerts.filter(concert => 
        concert.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
        concert.venue.toLowerCase().includes(searchQuery.toLowerCase()) ||
        concert.tour?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        concert.venue_location?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      
      setConcerts(filtered);
      
      toast({
        title: "Search Complete",
        description: `Found ${filtered.length} concerts`,
      });
      
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Error",
        description: "Failed to search concerts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setConcerts([]);
    setHasSearched(false);
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'bg-green-100 text-green-800 border-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'jambase_api': return <Music className="w-3 h-3" />;
      case 'manual': return <Calendar className="w-3 h-3" />;
      default: return <Calendar className="w-3 h-3" />;
    }
  };

  const handleConcertSelect = (concert: Concert) => {
    if (onSelectConcert) {
      onSelectConcert(concert);
    } else {
      toast({
        title: "Concert Selected",
        description: `${concert.artist} at ${concert.venue}`,
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Search Concerts</h1>
            <p className="text-gray-600 mt-2">Find concerts in your database</p>
          </div>
          <Button variant="outline" onClick={onBack}>
            <X className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>

        {/* Search Bar */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <Input
                  placeholder="Search by artist, venue, tour, or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchConcerts()}
                  className="text-lg"
                />
              </div>
              <Button onClick={searchConcerts} disabled={loading} className="px-8">
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                Search
              </Button>
              <Button variant="outline" onClick={clearSearch} className="px-4">
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Concerts (when no search) */}
        {!hasSearched && !loading && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Recent Concerts</h2>
            <div className="grid gap-4">
              {recentConcerts.map((concert) => (
                <Card key={concert.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleConcertSelect(concert)}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <img 
                        src={concert.profile_pic} 
                        alt={concert.artist}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg">{concert.artist}</h3>
                          <Badge className={`${getConfidenceColor(concert.confidence)} border`}>
                            {getSourceIcon(concert.source)}
                            <span className="ml-1">{concert.source}</span>
                          </Badge>
                        </div>
                        <p className="text-gray-600 mb-2">{concert.venue}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {new Date(concert.date).toLocaleDateString()}
                          </div>
                          {concert.venue_location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              {concert.venue_location}
                            </div>
                          )}
                          {concert.tour && (
                            <div className="flex items-center gap-1">
                              <Music className="w-4 h-4" />
                              {concert.tour}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Search Results */}
        {hasSearched && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                Search Results ({concerts.length})
              </h2>
              {concerts.length > 0 && (
                <Button variant="outline" onClick={clearSearch}>
                  Clear Search
                </Button>
              )}
            </div>

            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Searching concerts...</p>
              </div>
            ) : concerts.length === 0 ? (
              <div className="text-center py-12">
                <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Concerts Found</h3>
                <p className="text-gray-600 mb-6">Try adjusting your search terms</p>
                <Button onClick={clearSearch} variant="outline">
                  Clear Search
                </Button>
              </div>
            ) : (
              <div className="grid gap-4">
                {concerts.map((concert) => (
                  <Card key={concert.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleConcertSelect(concert)}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <img 
                          src={concert.profile_pic} 
                          alt={concert.artist}
                          className="w-16 h-16 rounded-full object-cover"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-xl">{concert.artist}</h3>
                            <Badge className={`${getConfidenceColor(concert.confidence)} border`}>
                              {getSourceIcon(concert.source)}
                              <span className="ml-1">{concert.source}</span>
                            </Badge>
                          </div>
                          <p className="text-gray-600 text-lg mb-3">{concert.venue}</p>
                          
                          <div className="flex items-center gap-6 text-sm text-gray-500 mb-3">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(concert.date).toLocaleDateString()}
                            </div>
                            {concert.venue_location && (
                              <div className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {concert.venue_location}
                              </div>
                            )}
                            {concert.tour && (
                              <div className="flex items-center gap-1">
                                <Music className="w-4 h-4" />
                                {concert.tour}
                              </div>
                            )}
                          </div>

                          {concert.setlist && concert.setlist.length > 0 && (
                            <div className="mt-3">
                              <p className="text-sm font-medium text-gray-700 mb-2">Setlist:</p>
                              <div className="flex flex-wrap gap-1">
                                {concert.setlist.slice(0, 4).map((song, index) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {song}
                                  </Badge>
                                ))}
                                {concert.setlist.length > 4 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{concert.setlist.length - 4} more
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
