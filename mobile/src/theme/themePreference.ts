/**
 * Dark mode preference. With no saved choice the app follows the phone's appearance;
 * the switch in the app menu saves an explicit 'light' or 'dark'. Colors themselves live in
 * SynthTokens (DynamicColorIOS), so changing Appearance re-colors every screen in place.
 */
import { Appearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SynthTokens } from '../tokens/SynthTokens';

const STORAGE_KEY = 'synth.colorScheme';

type Saved = 'light' | 'dark';

/** Apply the saved choice as early as possible (called once from the root layout). */
export async function loadThemePreference(): Promise<void> {
  try {
    const saved = (await AsyncStorage.getItem(STORAGE_KEY)) as Saved | null;
    if (saved === 'light' || saved === 'dark') Appearance.setColorScheme(saved);
  } catch {
    // Reading failed: keep following the system, which is the default anyway.
  }
}

export function useDarkMode(): { isDark: boolean; setDark: (on: boolean) => void } {
  const isDark = useColorScheme() === 'dark';
  const setDark = (on: boolean) => {
    const next: Saved = on ? 'dark' : 'light';
    Appearance.setColorScheme(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };
  return { isDark, setDark };
}

/**
 * Plain hex colors for the current theme. Only for views that bake colors in once
 * (expo-linear-gradient, BlurView tint); everything else uses SynthTokens.colors directly.
 */
export function usePalette() {
  return useColorScheme() === 'dark' ? SynthTokens.palette.dark : SynthTokens.palette.light;
}
