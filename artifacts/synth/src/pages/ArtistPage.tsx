import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function ArtistPage() {
  const navigate = useNavigate();
  const { artistIdOrName } = useParams();

  const decodedParam = useMemo(() => {
    if (!artistIdOrName) return '';
    try {
      return decodeURIComponent(artistIdOrName);
    } catch {
      return artistIdOrName;
    }
  }, [artistIdOrName]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [resolvedArtistId, setResolvedArtistId] = useState<string | null>(null);
  const [resolvedArtistName, setResolvedArtistName] = useState<string>('');
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
            setResolvedArtistId(null);
            setResolvedArtistName('');
          }
          return;
        }

        if (isUuid(decodedParam)) {
          // UUID route param: use directly.
          const { data: artist } = await supabase
            .from('artists')
            .select('id, name')
            .eq('id', decodedParam)
            .maybeSingle();

          if (!cancelled) {
            setResolvedArtistId(decodedParam);
            setResolvedArtistName(artist?.name || '');
          }
          return;
        }

        // Name route param: look up ID by name.
        const { data: artist } = await supabase
          .from('artists')
          .select('id, name')
          .ilike('name', decodedParam)
          .limit(1)
          .maybeSingle();

        if (!cancelled) {
          setResolvedArtistId(artist?.id || null);
          setResolvedArtistName(artist?.name || decodedParam);
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
    // Once we have an artist, dispatch the same event the main app listens for
    // so the existing shell (header/footer + UnifiedFeed) opens the detail modal.
    if (!loading && resolvedArtistId && resolvedArtistName) {
      window.dispatchEvent(
        new CustomEvent('open-artist-card', {
          detail: { artistId: resolvedArtistId, artistName: resolvedArtistName },
        })
      );
      navigate('/', { replace: true });
    } else if (!loading && decodedParam && !resolvedArtistId) {
      navigate('/not-found', { replace: true });
    }
  }, [decodedParam, loading, navigate, resolvedArtistId, resolvedArtistName]);

  // While resolving the artist, render nothing – user will be routed into "/"
  // with the standard layout as soon as the event is dispatched.
  if (!currentUserId) {
    if (!loading) {
      navigate('/', { replace: true });
    }
    return null;
  }

  return null;
}

