import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Music2, MapPin, Calendar, Users } from 'lucide-react';
import type { NotificationWithDetails } from '@/types/notifications';

export interface FriendTaggedReviewInviteData {
  review_id?: string;
  artist_id?: string;
  artist_name?: string;
  venue_id?: string;
  venue_name?: string;
  event_date?: string;
  actor_user_id?: string;
  actor_name?: string;
  attendees?: Array<{ type: 'user'; user_id: string; name: string; avatar_url?: string }>;
}

interface FriendTaggedReviewInviteModalProps {
  notification: NotificationWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onWriteReview: (prefillEvent: PrefillEvent) => void;
}

export interface PrefillEvent {
  id: string;
  artist_id?: string;
  artist_name?: string;
  venue_id?: string;
  venue_name?: string;
  event_date?: string;
  attendees?: Array<{ type: 'user'; user_id: string; name: string; avatar_url?: string }>;
}

function formatEventDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function FriendTaggedReviewInviteModal({
  notification,
  isOpen,
  onClose,
  onWriteReview,
}: FriendTaggedReviewInviteModalProps) {
  const data = (notification.data || {}) as FriendTaggedReviewInviteData;
  const actorName = notification.actor_name || data.actor_name || 'Someone';
  const artistName = data.artist_name || 'the artist';
  const venueName = data.venue_name || 'the venue';
  const eventDate = data.event_date ? formatEventDate(data.event_date) : '';

  const handleWriteReview = () => {
    const prefillEvent: PrefillEvent = {
      id: `invite-${data.review_id || 'new'}`,
      artist_id: data.artist_id,
      artist_name: data.artist_name,
      venue_id: data.venue_id,
      venue_name: data.venue_name,
      event_date: data.event_date,
      attendees: data.attendees,
    };
    onWriteReview(prefillEvent);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            You were tagged in a review
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-muted-foreground">
            <strong>{actorName}</strong> tagged you in their review of this show. Share your experience too!
          </p>

          <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
            {artistName && (
              <div className="flex items-center gap-2">
                <Music2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium">{artistName}</span>
              </div>
            )}
            {venueName && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{venueName}</span>
              </div>
            )}
            {eventDate && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{eventDate}</span>
              </div>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Artist, venue, date, and friends will be pre-filled so you can write your review in seconds.
          </p>
        </DialogBody>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Maybe later
          </Button>
          <Button onClick={handleWriteReview} className="w-full sm:w-auto">
            Write your review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
