import { supabase } from '@/integrations/supabase/client';

const REMOTE_PROXY_URL =
  import.meta.env.VITE_REMOTE_SETLIST_PROXY_URL || 'https://synth-beta-testing.vercel.app';

// Use relative URL in production (Vercel serverless functions) or backend URL in development
const getBackendUrl = () => {
  if (typeof window !== 'undefined') {
    const isProduction = window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.0.0.1');
    if (isProduction) return '';
    return import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  }
  return import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
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
    const url = `${getBackendUrl()}/api/setlists/search?${queryString}`;
    
    try {
      console.log('🎵 SetlistService: Making request to backend proxy:', url);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          // Backend searched but found nothing. Fall back to Supabase for cached data.
          return await this.searchSetlistsFromDatabase(params);
        }
        throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.setlist || data.setlist.length === 0) {
        // No matches from backend – attempt other fallbacks before giving up
        const serverless = await this.searchSetlistsViaServerless(params, queryString);
        if (serverless && serverless.length > 0) return serverless;

        const remote = await this.searchSetlistsViaRemoteProxy(params, queryString);
        if (remote && remote.length > 0) return remote;

        return await this.searchSetlistsFromDatabase(params);
      }
      
      console.log('🎵 SetlistService: Received setlists:', data.setlist.length);
      
      // Data is already transformed by the backend
      return data.setlist;
      
    } catch (error) {
      console.error('Error searching setlists:', error);
      // Try serverless Vercel proxy
      const fallbackServerless = await this.searchSetlistsViaServerless(params, queryString);
      if (fallbackServerless && fallbackServerless.length > 0) {
        return fallbackServerless;
      }

      // Try hosted production proxy
      const fallbackRemote = await this.searchSetlistsViaRemoteProxy(params, queryString);
      if (fallbackRemote && fallbackRemote.length > 0) {
        return fallbackRemote;
      }

      // Finally, fall back to any cached Supabase setlists
      const cachedSetlists = await this.searchSetlistsFromDatabase(params);
      if (cachedSetlists && cachedSetlists.length > 0) {
        return cachedSetlists;
      }

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
          return await this.searchSetlistsFromDatabase(params);
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
          return await this.searchSetlistsFromDatabase(params);
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
        .from('jambase_events')
        .select('setlist, artist_name, venue_name, event_date')
        .not('setlist', 'is', null);

      if (params.artistName) {
        query = query.ilike('artist_name', `%${params.artistName}%`);
      }

      if (params.venueName) {
        query = query.ilike('venue_name', `%${params.venueName}%`);
      }

      if (params.date) {
        query = query.eq('event_date', params.date);
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
        .from('jambase_events')
        .select('setlist, setlist_enriched, setlist_song_count, setlist_fm_id, artist_name, venue_name, event_date')
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
