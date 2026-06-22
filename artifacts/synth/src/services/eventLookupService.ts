import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/types/eventTypes';

const EVENT_SELECT = '*, artists(name), venues(name)';

export interface NormalizedEventRecord extends JamBaseEvent {
  artist_name?: string | null;
  venue_name?: string | null;
}

function normalizeEventRow(row: Record<string, any>): NormalizedEventRecord {
  const extractName = (value: any) => {
    if (Array.isArray(value) && value.length > 0) {
      return value[0]?.name;
    }
    if (value?.name) return value.name;
    return null;
  };

  return {
    ...row,
    artist_name: extractName(row.artists) ?? row.artist_name ?? null,
    venue_name: extractName(row.venues) ?? row.venue_name ?? null,
  };
}

export interface EventLookupResult {
  event: NormalizedEventRecord | null;
  error: any | null;
}

export async function fetchEventForModal(eventId: string): Promise<EventLookupResult> {
  if (!eventId) {
    return { event: null, error: null };
  }

  const primary = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', eventId)
    .maybeSingle();

  if (primary.data) {
    return { event: normalizeEventRow(primary.data), error: null };
  }

  const fallback = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('jambase_event_id', eventId)
    .maybeSingle();

  if (fallback.data) {
    return { event: normalizeEventRow(fallback.data), error: null };
  }

  return { event: null, error: primary.error || fallback.error };
}
