import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw, ExternalLink, Loader2 } from 'lucide-react';

export type MusicServiceType = 'spotify' | 'apple_music';

interface MusicServiceActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceType: MusicServiceType;
  serviceLabel: string;
  href: string;
  onSync: () => Promise<void>;
  onOpenApp: () => void;
  isSyncing?: boolean;
}

export const MusicServiceActionModal: React.FC<MusicServiceActionModalProps> = ({
  open,
  onOpenChange,
  serviceType,
  serviceLabel,
  href,
  onSync,
  onOpenApp,
  isSyncing = false,
}) => {
  const [syncSuccess, setSyncSuccess] = React.useState(false);

  const handleSync = async () => {
    setSyncSuccess(false);
    try {
      await onSync();
      setSyncSuccess(true);
      // Brief visible success then close
      setTimeout(() => onOpenChange(false), 800);
    } catch {
      // Error handling / toast is done by the caller; keep modal open
    }
  };

  const handleOpenApp = () => {
    onOpenApp();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" hideCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{serviceLabel}</DialogTitle>
          <DialogDescription>
            Sync your latest listening data to personalize your feed, or open your profile in the app.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Button
            type="button"
            variant="default"
            className="w-full justify-center gap-2"
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Syncing…
              </>
            ) : syncSuccess ? (
              <>Synced!</>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Sync latest stats
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center gap-2"
            onClick={handleOpenApp}
            disabled={isSyncing}
          >
            <ExternalLink className="h-4 w-4" />
            Go to your music app
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
