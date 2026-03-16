import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';

export default function PostScreen() {
    return (
        <View style={styles.container}>
            <SynthText variant="h2">Create Post</SynthText>
            <SynthText variant="body" style={{ marginTop: 10 }}>This screen is coming soon!</SynthText>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral50,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
});
