import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SynthTokens } from '../tokens/SynthTokens';

export interface OnboardingProgressProps {
    totalSteps: number;
    currentStep: number; // 1-indexed
}

export function OnboardingProgress({ totalSteps, currentStep }: OnboardingProgressProps) {
    return (
        <View style={styles.container}>
            {Array.from({ length: totalSteps }).map((_, i) => {
                const isActive = i + 1 === currentStep;
                return (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            isActive ? styles.activeDot : styles.inactiveDot
                        ]}
                    />
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    activeDot: {
        backgroundColor: SynthTokens.colors.brandPink500,
        width: 24, // Wider active dot
    },
    inactiveDot: {
        backgroundColor: SynthTokens.colors.neutral200,
    },
});
