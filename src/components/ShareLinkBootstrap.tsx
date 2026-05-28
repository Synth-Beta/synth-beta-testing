import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildWebAppUrlFromShare, parseShareUrl } from '@synth/shared';
import { storePendingLink } from '@/services/shareDeepLinkService';

/**
 * Runs on every web route. Captures /share?event= and /?event= params,
 * persists them for post-login, and normalizes the URL to /?event= so MainApp
 * can open the event/review card.
 */
export function ShareLinkBootstrap() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const pending =
      parseShareUrl(window.location.href) ||
      (location.search ? parseShareUrl(location.search) : null);

    if (!pending) return;

    storePendingLink(pending);

    const target = new URL(buildWebAppUrlFromShare(window.location.origin, pending));
    const targetPath = `${target.pathname}${target.search}`;
    const currentPath = `${location.pathname}${location.search}`;

    if (currentPath !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  return null;
}
