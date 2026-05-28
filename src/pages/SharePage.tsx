import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { parseShareUrl, buildWebAppUrlFromShare } from '@synth/shared';
import { storePendingLink } from '@/services/shareDeepLinkService';
import { SynthLoader } from '@/components/ui/SynthLoader';

/**
 * Fallback when Vercel does not rewrite /share to api/share (local dev, misconfig).
 * Immediately forwards to /?event= or /?review= so MainApp opens the right card.
 */
export function SharePage() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const pending =
      parseShareUrl(window.location.href) ||
      (location.search ? parseShareUrl(location.search) : null);

    if (!pending) {
      navigate('/', { replace: true });
      return;
    }

    storePendingLink(pending);
    const target = new URL(buildWebAppUrlFromShare(window.location.origin, pending));
    navigate(`${target.pathname}${target.search}`, { replace: true });
  }, [location.search, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SynthLoader size="md" variant="spinner" inline />
    </div>
  );
}
