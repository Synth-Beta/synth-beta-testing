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
      // Hard navigation for /share so we never stay on a dead route if the router lags.
      if (location.pathname === '/share' || location.pathname === '/share/') {
        window.location.replace(target.href);
        return;
      }
      navigate(targetPath, { replace: true });
    }

    window.dispatchEvent(new CustomEvent('synth-pending-share'));
  }, [location.pathname, location.search, navigate]);

  return null;
}
