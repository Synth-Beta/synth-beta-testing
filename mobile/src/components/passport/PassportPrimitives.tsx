import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';

const PINK = SynthTokens.colors.brandPink500;

/** Pulsing placeholder block, used while a passport section loads. */
export function SkeletonBlock({ height, width = '100%', radius = 12, style }: {
    height: number;
    width?: number | `${number}%`;
    radius?: number;
    style?: ViewStyle;
}) {
    const pulse = useRef(new Animated.Value(0.45)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [pulse]);

    return (
        <Animated.View
            style={[
                { height, width, borderRadius: radius, backgroundColor: SynthTokens.colors.neutral100, opacity: pulse },
                style,
            ]}
        />
    );
}

/** Standard skeleton for a card-based tab: header line + a few cards. */
export function TabSkeleton({ cards = 3 }: { cards?: number }) {
    return (
        <View>
            <SkeletonBlock height={22} width="45%" radius={8} style={{ marginBottom: 14 }} />
            {Array.from({ length: cards }).map((_, i) => (
                <SkeletonBlock key={i} height={86} style={{ marginBottom: 10 }} />
            ))}
        </View>
    );
}

/** Error state with retry, shown when a section fails to load. */
export function SectionError({ message, onRetry }: { message?: string; onRetry: () => void }) {
    return (
        <View style={styles.errorBox}>
            <SynthText variant="body" style={styles.errorTitle}>
                Couldn't load this section
            </SynthText>
            {message ? (
                <SynthText variant="meta" color="secondary" style={styles.errorMsg}>
                    {message}
                </SynthText>
            ) : null}
            <Pressable style={styles.retryBtn} onPress={onRetry} accessibilityRole="button">
                <SynthText variant="meta" style={styles.retryTxt}>
                    Try again
                </SynthText>
            </Pressable>
        </View>
    );
}

/** Friendly empty state used across passport tabs. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
    return (
        <View style={styles.emptyBox}>
            <SynthText variant="body" style={styles.emptyTitle}>
                {title}
            </SynthText>
            {hint ? (
                <SynthText variant="meta" color="secondary" style={styles.emptyHint}>
                    {hint}
                </SynthText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    errorBox: {
        padding: 20,
        borderRadius: 14,
        backgroundColor: SynthTokens.colors.neutral50,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        alignItems: 'center',
    },
    errorTitle: { fontWeight: '700', marginBottom: 4 },
    errorMsg: { textAlign: 'center', marginBottom: 12 },
    retryBtn: {
        marginTop: 8,
        paddingHorizontal: 18,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: PINK,
    },
    retryTxt: { color: '#fff', fontWeight: '700' },
    emptyBox: {
        padding: 20,
        borderRadius: 14,
        backgroundColor: SynthTokens.colors.neutral50,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    emptyTitle: { fontWeight: '700', marginBottom: 4 },
    emptyHint: { lineHeight: 20 },
});
