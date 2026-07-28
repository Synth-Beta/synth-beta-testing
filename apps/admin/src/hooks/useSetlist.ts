import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SetlistData {
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

interface UseSetlistResult {
  setlist: SetlistData | null;
  loading: boolean;
  error: string | null;
  hasSetlist: boolean;
  songCount: number;
}

export const useSetlist = (eventId: string): UseSetlistResult => {
  const [setlist, setSetlist] = useState<SetlistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      return;
    }

    const fetchSetlist = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('jambase_events')
          .select('setlist, setlist_enriched, setlist_song_count, setlist_fm_id')
          .eq('id', eventId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (data?.setlist) {
          setSetlist(data.setlist);
        } else {
          setSetlist(null);
        }
      } catch (err) {
        console.error('Error fetching setlist:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch setlist');
        setSetlist(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSetlist();
  }, [eventId]);

  return {
    setlist,
    loading,
    error,
    hasSetlist: !!setlist,
    songCount: setlist?.songCount || 0
  };
};

export default useSetlist;
