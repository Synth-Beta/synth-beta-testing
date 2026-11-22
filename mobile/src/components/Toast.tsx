/**
 * App-wide toast for one-off notices (errors, confirmations) that used to be blocking
 * Alert.alert popups. Call `showToast(message, { title })` from anywhere; <ToastHost />
 * is mounted once in app/_layout.tsx. Confirmations that need a choice stay as Alert.alert.
 *
 * shortcut: one toast at a time (a new one replaces the old), no Undo action yet; add a
 * queue/action slot when a flow needs undo-after-delete.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInUp, SlideOutUp, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthTokens } from '../tokens/SynthTokens';

type ToastData = { id: number; title?: string; message: string };
type Listener = (t: ToastData | null) => void;

let listener: Listener | null = null;
let nextId = 1;

/** Long enough to read two short lines; tap dismisses sooner. */
const VISIBLE_MS = 4000;

export function showToast(message: unknown, opts?: { title?: unknown }) {
  const msg = message == null ? '' : String(message);
  const title = opts?.title == null ? undefined : String(opts.title);
  // Alert.alert(title) with no message: show the title as the message.
  const t: ToastData = msg ? { id: nextId++, title, message: msg } : { id: nextId++, message: title ?? '' };
  if (!t.message) return;
  listener?.(t);
}

export function ToastHost() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    listener = setToast;
    return () => {
      if (listener === setToast) listener = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + 8 }]}>
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={(reduceMotion ? FadeIn : SlideInUp).duration(220)}
          exiting={(reduceMotion ? FadeOut : SlideOutUp).duration(160)}
          style={styles.wrap}
        >
          <Pressable
            onPress={() => setToast(null)}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityHint="Tap to dismiss"
            style={styles.toast}
          >
            {toast.title ? <Text style={styles.title}>{toast.title}</Text> : null}
            <Text style={styles.message}>{toast.message}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16 },
  toast: {
    backgroundColor: SynthTokens.colors.neutral900,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  title: { color: SynthTokens.colors.neutral0, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  message: { color: SynthTokens.colors.neutral200, fontSize: 14, lineHeight: 20, marginTop: 2 },
});
