import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EventLikesService, LikerProfile } from '@/services/eventLikesService';

interface EventLikersModalProps {
  eventId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EventLikersModal({ eventId, isOpen, onClose }: EventLikersModalProps) {
  const [likers, setLikers] = useState<LikerProfile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !eventId) return;
    (async () => {
      setLoading(true);
      try {
        const result = await EventLikesService.getEventLikers(eventId);
        setLikers(result);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, eventId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Likes</DialogTitle>
          <DialogDescription>People who liked this event</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : likers.length === 0 ? (
            <div className="text-sm text-muted-foreground">No likes yet.</div>
          ) : (
            likers.map((u) => (
              <div key={u.user_id} className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={u.avatar_url || undefined} />
                  <AvatarFallback>{(u.name || 'U').slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="text-sm">{u.name || 'User'}</div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


