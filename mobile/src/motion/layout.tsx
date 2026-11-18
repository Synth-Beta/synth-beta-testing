/**
 * Layout motion: directional slides (#4) and smooth height: auto (#5).
 *
 * SmoothHeight — wrap a section whose content appears/disappears or changes size.
 *   Instead of jumping, the box animates to its new natural height. Uses a Reanimated
 *   layout transition, so there is no manual measuring and no fixed heights.
 *
 * DirectionalSlide + useSlideDirection — when switching tabs, content enters from the
 *   side of the tab you moved toward (right for a later tab, left for an earlier one),
 *   so the motion matches where the tab sits in the bar.
 *
 * Layout animations follow the OS "Reduce Motion" setting automatically.
 */
import React, { useEffect, useRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeInRight, FadeOut, LinearTransition } from 'react-native-reanimated';

export const LAYOUT_MS = 220;
const smoothLayout = LinearTransition.duration(LAYOUT_MS);

export function SmoothHeight({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
    return (
        <Animated.View layout={smoothLayout} style={[{ overflow: 'hidden' }, style]}>
            {children}
        </Animated.View>
    );
}

/**
 * +1 when moving to a higher index, -1 when moving to a lower one.
 * Pass the index of the active tab (or -1 / null when nothing is open).
 */
export function useSlideDirection(index: number | null): 1 | -1 {
    const prev = useRef<number | null>(index);
    const last = prev.current;
    const dir: 1 | -1 = last == null || index == null || index >= last ? 1 : -1;
    useEffect(() => {
        prev.current = index;
    }, [index]);
    return dir;
}

export function DirectionalSlide({
    direction,
    fromClosed = false,
    style,
    children,
}: {
    direction: 1 | -1;
    /** Opening from nothing selected: just fade, don't slide sideways. */
    fromClosed?: boolean;
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
}) {
    const entering = fromClosed
        ? FadeIn.duration(LAYOUT_MS)
        : (direction > 0 ? FadeInRight : FadeInLeft).duration(LAYOUT_MS);
    return (
        <Animated.View entering={entering} exiting={FadeOut.duration(120)} style={style}>
            {children}
        </Animated.View>
    );
}
