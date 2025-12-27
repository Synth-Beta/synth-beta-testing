import { supabase } from '@/integrations/supabase/client';

const REMOTE_PROXY_URL =
  import.meta.env.VITE_REMOTE_SETLIST_PROXY_URL || 'https://synth-beta-testing.vercel.app';

// Determine the correct backend URL based on environment
// Supports: localhost, Vercel web, iOS (Capacitor), Android (Capacitor)
const getBackendUrl = () => {
  if (typeof window === 'undefined') {
    // Server-side: use backend URL
    return import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  }

  // For web browsers - check hostname FIRST (prioritize localhost over Capacitor)
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || 
                      hostname.startsWith('127.0.0.1') ||
                      hostname.startsWith('192.168.') ||
                      hostname.startsWith('10.0.') ||
                      hostname.startsWith('172.');
  
  if (isLocalhost) {
    // Development: use backend Express server (even if Capacitor is loaded)
    return import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  }

  // Check if we're in a Capacitor app (iOS/Android) - only for non-localhost
  const isCapacitor = !!(window as any).Capacitor;
  
  if (isCapacitor) {
    // For Capacitor apps (iOS/Android), always use the Vercel production URL
    // This ensures the serverless function works in native apps
    return import.meta.env.VITE_VERCEL_URL || 'https://synth-beta-testing.vercel.app';
  }
  
  // Production web (Vercel): use relative URL for serverless functions
  // This will automatically use the same domain (Vercel deployment)
  return '';
};

export interface SetlistSearchParams {
  artistName?: string;
  date?: string;
  venueName?: string;
  cityName?: string;
  stateCode?: string;
}

export interface SetlistData {
  setlistFmId: string;
  versionId: string;
  eventDate: string;
  artist: {
    name: string;
    mbid: string;
  };
  venue: {
    name: string;
    city: string;
    state: string;
    country: string;
  };
  tour?: string;
  info?: string;
  url: string;
  songs: Array<{
    name: string;
    position: number;
    setNumber: number;
    setName: string;
    cover?: {
      artist: string;
      mbid: string;
    };
    info?: string;
    tape: boolean;
  }>;
  songCount: number;
  lastUpdated: string;
}

export class SetlistService {
  /**
   * Search for setlists using backend proxy
   */
  static async searchSetlists(params: SetlistSearchParams): Promise<SetlistData[] | null> {
    const queryString = this.buildQueryString(params);
    const backendUrl = getBackendUrl();
    
    const url = `${backendUrl}/api/setlists/search?${queryString}`;
    
    // Always try setlist.fm API first via backend proxy
    try {
      console.log('🎵 SetlistService: Making request to setlist.fm API via backend proxy:', url);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          // Backend searched setlist.fm API but found nothing
          console.log('📭 No results from setlist.fm API');
          return null;
        }
        throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.setlist || data.setlist.length === 0) {
        // No matches from backend
        console.log('📭 No results from setlist.fm API');
        return null;
      }
      
      console.log('✅ SetlistService: Received setlists from setlist.fm API:', data.setlist.length);
      
      // Data is already transformed by the backend
      return data.setlist;
      
    } catch (error) {
      console.error('❌ Error with setlist.fm API proxy:', error);
      const offlineError = new Error('setlist-service-offline');
      offlineError.name = 'SetlistServiceOfflineError';
      throw offlineError;
    }
  }

  private static buildQueryString(params: SetlistSearchParams): string {
    const queryParams = new URLSearchParams();
    if (params.artistName) queryParams.append('artistName', params.artistName);
    if (params.date) queryParams.append('date', params.date);
    if (params.venueName) queryParams.append('venueName', params.venueName);
    if (params.cityName) queryParams.append('cityName', params.cityName);
    if (params.stateCode) queryParams.append('stateCode', params.stateCode);
    return queryParams.toString();
  }

  private static async searchSetlistsViaServerless(
    params: SetlistSearchParams,
    queryString: string
  ): Promise<SetlistData[] | null> {
    try {
      const relativeUrl = `/api/setlists/search?${queryString}`;
      console.log('🎵 SetlistService: Trying serverless proxy:', relativeUrl);

      const response = await fetch(relativeUrl, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          // setlist.fm API returned no results
          return null;
        }
        throw new Error(`Serverless proxy error: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        console.warn('🎵 Serverless proxy returned non-JSON payload');
        return null;
      }

      const data = await response.json();
      if (!data.setlist || data.setlist.length === 0) {
        return null;
      }

      console.log('🎵 SetlistService: Received setlists from serverless proxy:', data.setlist.length);
      return data.setlist;
    } catch (proxyError) {
      console.warn('🎵 Serverless setlist proxy failed:', proxyError);
      return null;
    }
  }

  private static async searchSetlistsViaRemoteProxy(
    params: SetlistSearchParams,
    queryString: string
  ): Promise<SetlistData[] | null> {
    try {
      const remoteUrl = `${REMOTE_PROXY_URL}/api/setlists/search?${queryString}`;
      console.log('🎵 SetlistService: Trying remote proxy:', remoteUrl);

      const response = await fetch(remoteUrl, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          // setlist.fm API returned no results
          return null;
        }
        // Refresh the remote Vercel proxy once to ensure new code is deployed
        try {
          await fetch(`${REMOTE_PROXY_URL}/api/setlists/health`, { method: 'GET' });
        } catch (refreshError) {
          console.warn('🎵 Remote proxy health check failed:', refreshError);
        }

        // Retry once after refresh
        const retryResponse = await fetch(remoteUrl, {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
        });

        if (!retryResponse.ok) {
          throw new Error(`Remote proxy error: ${retryResponse.status} ${retryResponse.statusText}`);
        }

        const retryContentType = retryResponse.headers.get('content-type') ?? '';
        if (!retryContentType.includes('application/json')) {
          console.warn('🎵 Remote proxy retry returned non-JSON payload');
          return null;
        }

        const retryData = await retryResponse.json();
        if (!retryData.setlist || retryData.setlist.length === 0) {
          return null;
        }

        console.log('🎵 SetlistService: Received setlists from remote proxy (retry):', retryData.setlist.length);
        return retryData.setlist;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        console.warn('🎵 Remote proxy returned non-JSON payload');
        return null;
      }

      const data = await response.json();
      if (!data.setlist || data.setlist.length === 0) {
        return null;
      }

      console.log('🎵 SetlistService: Received setlists from remote proxy:', data.setlist.length);
      return data.setlist;
    } catch (remoteError) {
      console.warn('🎵 Remote setlist proxy failed:', remoteError);
      return null;
    }
  }

  private static async searchSetlistsFromDatabase(params: SetlistSearchParams): Promise<SetlistData[] | null> {
    try {
      let query = supabase
        .from('events')
        .select('id, setlist, artist_id, venue_id, event_date')
        .not('setlist', 'is', null);

      // If searching by artist name, first find the artist ID
      if (params.artistName) {
        const { data: artistData } = await supabase
          .from('artists')
          .select('id')
          .ilike('name', `%${params.artistName}%`)
          .limit(1)
          .maybeSingle();
        
        if (artistData?.id) {
          query = query.eq('artist_id', artistData.id);
        } else {
          // No artist found, return empty
          return null;
        }
      }

      // If searching by venue name, first find the venue ID
      if (params.venueName) {
        const { data: venueData } = await supabase
          .from('venues')
          .select('id')
          .ilike('name', `%${params.venueName}%`)
          .limit(1)
          .maybeSingle();
        
        if (venueData?.id) {
          query = query.eq('venue_id', venueData.id);
        } else {
          // No venue found, return empty
          return null;
        }
      }

      // Handle date filtering - convert date string to date range if needed
      if (params.date) {
        // If date is in YYYY-MM-DD format, filter by date range (start and end of day)
        const dateStr = params.date.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          // Date is in YYYY-MM-DD format, create range for the entire day
          const startOfDay = new Date(dateStr + 'T00:00:00Z');
          const endOfDay = new Date(dateStr + 'T23:59:59Z');
          query = query.gte('event_date', startOfDay.toISOString())
                       .lte('event_date', endOfDay.toISOString());
        } else {
          // Try exact match as fallback
          query = query.eq('event_date', dateStr);
        }
      }

      const { data, error } = await query.limit(10);

      if (error) {
        console.error('🎵 Supabase setlist fallback error:', error);
        return null;
      }

      if (!data || data.length === 0) {
        return null;
      }

      const setlists = data
        .map((row: any) => row.setlist as SetlistData | null)
        .filter((setlist): setlist is SetlistData => !!setlist);

      if (setlists.length === 0) {
        return null;
      }

      console.log('🎵 SetlistService: Served setlists from Supabase cache:', setlists.length);
      return setlists;
    } catch (dbError) {
      console.error('🎵 Supabase setlist fallback exception:', dbError);
      return null;
    }
  }

  /**
   * Get setlist for a specific event
   */
  static async getSetlistForEvent(eventId: string): Promise<SetlistData | null> {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('setlist, setlist_enriched, setlist_song_count, setlist_fm_id, event_date')
        .eq('id', eventId)
        .single();

      if (error) throw error;

      if (data?.setlist) {
        return data.setlist;
      }

      return null;
    } catch (error) {
      console.error('Error getting setlist for event:', error);
      return null;
    }
  }

  /**
   * Search for setlists by artist and date
   */
  static async searchSetlistsByArtist(artistName: string, eventDate?: string): Promise<SetlistData[] | null> {
    return this.searchSetlists({
      artistName,
      date: eventDate
    });
  }

  /**
   * Search for setlists by artist, venue, and date
   */
  static async searchSetlistsByArtistAndVenue(
    artistName: string, 
    venueName: string, 
    eventDate?: string
  ): Promise<SetlistData[] | null> {
    return this.searchSetlists({
      artistName,
      venueName,
      date: eventDate
    });
  }
}
