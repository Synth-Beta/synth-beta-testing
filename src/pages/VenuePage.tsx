import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function VenuePage() {
  const navigate = useNavigate();
  const { venueIdOrName } = useParams();

  const decodedParam = useMemo(() => {
    if (!venueIdOrName) return '';
    try {
      return decodeURIComponent(venueIdOrName);
    } catch {
      return venueIdOrName;
    }
  }, [venueIdOrName]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [resolvedVenueId, setResolvedVenueId] = useState<string | null>(null);
  const [resolvedVenueName, setResolvedVenueName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id || null;
        if (!cancelled) setCurrentUserId(userId);

        if (!decodedParam) {
          if (!cancelled) {
            setResolvedVenueId(null);
            setResolvedVenueName('');
          }
          return;
        }

        if (isUuid(decodedParam)) {
          const { data: venue } = await supabase
            .from('venues')
            .select('id, name')
            .eq('id', decodedParam)
            .maybeSingle();

          if (!cancelled) {
            setResolvedVenueId(decodedParam);
            setResolvedVenueName(venue?.name || '');
          }
          return;
        }

        const { data: venue } = await supabase
          .from('venues')
          .select('id, name')
          .ilike('name', decodedParam)
          .limit(1)
          .maybeSingle();

        if (!cancelled) {
          setResolvedVenueId(venue?.id || null);
          setResolvedVenueName(venue?.name || decodedParam);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [decodedParam]);

  useEffect(() => {
    if (!loading && resolvedVenueId && resolvedVenueName) {
      window.dispatchEvent(
        new CustomEvent('open-venue-card', {
          detail: { venueId: resolvedVenueId, venueName: resolvedVenueName },
        })
      );
      navigate('/', { replace: true });
    } else if (!loading && decodedParam && !resolvedVenueId) {
      navigate('/not-found', { replace: true });
    }
  }, [decodedParam, loading, navigate, resolvedVenueId, resolvedVenueName]);

  if (!currentUserId) {
    if (!loading) {
      navigate('/', { replace: true });
    }
    return null;
  }

  return null;
}

