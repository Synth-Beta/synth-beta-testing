/**
 * Shake on error (#3).
 *
 *   const { shake, shakeStyle } = useShake();
 *   <Animated.View style={shakeStyle}>…inputs…</Animated.View>
 *   // on failure: shake();
 *
 * A short, decaying horizontal wiggle (translateX only, #6) plus an error haptic,
 * the same "no" gesture as the iOS lock screen. With Reduce Motion on, only the
 * haptic fires.
 */
import { useCallback } from 'react';
import { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const STEPS = [-10, 9, -7, 5, -3, 0];
const STEP_MS = 45;

export function useShake() {
    const reduceMotion = useReducedMotion();
    const x = useSharedValue(0);

    const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

    const shake = useCallback(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
        if (reduceMotion) return;
        x.value = withSequence(...STEPS.map((to) => withTiming(to, { duration: STEP_MS })));
    }, [reduceMotion, x]);

    return { shake, shakeStyle };
}
