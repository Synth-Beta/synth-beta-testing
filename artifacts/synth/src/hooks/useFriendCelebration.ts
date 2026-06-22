import { useState, useEffect } from 'react';
import { NotificationService } from '@/services/notificationService';
import type { CelebrationData } from '@/components/NewFriendCelebrationModal';

export function useFriendCelebration() {
  const [friendCelebration, setFriendCelebration] = useState<{
    notificationId: string;
    friendId: string;
    friendName: string;
    data: CelebrationData;
  } | null>(null);

  // Listen for open-friend-match events (from notification buttons or profile)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.friendId) {
        NotificationService.getFriendCelebrationData(
          detail.friendId,
          detail.friendName || 'Friend',
          detail.notificationId,
        )
          .then((result) => {
            if (result) {
              setFriendCelebration({
                notificationId: result.notificationId || '',
                friendId: detail.friendId,
                friendName: result.friendName,
                data: result.data,
              });
            }
          })
          .catch(() => {});
      }
    };
    window.addEventListener('open-friend-match', handler);
    return () => window.removeEventListener('open-friend-match', handler);
  }, []);

  return { friendCelebration, setFriendCelebration };
}
