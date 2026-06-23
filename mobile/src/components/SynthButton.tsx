import React from 'react';
import { Pressable, StyleSheet, ViewStyle, PressableProps, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SynthTokens } from '../tokens/SynthTokens';
import { SynthText, SynthTextColor } from './SynthText';

export interface SynthButtonProps extends Omit<PressableProps, 'style'> {
    title: string;
    onPress?: () => void;
    style?: ViewStyle;
    variant?: 'primary' | 'secondary' | 'ghost';
    disabled?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SynthButton({
    title,
    onPress,
    style,
    variant = 'primary',
    disabled = false,
    ...rest
}: SynthButtonProps) {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => {
        scale.value = withSpring(0.96, { damping: 14, stiffness: 200 });
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, { damping: 14, stiffness: 200 });
    };

    const handlePress = () => {
        if (disabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress?.();
    };

    const getContainerStyle = () => {
        switch (variant) {
            case 'primary':
                return styles.primaryContainer;
            case 'secondary':
                return styles.secondaryContainer;
            case 'ghost':
                return styles.ghostContainer;
            default:
                return styles.primaryContainer;
        }
    };

    const getTextColor = (): SynthTextColor => {
        if (disabled) return 'disabled';
        switch (variant) {
            case 'primary':
                return 'white';
            case 'secondary':
                return 'primary';
            case 'ghost':
                return 'brand';
            default:
                return 'white';
        }
    };

    const ButtonContent = (
        <View style={styles.contentWrapper}>
            <SynthText variant="meta" color={getTextColor()} style={styles.text}>
                {title}
            </SynthText>
        </View>
    );

    return (
        <AnimatedPressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
            disabled={disabled}
            style={[
                styles.base,
                getContainerStyle(),
                disabled && styles.disabledContainer,
                animatedStyle,
                style,
            ]}
            {...rest}
        >
            {variant === 'primary' && !disabled ? (
                <LinearGradient
                    colors={[SynthTokens.colors.brandPink500, SynthTokens.colors.purpleAccent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: SynthTokens.radius.full }]}
                />
            ) : null}
            {ButtonContent}
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    base: {
        minHeight: SynthTokens.sizing.buttonHeight,
        paddingVertical: SynthTokens.spacing.sm,
        borderRadius: SynthTokens.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    contentWrapper: {
        paddingHorizontal: SynthTokens.spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    text: {
        fontWeight: '700',
    },
    primaryContainer: {
        backgroundColor: SynthTokens.colors.brandPink500,
    },
    secondaryContainer: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral200,
    },
    ghostContainer: {
        backgroundColor: 'transparent',
    },
    disabledContainer: {
        backgroundColor: SynthTokens.colors.neutral200,
        opacity: 0.6,
    },
});
