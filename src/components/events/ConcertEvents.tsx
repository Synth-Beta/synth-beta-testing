import { useState, useEffect } from 'react';
import { Search, MapPin, Calendar, Heart, Music, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';

interface ConcertEvent {
  id: string;
  title: string;
  artist_name: string;
  venue_name: string;
  venue_city: string;
  venue_state: string;
  event_date: string;
  doors_time?: string;
  description?: string;
  genres?: string[];
  price_range?: string;
  ticket_available: boolean;
  ticket_urls?: string[];
  tour_name?: string;
  image_url?: string;
  isInterested?: boolean;
}

interface ConcertEventsProps {
  currentUserId: string;
  onBack: () => void;
}

export const ConcertEvents = ({ currentUserId, onBack }: ConcertEventsProps) => {
  const [concerts, setConcerts] = useState<ConcertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [cities, setCities] = useState<string[]>([]);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    loadConcerts();
    loadInterestedEvents();
  }, [currentUserId]);

  useEffect(() => {
    // Extract unique cities from concerts
    const uniqueCities = Array.from(new Set(concerts.map(c => c.venue_city).filter(Boolean)));
    setCities(uniqueCities.sort());
  }, [concerts]);

  const loadConcerts = async () => {
    try {
      setLoading(true);
      
      // Fetch future concerts from jambase_events table
      const { data, error } = await supabase
        .from('jambase_events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })
        .limit(100);

      if (error) throw error;

      setConcerts(data || []);
    } catch (error) {
      console.error('Error loading concerts:', error);
      toast({
        title: "Error",
        description: "Failed to load concerts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadInterestedEvents = async () => {
    if (!currentUserId) return;

    try {
      const { data, error } = await supabase
        .from('user_jambase_events')
        .select('jambase_event_id')
        .eq('user_id', currentUserId);

      if (error) throw error;

      const interestedSet = new Set(data?.map(item => item.jambase_event_id) || []);
      setInterestedEvents(interestedSet);
    } catch (error) {
      console.error('Error loading interested events:', error);
    }
  };

  const handleInterestToggle = async (eventId: string) => {
    if (!currentUserId) return;

    try {
      const isCurrentlyInterested = interestedEvents.has(eventId);

      if (isCurrentlyInterested) {
        // Remove from interested
        const { error } = await supabase
          .from('user_jambase_events')
          .delete()
          .eq('user_id', currentUserId)
          .eq('jambase_event_id', eventId);

        if (error) throw error;

        setInterestedEvents(prev => {
          const newSet = new Set(prev);
          newSet.delete(eventId);
          return newSet;
        });

        toast({
          title: "Removed from Interested",
          description: "Event removed from your interested list",
        });
      } else {
        // Add to interested
        const { error } = await supabase
          .from('user_jambase_events')
          .insert({
            user_id: currentUserId,
            jambase_event_id: eventId
          });

        if (error) throw error;

        setInterestedEvents(prev => new Set([...prev, eventId]));

        toast({
          title: "Added to Interested!",
          description: "Event added to your interested list",
        });
      }
    } catch (error) {
      console.error('Error toggling interest:', error);
      toast({
        title: "Error",
        description: "Failed to update your interest",
        variant: "destructive",
      });
    }
  };

  const filteredConcerts = concerts.filter(concert => {
    const matchesSearch = concert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         concert.artist_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         concert.venue_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCity = selectedCity === 'all' || concert.venue_city === selectedCity;
    return matchesSearch && matchesCity;
  });

  const getGenreColor = (genre: string) => {
    const colors: Record<string, string> = {
      'rock': 'bg-red-100 text-red-800 border-red-200',
      'pop': 'bg-pink-100 text-pink-800 border-pink-200',
      'jazz': 'bg-blue-100 text-blue-800 border-blue-200',
      'classical': 'bg-purple-100 text-purple-800 border-purple-200',
      'electronic': 'bg-green-100 text-green-800 border-green-200',
      'hip-hop': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'country': 'bg-orange-100 text-orange-800 border-orange-200',
      'blues': 'bg-indigo-100 text-indigo-800 border-indigo-200',
    };
    return colors[genre.toLowerCase()] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading concerts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 pb-20">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Concerts</h1>
              <p className="text-muted-foreground mt-1">Discover upcoming concerts near you</p>
            </div>
            <Button
              variant="outline"
              onClick={onBack}
              className="flex items-center gap-2"
            >
              ← Back
            </Button>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                id="concert-events-search"
                name="concertEventsSearch"
                placeholder="Search artists, venues, or concerts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={selectedCity} onValueChange={setSelectedCity}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Select city" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Concerts Grid - 5 per row on large screens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredConcerts.map((concert) => (
            <Card key={concert.id} className="group hover:shadow-lg transition-all duration-200 overflow-hidden bg-card">
              {/* Concert Image */}
              <div className="relative h-48 overflow-hidden">
                <img 
                  src={concert.image_url || '/placeholder.svg'} 
                  alt={concert.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                <div className="absolute top-3 left-3">
                  <Badge className="bg-primary/90 text-primary-foreground">
                    <Music className="w-3 h-3 mr-1" />
                    Concert
                  </Badge>
                </div>
                {concert.price_range && (
                  <div className="absolute top-3 right-3 bg-background/90 text-foreground px-2 py-1 rounded-full text-xs font-semibold">
                    {concert.price_range}
                  </div>
                )}
                <div className="absolute bottom-3 right-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleInterestToggle(concert.id)}
                    className={`h-8 w-8 p-0 rounded-full ${
                      interestedEvents.has(concert.id) 
                        ? 'bg-red-500 hover:bg-red-600 text-white' 
                        : 'bg-background/90 hover:bg-background text-foreground'
                    }`}
                  >
                    <Heart 
                      className={`w-4 h-4 ${
                        interestedEvents.has(concert.id) ? 'fill-current' : ''
                      }`} 
                    />
                  </Button>
                </div>
              </div>

              {/* Concert Details */}
              <div className="p-4 space-y-3">
                <div>
                  <h3 className="font-semibold text-foreground text-sm line-clamp-2 mb-1">
                    {concert.title}
                  </h3>
                  <p className="text-muted-foreground text-xs">{concert.artist_name}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3 flex-shrink-0" />
                    <span className="line-clamp-1">
                      {(() => {
                        try {
                          return format(parseISO(concert.event_date), 'MMM d, yyyy');
                        } catch {
                          return concert.event_date;
                        }
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="line-clamp-1">
                      {concert.venue_name}, {concert.venue_city}
                    </span>
                  </div>
                </div>

                {/* Genres */}
                {concert.genres && concert.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {concert.genres.slice(0, 2).map((genre, index) => (
                      <Badge 
                        key={index}
                        variant="outline"
                        className={`text-xs ${getGenreColor(genre)}`}
                      >
                        {genre}
                      </Badge>
                    ))}
                    {concert.genres.length > 2 && (
                      <Badge variant="outline" className="text-xs bg-gray-100 text-gray-800">
                        +{concert.genres.length - 2}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Tour Name */}
                {concert.tour_name && (
                  <div className="text-xs text-muted-foreground line-clamp-1">
                    {concert.tour_name}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {filteredConcerts.length === 0 && !loading && (
          <div className="text-center py-12">
            <Music className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Concerts Found</h3>
            <p className="text-muted-foreground">
              {searchTerm || selectedCity !== 'all' 
                ? "Try adjusting your search or filters" 
                : "No upcoming concerts available at the moment"
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
