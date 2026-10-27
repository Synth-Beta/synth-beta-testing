import React from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';
import { SynthTokens } from '../../tokens/SynthTokens';
import { Menu } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JamBaseAttributionInline } from './JamBaseAttributionInline';

interface FeedHeaderProps {
    notificationsCount?: number;
    onMenuPress?: () => void;
}

/** Home header: synth wordmark, JamBase attribution, menu. Events and reviews share one thread (no toggle), like web. */
export const FeedHeader: React.FC<FeedHeaderProps> = ({
    notificationsCount = 0,
    onMenuPress,
}) => {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingTop: insets.top + SynthTokens.spacing.sm }]}>
            <View style={styles.leftSlot}>
                <Text style={styles.wordmark} accessibilityRole="header">
                    synth<Text style={styles.wordmarkDot}>.</Text>
                </Text>
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
    wordmark: {
        paddingLeft: 6,
        fontSize: 24,
        fontWeight: '800',
        letterSpacing: -0.8,
        color: SynthTokens.colors.neutral900,
    },
    wordmarkDot: {
        color: SynthTokens.colors.brandPink500,
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
});
