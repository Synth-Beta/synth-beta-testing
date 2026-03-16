import React from 'react';
import { StyleSheet, View, Pressable, TouchableOpacity } from 'react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { ChevronDown, Menu } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface FeedHeaderProps {
    notificationsCount?: number;
    onMenuPress?: () => void;
}

export const FeedHeader: React.FC<FeedHeaderProps> = ({
    notificationsCount = 0,
    onMenuPress
}) => {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingTop: insets.top + SynthTokens.spacing.sm }]}>
            <TouchableOpacity style={styles.dropdownPill}>
                <SynthText variant="meta" style={styles.dropdownText}>Events</SynthText>
                <ChevronDown size={14} color={SynthTokens.colors.neutral900} />
            </TouchableOpacity>

            <View style={styles.rightActions}>
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
        justifyContent: 'space-between',
        paddingHorizontal: SynthTokens.spacing.md,
        paddingBottom: SynthTokens.spacing.sm,
        backgroundColor: SynthTokens.colors.neutral50,
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
    rightActions: {
        flexDirection: 'row',
        alignItems: 'center',
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
    }
});
