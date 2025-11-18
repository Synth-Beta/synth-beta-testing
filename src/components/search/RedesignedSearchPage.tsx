import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Music, Users, Calendar, MapPin, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { UnifiedArtistSearchService, ArtistSearchResult } from '@/services/unifiedArtistSearchService';
import { UnifiedVenueSearchService, VenueSearchResult } from '@/services/unifiedVenueSearchService';
import { format, parseISO } from 'date-fns';
import { EventMap } from '@/components/events/EventMap';

interface RedesignedSearchPageProps {
  userId: string;
  allowedTabs?: TabKey[];
  showMap?: boolean;
  layout?: 'full' | 'compact';
  mode?: 'full' | 'embedded';
  showResults?: boolean;
  headerTitle?: string;
  headerDescription?: string;
  headerAccessory?: React.ReactNode;
  showHelperText?: boolean;
  onSearchStateChange?: (state: { query: string; debouncedQuery: string }) => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
  onEventClick?: (event: EventSearchResult) => void;
}

type TabKey = 'users' | 'artists' | 'events' | 'venues';
const ALL_TAB_KEYS: TabKey[] = ['users', 'artists', 'events', 'venues'];

type UserSearchResult = {
  id: string;
  name: string;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  verified?: boolean | null;
  account_type?: string | null;
};

export type EventSearchResult = {
  id: string;
  title: string | null;
  artistName?: string | null;
  venueName?: string | null;
  eventDate?: string | null;
  imageUrl?: string | null;
};

type MapVenue = {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  latitude: number;
  longitude: number;
  count: number;
};

const MIN_QUERY_LENGTH = 2;

const createEmptyResults = () => ({
  users: [] as UserSearchResult[],
  artists: [] as ArtistSearchResult[],
  events: [] as EventSearchResult[],
  venues: [] as VenueSearchResult[],
});

const TAB_CONFIG: Array<{
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  emptyMessage: string;
}> = [
  {
    key: 'users',
    label: 'Users',
    icon: Users,
    emptyMessage: 'No users match that search yet.',
  },
  {
    key: 'artists',
    label: 'Artists',
    icon: Music,
    emptyMessage: 'No artists found. Try a different spelling?',
  },
  {
    key: 'events',
    label: 'Events',
    icon: Calendar,
    emptyMessage: 'No upcoming events match that search.',
  },
  {
    key: 'venues',
    label: 'Venues',
    icon: MapPin,
    emptyMessage: 'No venues found. Try another location or name.',
  },
];

export const RedesignedSearchPage: React.FC<RedesignedSearchPageProps> = ({
  userId,
  allowedTabs,
  showMap = true,
  layout = 'full',
  mode = 'full',
  showResults = true,
  headerTitle,
  headerDescription,
  headerAccessory,
  showHelperText = true,
  onSearchStateChange,
  onNavigateToProfile: _onNavigateToProfile,
  onNavigateToChat: _onNavigateToChat,
  onEventClick,
}) => {
  const isCompact = layout === 'compact';
  const isEmbedded = mode === 'embedded';
  const shouldShowResults = showResults;
  const sanitizedTabs = useMemo<TabKey[]>(() => {
    if (!allowedTabs || allowedTabs.length === 0) {
      return ALL_TAB_KEYS;
    }
    const filtered = allowedTabs.filter((tab): tab is TabKey => ALL_TAB_KEYS.includes(tab));
    return filtered.length > 0 ? filtered : ALL_TAB_KEYS;
  }, [allowedTabs]);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>(() => sanitizedTabs[0] ?? 'users');
  const [results, setResults] = useState(createEmptyResults);
  const [loading, setLoading] = useState<Record<TabKey, boolean>>({
    users: false,
    artists: false,
    events: false,
    venues: false,
  });
  const [errors, setErrors] = useState<Partial<Record<TabKey, string>>>({});
  const [mapVenues, setMapVenues] = useState<MapVenue[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]);
  const [mapLoading, setMapLoading] = useState(false);
  const filteredTabConfig = useMemo(
    () => TAB_CONFIG.filter(({ key }) => sanitizedTabs.includes(key)),
    [sanitizedTabs]
  );
  const tabCount = filteredTabConfig.length;
  const tabGridClass =
    tabCount >= 4 ? 'grid-cols-4' :
    tabCount === 3 ? 'grid-cols-3' :
    tabCount === 2 ? 'grid-cols-2' :
    'grid-cols-1';

  useEffect(() => {
    if (!sanitizedTabs.includes(activeTab)) {
      setActiveTab(sanitizedTabs[0] ?? 'users');
    }
  }, [sanitizedTabs, activeTab]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    if (debouncedQuery.length < MIN_QUERY_LENGTH) {
      setResults(createEmptyResults());
      setErrors({});
      setLoading({
        users: false,
        artists: false,
        events: false,
        venues: false,
      });
      return;
    }

    let cancelled = false;

    const fetchAllResults = async () => {
      setLoading({
        users: true,
        artists: true,
        events: true,
        venues: true,
      });
      setErrors({});

      const [users, artists, events, venues] = await Promise.all([
        fetchUsers(debouncedQuery, userId),
        UnifiedArtistSearchService.searchArtists(debouncedQuery, 25, true),
        fetchEvents(debouncedQuery),
        UnifiedVenueSearchService.searchVenues(debouncedQuery, 25, true),
      ]);

      if (!cancelled) {
        setResults({
          users,
          artists,
          events,
          venues,
        });
        setLoading({
          users: false,
          artists: false,
          events: false,
          venues: false,
        });
      }
    };

    fetchAllResults().catch(() => {
      if (!cancelled) {
        setResults(createEmptyResults());
        setErrors({ [activeTab]: 'Something went wrong. Please try again.' });
        setLoading({
          users: false,
          artists: false,
          events: false,
          venues: false,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, userId, activeTab]);

  useEffect(() => {
    if (showMap) {
    loadInitialMapVenues();
    }
  }, [showMap]);

  const loadInitialMapVenues = async () => {
    try {
      setMapLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('venue_id, venue_name, venue_city, venue_state, latitude, longitude')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(1000);

      if (error) {
        console.error('Error loading venues for map:', error);
        return;
      }

      if (data) {
        const venueMap = new Map<string, MapVenue>();

        data.forEach((row) => {
          const lat = typeof row.latitude === 'number' ? row.latitude : Number(row.latitude);
          const lng = typeof row.longitude === 'number' ? row.longitude : Number(row.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

          const key = (row.venue_id as string | null) ?? row.venue_name ?? `venue-${lat}-${lng}`;
          const existing = venueMap.get(key);
          if (existing) {
            existing.count += 1;
            return;
          }

          venueMap.set(key, {
            id: key,
            name: (row.venue_name as string) ?? 'Unknown Venue',
            city: row.venue_city as string | null,
            state: row.venue_state as string | null,
            latitude: lat,
            longitude: lng,
            count: 1,
          });
        });

        const venuesArray = Array.from(venueMap.values()).slice(0, 500);
        setMapVenues(venuesArray);

        const first = venuesArray[0];
        if (first) {
          setMapCenter([first.latitude, first.longitude]);
        }
      }
    } finally {
      setMapLoading(false);
    }
  };

  const activeResults = results[activeTab];
  const isTabLoading = loading[activeTab];
  const activeError = errors[activeTab];

  const helperText = useMemo(() => {
    if (!showHelperText) {
      return null;
    }
    if (!searchQuery) {
      return 'Search for artists, events, venues, or people.';
    }
    if (searchQuery.trim().length < MIN_QUERY_LENGTH) {
      return 'Type at least 2 characters to see results.';
    }
    return null;
  }, [searchQuery, showHelperText]);

  useEffect(() => {
    onSearchStateChange?.({
      query: searchQuery,
      debouncedQuery,
    });
  }, [searchQuery, debouncedQuery, onSearchStateChange]);

  const outerClassName = isEmbedded ? 'w-full' : `${isCompact ? '' : 'min-h-screen'} bg-background`;
  const innerClassName = isEmbedded
    ? `w-full ${isCompact ? 'space-y-4' : 'space-y-6'}`
    : `max-w-5xl mx-auto px-4 ${isCompact ? 'py-4 space-y-6' : 'py-8 space-y-8'}`;
  const resolvedTitle = headerTitle ?? 'Search';
  const normalizedTitle = resolvedTitle.trim();
  const shouldShowTitle = normalizedTitle.length > 0;
  const resolvedDescription =
    headerDescription ?? 'Find friends, discover artists, and track upcoming shows — all in one place.';
  const normalizedDescription = resolvedDescription.trim();
  const shouldShowDescription = !isCompact && normalizedDescription.length > 0;

  return (
    <div className={outerClassName}>
      <div className={innerClassName}>
        <div className={`${isCompact ? 'space-y-2' : 'space-y-4'}`}>
          {shouldShowTitle && (
            <h1 className={`${isCompact ? 'text-2xl font-semibold' : 'text-3xl font-bold'} text-foreground`}>
              {normalizedTitle}
            </h1>
          )}
          {shouldShowDescription && (
            <p className="text-muted-foreground">
              {normalizedDescription}
            </p>
          )}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Try “Radiohead”"
                className={`pl-9 ${isCompact ? 'h-10 text-sm' : ''}`}
                id="global-search"
                autoComplete="off"
              />
            </div>
            {headerAccessory && <div className="flex-shrink-0">{headerAccessory}</div>}
          </div>
          {helperText && (
            <p className={`${isCompact ? 'text-xs' : 'text-sm'} text-muted-foreground`} aria-live="polite">
              {helperText}
            </p>
          )}
        </div>

        {shouldShowResults && showMap && debouncedQuery.length < MIN_QUERY_LENGTH && (
          <Card className="border border-dashed border-muted-foreground/40 bg-muted/10">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Explore venues on the map
                </h2>
                <Badge variant="secondary" className="text-xs">
                  {mapLoading ? 'Loading…' : `${mapVenues.length.toLocaleString()} venues`}
                </Badge>
              </div>

              {mapLoading && mapVenues.length === 0 ? (
                <div className="flex h-[360px] items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading venues…
                </div>
              ) : mapVenues.length === 0 ? (
                <div className="flex h-[360px] items-center justify-center text-muted-foreground text-sm">
                  No venues with map data yet. Add some favorites or try searching above.
                </div>
              ) : (
                <div className="h-[420px] rounded-2xl overflow-hidden">
                  <EventMap
                    center={mapCenter}
                    zoom={4}
                    events={mapVenues.map((venue) => ({
                      id: venue.id,
                      jambase_event_id: venue.id,
                      title: venue.name,
                      artist_name: venue.city ? `${venue.name}` : venue.name,
                      artist_id: '',
                      venue_name: venue.name,
                      venue_id: venue.id,
                      event_date: new Date().toISOString(),
                      latitude: venue.latitude,
                      longitude: venue.longitude,
                    }))}
                    onEventClick={() => {}}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {shouldShowResults && debouncedQuery.length >= MIN_QUERY_LENGTH && filteredTabConfig.length > 0 && (
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>
            <TabsList className={`grid w-full md:w-auto md:inline-flex bg-muted/60 ${tabGridClass}`}>
              {filteredTabConfig.map(({ key, label, icon: Icon }) => (
              <TabsTrigger key={key} value={key} className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

            {filteredTabConfig.map(({ key, emptyMessage }) => (
            <TabsContent key={key} value={key} className="mt-6 space-y-4">
              {activeTab === key && (
                <>
                  {isTabLoading && (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      Searching {key}...
                    </div>
                  )}

                  {!isTabLoading && activeError && (
                    <Alert variant="destructive">
                      <AlertDescription>{activeError}</AlertDescription>
                    </Alert>
                  )}

                  {!isTabLoading && !activeError && debouncedQuery.length >= MIN_QUERY_LENGTH && activeResults.length === 0 && (
                    <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-12 text-center">
                      <p className="text-muted-foreground">{emptyMessage}</p>
                    </div>
                  )}

                  {!isTabLoading && activeResults.length > 0 && (
                    <div className="space-y-4">
                      {key === 'users' && <UserResults results={results.users} />}
                      {key === 'artists' && <ArtistResults results={results.artists} />}
                      {key === 'events' && <EventResults results={results.events} onEventClick={onEventClick} />}
                      {key === 'venues' && <VenueResults results={results.venues} />}
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
        )}
      </div>
    </div>
  );
};

const fetchUsers = async (query: string, currentUserId: string): Promise<UserSearchResult[]> => {
  try {
    const likeQuery = `%${query}%`;
    const { data, error } = await supabase
      .from('users')
      .select('user_id, name, avatar_url, bio, verified, account_type')
      .ilike('name', likeQuery)
      .neq('user_id', currentUserId)
      .order('name', { ascending: true })
      .limit(25);

    if (error) {
      console.error('Error searching users:', error);
      return [];
    }

    return (data || []).map((profile) => ({
      id: profile.user_id,
      name: profile.name,
      username: profile.name, // Use name as username since username column doesn't exist
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      verified: profile.verified,
      account_type: profile.account_type,
    }));
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
};

const fetchEvents = async (query: string): Promise<EventSearchResult[]> => {
  try {
    const likeQuery = `%${query}%`;
    const { data, error } = await supabase
      .from('events')
      .select('id, title, artist_name, venue_name, event_date, images')
      .or(`title.ilike.${likeQuery},artist_name.ilike.${likeQuery},venue_name.ilike.${likeQuery}`)
      .order('event_date', { ascending: true })
      .limit(25);

    if (error) {
      console.error('Error searching events:', error);
      return [];
    }

    return (data || []).map((event) => ({
      id: event.id,
      title: event.title,
      artistName: event.artist_name,
      venueName: event.venue_name,
      eventDate: event.event_date,
      imageUrl: Array.isArray(event.images)
        ? event.images.find((img: any) => img?.url)?.url ?? null
        : null,
    }));
  } catch (error) {
    console.error('Error searching events:', error);
    return [];
  }
};

const UserResults: React.FC<{ results: UserSearchResult[] }> = ({ results }) => (
  <>
    {results.map((user) => (
      <Card key={user.id} className="hover:shadow-sm transition-shadow">
        <CardContent className="p-4 flex items-center gap-4">
          <Avatar className="h-12 w-12">
            {user.avatar_url ? (
              <AvatarImage src={user.avatar_url} alt={user.name} />
            ) : (
              <AvatarFallback>{user.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold truncate">{user.name}</span>
              {user.verified && <Badge variant="outline">Verified</Badge>}
                          </div>
            {user.username && (
              <p className="text-sm text-muted-foreground truncate">@{user.username}</p>
            )}
            {user.bio && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{user.bio}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
    ))}
  </>
);
const ArtistResults: React.FC<{ results: ArtistSearchResult[] }> = ({ results }) => {
  const navigate = useNavigate();
  return (
    <>
      {results.map((artist) => (
        <Card 
          key={artist.id} 
          className="hover:shadow-sm transition-shadow cursor-pointer"
          onClick={() => navigate(`/artist/${encodeURIComponent(artist.name)}`)}
        >
          <CardContent className="p-4 flex items-center gap-4">
          <div className="flex-shrink-0">
            {artist.image_url ? (
              <img
                src={artist.image_url}
                alt={artist.name}
                className="h-12 w-12 rounded-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                  event.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`h-12 w-12 rounded-full bg-muted flex items-center justify-center ${artist.image_url ? 'hidden' : ''}`}>
              <Music className="h-5 w-5 text-muted-foreground" />
                              </div>
                                  </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{artist.name}</h3>
            {artist.genres && artist.genres.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {artist.genres.slice(0, 3).map((genre) => (
                  <Badge key={genre} variant="secondary" className="text-xs">
                                          {genre}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
            {typeof artist.num_upcoming_events === 'number' && (
              <p className="text-xs text-muted-foreground mt-1">
                {artist.num_upcoming_events} upcoming {artist.num_upcoming_events === 1 ? 'show' : 'shows'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    ))}
  </>
  );
};

const EventResults: React.FC<{ results: EventSearchResult[]; onEventClick?: (event: EventSearchResult) => void }> = ({ results, onEventClick }) => {
  const navigate = useNavigate();
  return (
    <>
      {results.map((event) => {
      const formattedDate = (() => {
        if (!event.eventDate) return null;
        try {
          return format(parseISO(event.eventDate), 'MMM d, yyyy • h:mm a');
        } catch {
          return event.eventDate;
        }
      })();

      return (
        <Card 
          key={event.id} 
          className="hover:shadow-sm transition-shadow cursor-pointer"
          onClick={() => {
            if (onEventClick) {
              onEventClick(event);
            } else {
              // Fallback: navigate to event if we have the ID
              if (event.id) {
                // Try to open event details modal via custom event
                window.dispatchEvent(new CustomEvent('open-event-details', { 
                  detail: { 
                    event: event,
                    eventId: event.id
                  }
                }));
              }
            }
          }}
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex-shrink-0">
              {event.imageUrl ? (
                <img
                  src={event.imageUrl}
                  alt={event.title ?? event.artistName ?? 'Event'}
                  className="h-16 w-16 rounded-lg object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div
                className={`h-16 w-16 rounded-lg bg-muted flex items-center justify-center ${
                  event.imageUrl ? 'hidden' : ''
                }`}
              >
                <Calendar className="h-5 w-5 text-muted-foreground" />
                                </div>
                              </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{event.title ?? event.artistName ?? 'Untitled Event'}</h3>
              <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                {event.artistName && <p>{event.artistName}</p>}
                {event.venueName && <p>{event.venueName}</p>}
                {formattedDate && <p>{formattedDate}</p>}
                            </div>
                            </div>
          </CardContent>
        </Card>
      );
    })}
  </>
  );
};

const VenueResults: React.FC<{ results: VenueSearchResult[] }> = ({ results }) => {
  const navigate = useNavigate();
  return (
    <>
      {results.map((venue) => (
        <Card 
          key={venue.id} 
          className="hover:shadow-sm transition-shadow cursor-pointer"
          onClick={() => navigate(`/venue/${encodeURIComponent(venue.name)}`)}
        >
          <CardContent className="p-4 flex items-start gap-4">
          <div className="flex-shrink-0 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <MapPin className="h-5 w-5 text-muted-foreground" />
                          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{venue.name}</h3>
            {venue.address?.addressLocality && (
              <p className="text-sm text-muted-foreground">
                {venue.address.addressLocality}
                {venue.address.addressRegion ? `, ${venue.address.addressRegion}` : ''}
              </p>
            )}
            {typeof venue.num_upcoming_events === 'number' && (
              <p className="text-xs text-muted-foreground mt-1">
                {venue.num_upcoming_events} upcoming {venue.num_upcoming_events === 1 ? 'show' : 'shows'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    ))}
  </>
  );
};