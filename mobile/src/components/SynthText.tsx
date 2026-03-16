import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { SynthTokens } from '../tokens/SynthTokens';

export type SynthTextVariant = 'h1' | 'h2' | 'body' | 'accent' | 'meta' | 'steps';
export type SynthTextColor = 'primary' | 'secondary' | 'disabled' | 'white' | 'brand';

export interface SynthTextProps extends TextProps {
    variant?: SynthTextVariant;
    color?: SynthTextColor;
    children: React.ReactNode;
}

export function SynthText({ variant = 'body', color = 'primary', style, children, ...rest }: SynthTextProps) {
    return (
        <Text
            style={[
                styles.base,
                styles[variant],
                colorStyles[color],
                style,
            ]}
            {...rest}
        >
            {children}
        </Text>
    );
}

const styles = StyleSheet.create({
    base: {
        fontFamily: SynthTokens.typography.fontFamily.medium,
    },
    h1: {
        fontFamily: SynthTokens.typography.fontFamily.bold,
        fontSize: SynthTokens.typography.sizes.h1,
        lineHeight: SynthTokens.typography.lineHeights.h1,
    },
    h2: {
        fontFamily: SynthTokens.typography.fontFamily.bold,
        fontSize: SynthTokens.typography.sizes.h2,
        lineHeight: SynthTokens.typography.lineHeights.h2,
    },
    body: {
        fontFamily: SynthTokens.typography.fontFamily.medium,
        fontSize: SynthTokens.typography.sizes.body,
        lineHeight: SynthTokens.typography.lineHeights.body,
    },
    accent: {
        fontFamily: SynthTokens.typography.fontFamily.bold,
        fontSize: SynthTokens.typography.sizes.accent,
        lineHeight: SynthTokens.typography.lineHeights.accent,
    },
    meta: {
        fontFamily: SynthTokens.typography.fontFamily.medium,
        fontSize: SynthTokens.typography.sizes.meta,
        lineHeight: SynthTokens.typography.lineHeights.meta,
    },
    steps: {
        fontFamily: SynthTokens.typography.fontFamily.medium,
        fontSize: SynthTokens.typography.sizes.steps,
        lineHeight: SynthTokens.typography.lineHeights.steps,
        letterSpacing: SynthTokens.typography.sizes.steps * 0.2, // 0.2em tracking
    },
});

const colorStyles = StyleSheet.create({
    primary: { color: SynthTokens.colors.neutral900 },
    secondary: { color: SynthTokens.colors.neutral600 },
    disabled: { color: SynthTokens.colors.neutral400 },
    white: { color: SynthTokens.colors.neutral0 },
    brand: { color: SynthTokens.colors.brandPink500 },
});
