import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface InAppBrowserFallbackModalProps {
  open: boolean;
  url: string;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * Shown when escapeInAppBrowser() fires but the page never backgrounds -
 * meaning Instagram/Facebook silently swallowed the escape navigation.
 * Gives the user a manual way out instead of a dead tap.
 */
export function InAppBrowserFallbackModal({ open, url, onRetry, onClose }: InAppBrowserFallbackModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable - the link text is still visible below
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-bold text-gray-900">Almost there</h3>
        <p className="mb-1 text-sm text-gray-600">
          Instagram/Facebook's in-app browser is blocking the App Store link.
        </p>
        <p className="mb-4 text-sm text-gray-600">
          Tap <span className="font-semibold">⋯</span> in the top right and choose{' '}
          <span className="font-semibold">"Open in Browser,"</span> then try again.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            onClick={onRetry}
            className="w-full rounded-full bg-gradient-to-r from-pink-600 to-pink-500 text-white hover:from-pink-700 hover:to-pink-600"
          >
            Try again
          </Button>
          <Button variant="outline" onClick={handleCopy} className="w-full rounded-full">
            {copied ? 'Link copied!' : 'Copy link instead'}
          </Button>
          <button
            onClick={onClose}
            className="mt-1 text-center text-sm text-gray-500 hover:text-gray-700"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
