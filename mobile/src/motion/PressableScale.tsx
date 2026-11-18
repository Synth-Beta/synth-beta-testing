/**
 * Press feedback (#1 "scale from 0.97", #2 "press feedback").
 *
 * Drop-in replacement for <Pressable>: shrinks to 0.97 while the finger is down and
 * springs back on release, with an optional haptic tick on press. Scaling from 0.97
 * (not 0.9) reads as "pressed" without the element looking like it collapses.
 *
 * Only scale/transform is animated (#6 "transform, not left"), so it runs on the UI
 * thread and never triggers layout. Respects the OS "Reduce Motion" setting.
 *
 * Note: `style` must be a style object/array, not a ({ pressed }) => style function.
 * Any `transform` in `style` is replaced by the press scale.
 */
import React, { useCallback } from 'react';
import { GestureResponderEvent, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const PRESS_SCALE = 0.97;
/** Snappy down, slightly soft release. */
export const PRESS_SPRING = { damping: 18, stiffness: 420, mass: 0.6 } as const;

export type PressHaptic = 'light' | 'medium' | 'selection' | false;

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
    style?: StyleProp<ViewStyle>;
    /** Scale while pressed. Default 0.97. */
    scaleTo?: number;
    /** Haptic on press. Default 'light'. */
    haptic?: PressHaptic;
};

export function firePressHaptic(kind: PressHaptic) {
    if (!kind) return;
    const p =
        kind === 'selection'
            ? Haptics.selectionAsync()
            : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    p.catch(() => undefined);
}

export function PressableScale({
    style,
    scaleTo = PRESS_SCALE,
    haptic = 'light',
    disabled,
    onPressIn,
    onPressOut,
    onPress,
    ...rest
}: PressableScaleProps) {
    const reduceMotion = useReducedMotion();
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    const handlePressIn = useCallback(
        (e: GestureResponderEvent) => {
            if (!disabled && !reduceMotion) scale.value = withSpring(scaleTo, PRESS_SPRING);
            onPressIn?.(e);
        },
        [disabled, reduceMotion, scale, scaleTo, onPressIn],
    );

    const handlePressOut = useCallback(
        (e: GestureResponderEvent) => {
            scale.value = withSpring(1, PRESS_SPRING);
            onPressOut?.(e);
        },
        [scale, onPressOut],
    );

    const handlePress = useCallback(
        (e: GestureResponderEvent) => {
            if (disabled) return;
            firePressHaptic(haptic);
            onPress?.(e);
        },
        [disabled, haptic, onPress],
    );

    return (
        <AnimatedPressable
            {...rest}
            disabled={disabled}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={onPress ? handlePress : undefined}
            style={[style, animatedStyle]}
        />
    );
}
