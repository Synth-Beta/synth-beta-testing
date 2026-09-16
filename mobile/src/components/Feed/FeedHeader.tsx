import React, { useState } from 'react';
import {
    StyleSheet,
    View,
    Pressable,
    TouchableOpacity,
    Modal,
    TouchableWithoutFeedback,
    Text,
} from 'react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { ChevronDown, Menu } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JamBaseAttributionInline } from './JamBaseAttributionInline';

export type FeedDisplayMode = 'events' | 'reviews';

interface FeedHeaderProps {
    notificationsCount?: number;
    onMenuPress?: () => void;
    feedDisplayMode?: FeedDisplayMode;
    onFeedDisplayModeChange?: (mode: FeedDisplayMode) => void;
}

export const FeedHeader: React.FC<FeedHeaderProps> = ({
    notificationsCount = 0,
    onMenuPress,
    feedDisplayMode = 'events',
    onFeedDisplayModeChange,
}) => {
    const insets = useSafeAreaInsets();
    const [menuOpen, setMenuOpen] = useState(false);

    const label = feedDisplayMode === 'events' ? 'Events' : 'Reviews';

    const selectMode = (mode: FeedDisplayMode) => {
        onFeedDisplayModeChange?.(mode);
        setMenuOpen(false);
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top + SynthTokens.spacing.sm }]}>
            <Modal visible={menuOpen} transparent animationType="fade">
                <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
                    <View style={styles.modalBackdrop} />
                </TouchableWithoutFeedback>
                <View style={[styles.modalSheet, { top: insets.top + 56 }]}>
                    <Pressable
                        style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                        onPress={() => selectMode('events')}
                    >
                        <SynthText variant="meta" style={styles.menuRowText}>
                            Events
                        </SynthText>
                    </Pressable>
                    <Pressable
                        style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                        onPress={() => selectMode('reviews')}
                    >
                        <SynthText variant="meta" style={styles.menuRowText}>
                            Reviews
                        </SynthText>
                    </Pressable>
                </View>
            </Modal>

            <View style={styles.leftSlot}>
                <TouchableOpacity
                    style={styles.dropdownPill}
                    onPress={() => onFeedDisplayModeChange && setMenuOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`Feed type ${label}`}
                >
                    <SynthText variant="meta" style={styles.dropdownText}>
                        {label}
                    </SynthText>
                    <ChevronDown size={14} color={SynthTokens.colors.neutral900} />
                </TouchableOpacity>
            </View>

            <View style={styles.centerSlot}>
                <JamBaseAttributionInline />
            </View>

            <View style={styles.rightSlot}>
                <Pressable
                    onPress={onMenuPress}
                    style={styles.iconButton}
                    accessibilityRole="button"
                    accessibilityLabel={
                        notificationsCount > 0
                            ? `Open menu, ${notificationsCount} notifications`
                            : 'Open menu'
                    }
                >
                    <Menu size={24} color={SynthTokens.colors.neutral900} />
                    {notificationsCount > 0 && (
                        <View style={styles.badge} pointerEvents="none">
                            <Text style={styles.badgeText} allowFontScaling={false}>
                                {notificationsCount > 9 ? '9+' : notificationsCount}
                            </Text>
                        </View>
                    )}
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SynthTokens.spacing.sm,
        paddingBottom: SynthTokens.spacing.sm,
        backgroundColor: SynthTokens.colors.neutral50,
        gap: 2,
        minHeight: 44,
    },
    leftSlot: {
        flexBasis: '26%',
        maxWidth: 132,
        flexShrink: 0,
        zIndex: 2,
    },
    rightSlot: {
        flexBasis: '26%',
        maxWidth: 132,
        flexShrink: 0,
        minWidth: 48,
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 2,
        overflow: 'visible',
    },
    centerSlot: {
        flex: 1,
        minWidth: 0,
        zIndex: 1,
    },
    dropdownPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: SynthTokens.colors.neutral100,
        paddingHorizontal: SynthTokens.spacing.md,
        paddingVertical: SynthTokens.spacing.xs,
        borderRadius: SynthTokens.radius.full,
        gap: 4,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    dropdownText: {
        fontWeight: 'bold',
    },
    iconButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'visible',
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: SynthTokens.colors.brandPink500,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral50,
    },
    badgeText: {
        color: SynthTokens.colors.neutral0,
        fontSize: 11,
        fontWeight: '700',
        lineHeight: 12,
        textAlign: 'center',
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    modalSheet: {
        position: 'absolute',
        left: SynthTokens.spacing.sm,
        minWidth: 200,
        backgroundColor: SynthTokens.colors.neutral50,
        borderRadius: SynthTokens.radius.medium,
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral200,
        paddingVertical: 4,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 6,
    },
    menuRow: {
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    menuRowPressed: {
        backgroundColor: 'rgba(204, 36, 134, 0.12)',
    },
    menuRowText: {
        fontWeight: '600',
        color: SynthTokens.colors.neutral900,
    },
});
