import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { checkReviewVideo, REVIEW_VIDEO_MAX_SECONDS } from '@synth/shared';
import { X } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { uploadReviewVideoFromUri } from '../../services/reviewVideoUpload';
import { ReviewVideoPlayer } from './ReviewVideoPlayer';

interface Props {
    value: string[];
    onChange: (videos: string[]) => void;
    userId: string;
    onUploadingChange?: (uploading: boolean) => void;
}

/** One uploaded video per review: pick (trimmed to 30s), upload, preview, remove. */
export function ReviewVideoField({ value, onChange, userId, onUploadingChange }: Props) {
    const [uploading, setUploadingState] = useState(false);
    const setUploading = (v: boolean) => {
        setUploadingState(v);
        onUploadingChange?.(v);
    };
    const current = value[0];

    const pick = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
            Alert.alert('Photos access needed', 'Allow access to your photos to add a video.');
            return;
        }
        const r = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['videos'],
            // iOS shows its trimmer capped at this length; Medium export keeps files small.
            allowsEditing: true,
            videoMaxDuration: REVIEW_VIDEO_MAX_SECONDS,
            videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
        });
        if (r.canceled || !r.assets?.[0]) return;
        const a = r.assets[0];
        const problem = checkReviewVideo({
            durationSec: a.duration != null ? a.duration / 1000 : null,
            sizeBytes: a.fileSize ?? null,
        });
        if (problem) {
            Alert.alert('Video too long', problem);
            return;
        }
        await upload(a.uri, a.mimeType);
    };

    const upload = async (uri: string, mimeType?: string | null) => {
        setUploading(true);
        const url = await uploadReviewVideoFromUri(userId, uri, mimeType);
        setUploading(false);
        if (url) {
            onChange([url]);
            return;
        }
        Alert.alert("Video didn't upload", 'Check your connection. Your review is safe either way.', [
            { text: 'Skip video', style: 'cancel' },
            { text: 'Try again', onPress: () => void upload(uri, mimeType) },
        ]);
    };

    return (
        <View style={styles.wrap}>
            {current ? (
                <View>
                    <ReviewVideoPlayer uri={current} height={200} />
                    <Pressable
                        style={styles.remove}
                        onPress={() => onChange([])}
                        hitSlop={8}
                        accessibilityLabel="Remove video"
                    >
                        <X size={16} color="#FFFDFA" />
                    </Pressable>
                </View>
            ) : (
                <Pressable style={styles.btn} onPress={() => void pick()} disabled={uploading}>
                    {uploading ? (
                        <View style={styles.row}>
                            <ActivityIndicator color={SynthTokens.colors.brandPink500} />
                            <SynthText variant="body" style={styles.btnText}>Uploading video…</SynthText>
                        </View>
                    ) : (
                        <SynthText variant="body" style={styles.btnText}>Add video (0/1)</SynthText>
                    )}
                </Pressable>
            )}
            <SynthText variant="meta" color="secondary">
                Optional · up to {REVIEW_VIDEO_MAX_SECONDS} seconds
            </SynthText>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 6, marginTop: 12 },
    btn: {
        borderWidth: 1.5,
        borderColor: SynthTokens.colors.brandPink500,
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    btnText: { color: SynthTokens.colors.brandPink500, fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    remove: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(26,26,26,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
