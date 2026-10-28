import { useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { SYNTH_APP_STORE_URL } from '@/services/shareService';
import { useInAppBrowserEscape } from '@/hooks/useInAppBrowserEscape';
import { InAppBrowserFallbackModal } from '@/components/InAppBrowserFallbackModal';

const DISMISS_KEY = 'synth_get_app_banner_dismissed';

/**
 * Web can't send push (iOS Safari only allows it for home-screen web apps), and most
 * signups land on web. Point them at the iPhone app, where show alerts work.
 */
export function GetAppBanner() {
  // Facebook/Instagram's in-app browser silently drops App Store taps.
  const { tryEscape, showFallback, dismissFallback } = useInAppBrowserEscape();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Hidden for this visit only.
    }
  };

  return (
    <div className="mb-3 flex items-center gap-3 rounded-2xl border border-pink-200 bg-pink-50 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
        <BellRing className="h-5 w-5 text-[#CC2486]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900">Never miss a show</p>
        <p className="text-xs text-neutral-600">Get alerts when your artists announce shows near you.</p>
      </div>
      <a
        href={SYNTH_APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (tryEscape(SYNTH_APP_STORE_URL)) e.preventDefault();
        }}
        className="shrink-0 rounded-full bg-[#CC2486] px-3 py-2 text-xs font-bold text-[#FFFDFA]"
      >
        Get the app
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex h-11 w-8 shrink-0 items-center justify-center text-neutral-400"
      >
        <X className="h-4 w-4" />
      </button>
      <InAppBrowserFallbackModal
        open={showFallback}
        url={SYNTH_APP_STORE_URL}
        onRetry={() => {
          dismissFallback();
          tryEscape(SYNTH_APP_STORE_URL);
        }}
        onClose={dismissFallback}
      />
    </div>
  );
}
