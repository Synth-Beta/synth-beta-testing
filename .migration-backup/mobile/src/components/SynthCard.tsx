import React from 'react';
import { StyleSheet, View, Pressable, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SynthTokens } from '../tokens/SynthTokens';
import { SynthText } from './SynthText';

export interface SynthCardProps {
    image: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SynthCard({ image, title, subtitle, onPress, style }: SynthCardProps) {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => {
        scale.value = withSpring(0.97, { damping: 14, stiffness: 200 });
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, { damping: 14, stiffness: 200 });
    };

    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
    };

    return (
        <AnimatedPressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
            style={[styles.container, animatedStyle, style]}
        >
            <Image
                source={{ uri: image }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={300}
            />
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                style={styles.gradient}
                start={{ x: 0, y: 0.3 }}
                end={{ x: 0, y: 1 }}
            />
            <View style={styles.textContainer}>
                <SynthText variant="accent" color="white" numberOfLines={1}>
                    {title}
                </SynthText>
                {subtitle && (
                    <SynthText variant="meta" color="white" style={styles.subtitle} numberOfLines={1}>
                        {subtitle}
                    </SynthText>
                )}
            </View>
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        aspectRatio: 16 / 9,
        borderRadius: SynthTokens.radius.large,
        overflow: 'hidden',
        backgroundColor: SynthTokens.colors.neutral100,
    },
    gradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '70%',
    },
    textContainer: {
        position: 'absolute',
        left: SynthTokens.spacing.md,
        right: SynthTokens.spacing.md,
        bottom: SynthTokens.spacing.md,
    },
    subtitle: {
        opacity: 0.8,
        marginTop: 2,
    },
});
