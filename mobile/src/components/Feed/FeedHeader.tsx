import React, { useState } from 'react';
import {
    StyleSheet,
    View,
    Pressable,
    TouchableOpacity,
    Modal,
    TouchableWithoutFeedback,
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

            <JamBaseAttributionInline />

            <View style={styles.rightSlot}>
                <Pressable onPress={onMenuPress} style={styles.iconButton}>
                    <Menu size={24} color={SynthTokens.colors.neutral900} />
                    {notificationsCount > 0 && (
                        <View style={styles.badge}>
                            <SynthText variant="meta" color="white" style={styles.badgeText}>
                                {notificationsCount > 9 ? '9+' : notificationsCount}
                            </SynthText>
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
        gap: 4,
    },
    leftSlot: {
        flexBasis: '28%',
        maxWidth: 140,
        flexShrink: 0,
    },
    rightSlot: {
        flexBasis: '28%',
        maxWidth: 140,
        flexShrink: 0,
        alignItems: 'flex-end',
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
        padding: SynthTokens.spacing.xs,
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: SynthTokens.colors.brandPink500,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 2,
        borderWidth: 1.5,
        borderColor: SynthTokens.colors.neutral50,
    },
    badgeText: {
        fontSize: 8,
        fontWeight: 'bold',
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
