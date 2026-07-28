import { supabase } from '@/integrations/supabase/client';

// Use backend proxy to avoid CORS issues
const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

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
    const queryParams = new URLSearchParams();
    
    if (params.artistName) queryParams.append('artistName', params.artistName);
    if (params.date) queryParams.append('date', params.date);
    if (params.venueName) queryParams.append('venueName', params.venueName);
    if (params.cityName) queryParams.append('cityName', params.cityName);
    if (params.stateCode) queryParams.append('stateCode', params.stateCode);
    
    const url = `${BACKEND_BASE_URL}/api/setlists/search?${queryParams.toString()}`;
    
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
          return null; // No setlists found
        }
        throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.setlist || data.setlist.length === 0) {
        return null;
      }
      
      console.log('🎵 SetlistService: Received setlists:', data.setlist.length);
      
      // Data is already transformed by the backend
      return data.setlist;
      
    } catch (error) {
      console.error('Error searching setlists:', error);
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
