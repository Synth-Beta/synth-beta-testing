import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PENDING_SHARE_STORAGE_KEY,
  type PendingShareLink,
} from '@synth/shared';

const STORAGE_READ_TIMEOUT_MS = 1500;

async function getItemWithTimeout(key: string): Promise<string | null> {
  try {
    return await Promise.race<string | null>([
      AsyncStorage.getItem(key),
      new Promise<string | null>((resolve) =>
        setTimeout(() => resolve(null), STORAGE_READ_TIMEOUT_MS)
      ),
    ]);
  } catch {
    return null;
  }
}

export async function storePendingShareLink(link: PendingShareLink): Promise<void> {
  await AsyncStorage.setItem(PENDING_SHARE_STORAGE_KEY, JSON.stringify(link));
}

export async function loadPendingShareLink(): Promise<PendingShareLink | null> {
  const raw = await getItemWithTimeout(PENDING_SHARE_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingShareLink;
  } catch {
    return null;
  }
}

export async function clearPendingShareLink(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_SHARE_STORAGE_KEY);
}

export async function hasPendingShareLink(): Promise<boolean> {
  const link = await loadPendingShareLink();
  return link != null;
}
