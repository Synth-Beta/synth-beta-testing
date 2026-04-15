import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthTokens } from '../tokens/SynthTokens';
import { SkeletonBox, SkeletonLine } from './skeletons/SkeletonPrimitives';

const BG = SynthTokens.colors.neutral50;
const CARD_BG = SynthTokens.colors.neutral0;
const BORDER = SynthTokens.colors.neutral200;
const PAD = SynthTokens.spacing.md;

/** A single fake event-card skeleton */
function FeedCardSkeleton() {
    return (
        <View style={styles.card}>
            {/* Image area */}
            <SkeletonBox width="100%" height={170} borderRadius={0} />
            <View style={styles.cardBody}>
                {/* Title */}
                <SkeletonLine width="80%" height={18} />
                {/* Artist */}
                <View style={styles.metaRow}>
                    <SkeletonBox width={16} height={16} borderRadius={4} />
                    <SkeletonLine width="50%" height={13} />
                </View>
                {/* Venue */}
                <View style={styles.metaRow}>
                    <SkeletonBox width={16} height={16} borderRadius={4} />
                    <SkeletonLine width="60%" height={13} />
                </View>
                {/* Date */}
                <View style={styles.metaRow}>
                    <SkeletonBox width={16} height={16} borderRadius={4} />
                    <SkeletonLine width="40%" height={13} />
                </View>
            </View>
            {/* Action row */}
            <View style={styles.actionRow}>
                <SkeletonBox width="70%" height={44} borderRadius={12} />
                <SkeletonBox width={44} height={44} borderRadius={12} />
                <SkeletonBox width={44} height={44} borderRadius={12} />
            </View>
        </View>
    );
}

/** Top header bar that mirrors the feed header */
function HeaderSkeleton({ topInset }: { topInset: number }) {
    return (
        <View style={[styles.header, { paddingTop: topInset + 10 }]}>
            <SkeletonBox width={90} height={28} borderRadius={8} />
            <View style={styles.headerRight}>
                <SkeletonBox width={36} height={36} borderRadius={18} />
                <SkeletonBox width={36} height={36} borderRadius={18} />
            </View>
        </View>
    );
}

/** Feed mode toggle (Events / Reviews) */
function ToggleSkeleton() {
    return (
        <View style={styles.toggle}>
            <SkeletonBox width={100} height={34} borderRadius={20} />
            <SkeletonBox width={100} height={34} borderRadius={20} />
        </View>
    );
}

/** Bottom tab bar */
function TabBarSkeleton({ bottomInset }: { bottomInset: number }) {
    return (
        <View style={[styles.tabBar, { paddingBottom: bottomInset + 8 }]}>
            {[0, 1, 2, 3].map(i => (
                <View key={i} style={styles.tabItem}>
                    <SkeletonBox width={24} height={24} borderRadius={6} />
                    <SkeletonLine width={36} height={10} style={{ marginTop: 4 }} />
                </View>
            ))}
        </View>
    );
}

export function AppLoadingSkeleton() {
    const insets = useSafeAreaInsets();

    return (
        <View style={styles.root}>
            <StatusBar barStyle="dark-content" backgroundColor={BG} />
            <HeaderSkeleton topInset={insets.top} />
            <ToggleSkeleton />
            <View style={styles.feed}>
                <FeedCardSkeleton />
                <FeedCardSkeleton />
            </View>
            <TabBarSkeleton bottomInset={insets.bottom} />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: BG,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: PAD,
        paddingBottom: 10,
        backgroundColor: CARD_BG,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: BORDER,
    },
    headerRight: {
        flexDirection: 'row',
        gap: 10,
    },
    toggle: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: PAD,
        paddingVertical: 10,
        backgroundColor: CARD_BG,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: BORDER,
    },
    feed: {
        flex: 1,
        paddingHorizontal: PAD,
        paddingTop: PAD,
        gap: 16,
        overflow: 'hidden',
    },
    card: {
        backgroundColor: CARD_BG,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        overflow: 'hidden',
    },
    cardBody: {
        padding: 14,
        gap: 8,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: BORDER,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: CARD_BG,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: BORDER,
        paddingTop: 10,
        paddingHorizontal: PAD,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
    },
});
