import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShareService } from '@/services/shareService';
import { recordReferralShare } from '@/services/referralShareService';

const DISMISSED_KEY = 'share_with_friends_banner_dismissed';

export function isShareBannerDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(DISMISSED_KEY) === 'true';
}

interface ShareWithFriendsBannerProps {
  onDismiss: () => void;
  referralCode?: string | null;
}

const BANNER_MESSAGE = 'Share the app for a chance to win a $50 gift card!';

export function ShareWithFriendsBanner({ onDismiss, referralCode }: ShareWithFriendsBannerProps) {
  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    onDismiss();
  };

  const handleShare = () => {
    recordReferralShare('banner');
    ShareService.shareApp(referralCode ?? null, {
      message: "I've been using Synth to discover concerts and share live music with friends. Join me — ",
    });
  };

  return (
    <Alert
      className="rounded-none border-x-0 border-t-0 bg-gradient-to-r from-pink-50 to-purple-50/80 border-b border-pink-100"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        paddingTop: `calc(env(safe-area-inset-top, 0px) + var(--spacing-small, 12px))`,
        paddingBottom: 'var(--spacing-small, 12px)',
        paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
        paddingRight: 'var(--spacing-screen-margin-x, 20px)',
        marginTop: 0,
        marginBottom: 0,
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.06)',
        minHeight: '56px',
      }}
      data-banner-visible="true"
    >
      <div className="flex items-center justify-between gap-3">
        <AlertDescription className="flex-1 text-sm">
          {BANNER_MESSAGE}
        </AlertDescription>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={handleShare} className="bg-pink-600 hover:bg-pink-700 var(--neutral-0)">
            Share
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-8 w-8 p-0" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Alert>
  );
}
