import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareService, SHARE_APP_MESSAGE_EVENT_TOGETHER } from '@/services/shareService';
import { recordReferralShare } from '@/services/referralShareService';

interface ShareAppCTAProps {
  referralCode?: string | null;
  source?: string;
  compact?: boolean;
}

/** Inline CTA: one Share button. Opens share sheet with event-together message + link; records referral_shares + interactions. */
export function ShareAppCTA({ referralCode, source, compact }: ShareAppCTAProps) {
  const handleShare = () => {
    recordReferralShare(source ?? 'review_flow');
    ShareService.shareApp(referralCode ?? null, {
      message: SHARE_APP_MESSAGE_EVENT_TOGETHER,
    });
  };

  return (
    <div className="rounded-lg border border-pink-200 bg-pink-50/50 p-4">
      <p className="text-sm text-gray-800 mb-3">
        Share Synth with friends you went with for a chance to win a <strong>$50 gift card</strong>!
      </p>
      <Button
        type="button"
        variant="outline"
        size={compact ? 'sm' : 'default'}
        className="border-pink-300 text-pink-700 hover:bg-pink-100 hover:border-pink-400"
        onClick={handleShare}
      >
        <Share2 className="w-4 h-4 mr-2" />
        Share
      </Button>
    </div>
  );
}
