import React from 'react';
import { StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

/** Plays a review video in the app (native controls, paused until tapped). */
export function ReviewVideoPlayer({ uri, height = 220 }: { uri: string; height?: number }) {
    const player = useVideoPlayer(uri);
    return (
        <VideoView
            player={player}
            style={[styles.video, { height }]}
            nativeControls
            contentFit="contain"
            fullscreenOptions={{ enable: true }}
        />
    );
}

const styles = StyleSheet.create({
    video: { width: '100%', borderRadius: 12, backgroundColor: '#1A1A1A' },
});
