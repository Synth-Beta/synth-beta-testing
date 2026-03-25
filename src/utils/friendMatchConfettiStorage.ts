/** Persist “celebration confetti already shown” per current user + friend so reopening View Match doesn’t replay. */

const PREFIX = 'synth_friend_match_confetti_v1';

export function friendMatchConfettiStorageKey(currentUserId: string, friendId: string): string {
  return `${PREFIX}:${currentUserId}:${friendId}`;
}

export function hasSeenFriendMatchConfetti(currentUserId: string, friendId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(friendMatchConfettiStorageKey(currentUserId, friendId)) === '1';
  } catch {
    return true;
  }
}

export function markFriendMatchConfettiSeen(currentUserId: string, friendId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(friendMatchConfettiStorageKey(currentUserId, friendId), '1');
  } catch {
    // ignore quota / private mode
  }
}
