import AsyncStorage from '@react-native-async-storage/async-storage';

export const STREAMING_AUTO_SYNC_THROTTLE_MS = 24 * 60 * 60 * 1000;

function autoSyncThrottleKey(userId: string): string {
  return `streaming_auto_sync_at_${userId}`;
}

export async function wasRecentlyAutoSynced(userId: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(autoSyncThrottleKey(userId));
  if (!raw) return false;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed < STREAMING_AUTO_SYNC_THROTTLE_MS;
}

export async function markAutoSynced(userId: string): Promise<void> {
  await AsyncStorage.setItem(autoSyncThrottleKey(userId), String(Date.now()));
}

export async function clearAutoSyncThrottle(userId: string): Promise<void> {
  await AsyncStorage.removeItem(autoSyncThrottleKey(userId));
}
