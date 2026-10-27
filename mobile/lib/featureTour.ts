import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../src/integrations/supabase/client';
import { notifyFeatureTourClosed } from './pushPrimer';
import { endTour } from './tourProgress';

// Per-user so a shared device still shows the tour to each new account.
const key = (userId: string) => `FEATURE_TOUR_DONE:${userId}`;

/** Accounts older than this never get the tutorial auto-started (it's still in Settings). */
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

/** Ends the tutorial, marks it seen and lets the push primer run. Used by TourOverlay. */
export async function finishTour(): Promise<void> {
  endTour();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await markFeatureTourSeen(session.user.id);
    notifyFeatureTourClosed();
  }
}
