import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-user so a shared device still shows the tour to each new account.
const key = (userId: string) => `FEATURE_TOUR_DONE:${userId}`;

/** Accounts older than this never get the tour auto-opened (it's still in the app menu). */
export const FEATURE_TOUR_AUTO_MAX_ACCOUNT_AGE_DAYS = 14;

export async function hasSeenFeatureTour(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(userId))) === 'true';
  } catch {
    // Storage unavailable: say "seen" so we never trap someone in a loop of tours.
    return true;
  }
}

/** True when this account should get the tour opened for it now (new account, not seen yet). */
export async function shouldAutoOpenFeatureTour(user: { id: string; created_at: string }): Promise<boolean> {
  const ageDays = (Date.now() - new Date(user.created_at).getTime()) / 86_400_000;
  if (ageDays > FEATURE_TOUR_AUTO_MAX_ACCOUNT_AGE_DAYS) return false;
  return !(await hasSeenFeatureTour(user.id));
}

export async function markFeatureTourSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), 'true');
  } catch {
    // Best-effort.
  }
}
