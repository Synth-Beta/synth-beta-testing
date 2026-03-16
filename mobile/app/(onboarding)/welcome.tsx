import React, { useEffect } from 'react';
import { StyleSheet, View, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { SynthText } from '../../src/components/SynthText';
import { SynthButton } from '../../src/components/SynthButton';
import { SynthTokens } from '../../src/tokens/SynthTokens';

export default function WelcomeScreen() {
    const router = useRouter();
    const logoScale = useSharedValue(0.8);
    const logoOpacity = useSharedValue(0);
    const contentOpacity = useSharedValue(0);

    useEffect(() => {
        logoScale.value = withDelay(300, withSpring(1, { damping: 12 }));
        logoOpacity.value = withDelay(300, withTiming(1, { duration: 800 }));
        contentOpacity.value = withDelay(800, withTiming(1, { duration: 600 }));
    }, []);

    const logoAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: logoScale.value }],
        opacity: logoOpacity.value,
    }));

    const contentAnimatedStyle = useAnimatedStyle(() => ({
        opacity: contentOpacity.value,
    }));

    const handleStart = () => {
        router.push('/(onboarding)/scene');
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={[SynthTokens.colors.brandPink500, SynthTokens.colors.purpleAccent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            <View style={styles.centerContent}>
                <Animated.View style={[styles.logoContainer, logoAnimatedStyle]}>
                    <Image
                        source={require('../../assets/images/icon.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                </Animated.View>

                <Animated.View style={[styles.textContainer, contentAnimatedStyle]}>
                    <SynthText variant="h1" color="white" style={styles.title}>
                        Synth
                    </SynthText>
                    <SynthText variant="h2" color="white" style={styles.tagline}>
                        Live Music, Together
                    </SynthText>
                </Animated.View>
            </View>

            <Animated.View style={[styles.footer, contentAnimatedStyle]}>
                <SynthButton
                    title="Get Started"
                    variant="primary"
                    onPress={handleStart}
                    style={styles.button}
                />
                <SynthButton
                    title="I already have an account"
                    variant="ghost"
                    onPress={() => { }}
                    style={styles.secondaryButton}
                />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: SynthTokens.spacing.xl,
    },
    centerContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoContainer: {
        width: 120,
        height: 120,
        borderRadius: 30,
        backgroundColor: 'rgba(255,255,255,0.2)',
        padding: 20,
        marginBottom: 24,
    },
    logo: {
        width: '100%',
        height: '100%',
    },
    textContainer: {
        alignItems: 'center',
    },
    title: {
        fontSize: 48,
        lineHeight: 52,
        marginBottom: 8,
    },
    tagline: {
        textAlign: 'center',
        opacity: 0.9,
    },
    footer: {
        gap: SynthTokens.spacing.md,
        paddingBottom: SynthTokens.spacing.xl,
    },
    button: {
        width: '100%',
        backgroundColor: 'white',
    },
    secondaryButton: {
        width: '100%',
    },
});
