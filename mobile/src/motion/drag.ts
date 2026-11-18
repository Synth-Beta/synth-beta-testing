/**
 * Velocity springs (#9) and rubber banding (#10) for draggable surfaces.
 *
 * rubberBand(over): how far an element moves when dragged `over` px past where it is
 *   allowed to go. Starts near 1:1, then resists harder the further you pull and never
 *   exceeds `max`. Same curve as iOS scroll overscroll: 64 * over / (over + 150).
 *
 * useDragToDismiss: vertical drag for a bottom card or sheet.
 *   - drag down: follows the finger 1:1
 *   - drag up (not allowed): rubber-bands
 *   - release: closes if dragged far enough OR flicked fast enough, and the close
 *     animation starts at the finger's release speed instead of from rest (velocity
 *     spring). Otherwise it springs back, also starting at the release speed.
 *
 * Built on React Native's PanResponder + Animated (native driver), so it needs no
 * extra native module and works inside existing RN Animated transforms.
 * Taps on buttons inside the card still work: the drag only starts after the finger
 * moves vertically more than a few px.
 */
import { useMemo, useRef } from 'react';
import { Animated, PanResponder, PanResponderInstance } from 'react-native';

export function rubberBand(over: number, max = 64, k = 150): number {
    if (over <= 0) return 0;
    return (max * over) / (over + k);
}

type Options = {
    onDismiss: () => void;
    /** px of downward drag that dismisses on release. */
    distance?: number;
    /** px/ms downward release speed that dismisses even on a short drag. */
    velocity?: number;
    /** How far the card travels when it closes. */
    exitTo?: number;
};

export function useDragToDismiss({ onDismiss, distance = 70, velocity = 0.6, exitTo = 260 }: Options): {
    translateY: Animated.Value;
    panHandlers: PanResponderInstance['panHandlers'];
} {
    const translateY = useRef(new Animated.Value(0)).current;
    const onDismissRef = useRef(onDismiss);
    onDismissRef.current = onDismiss;

    const responder = useMemo(
        () =>
            PanResponder.create({
                onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
                onPanResponderGrant: () => translateY.stopAnimation(),
                onPanResponderMove: (_e, g) => {
                    translateY.setValue(g.dy >= 0 ? g.dy : -rubberBand(-g.dy));
                },
                onPanResponderRelease: (_e, g) => {
                    if (g.dy > distance || g.vy > velocity) {
                        Animated.spring(translateY, {
                            toValue: exitTo,
                            velocity: g.vy,
                            stiffness: 260,
                            damping: 30,
                            overshootClamping: true,
                            useNativeDriver: true,
                        }).start(() => {
                            onDismissRef.current();
                            translateY.setValue(0);
                        });
                        return;
                    }
                    Animated.spring(translateY, {
                        toValue: 0,
                        velocity: g.vy,
                        stiffness: 380,
                        damping: 26,
                        useNativeDriver: true,
                    }).start();
                },
                onPanResponderTerminate: () => {
                    Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
                },
            }),
        [translateY, distance, velocity, exitTo],
    );

    return { translateY, panHandlers: responder.panHandlers };
}
