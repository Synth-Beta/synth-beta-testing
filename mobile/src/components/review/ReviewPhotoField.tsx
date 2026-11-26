import React, { useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { uploadReviewPhotoFromUri } from '../../services/reviewPhotoUpload';
import { showToast } from '../Toast';

const MAX_PHOTOS = 5;

interface Props {
    value: string[];
    onChange: (photos: string[]) => void;
    userId: string;
    thumbnailIndex?: number;
    onThumbnailIndexChange?: (index: number) => void;
    onRequestCrop?: (index: number) => void;
    onUploadingChange?: (uploading: boolean) => void;
}

/** Up to 5 review photos: pick, upload, preview, remove — same button format as ReviewVideoField. */
export function ReviewPhotoField({
    value,
    onChange,
    userId,
    thumbnailIndex = 0,
    onThumbnailIndexChange,
    onRequestCrop,
    onUploadingChange,
}: Props) {
    const [uploading, setUploadingState] = useState(false);
    const setUploading = (v: boolean) => {
        setUploadingState(v);
        onUploadingChange?.(v);
    };

    const pick = async () => {
        if (value.length >= MAX_PHOTOS) return;
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
            showToast('Allow access to your photos to add images.', { title: 'Photos access needed' });
            return;
        }
        const r = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            selectionLimit: MAX_PHOTOS - value.length,
            quality: 0.85,
        });
        if (r.canceled || !r.assets?.length) return;

        setUploading(true);
        const next = [...value];
        const wasEmpty = next.length === 0;
        for (const a of r.assets) {
            if (next.length >= MAX_PHOTOS) break;
            if (!a.uri) continue;
            const url = await uploadReviewPhotoFromUri(userId, a.uri);
            if (url) next.push(url);
        }
        setUploading(false);
        onChange(next);

        if (wasEmpty && next.length > 0) {
            onThumbnailIndexChange?.(0);
            onRequestCrop?.(0);
        }
    };

    const remove = (index: number) => {
        const next = value.filter((_, i) => i !== index);
        onChange(next);
        if (thumbnailIndex >= next.length) {
            onThumbnailIndexChange?.(Math.max(0, next.length - 1));
        } else if (index < thumbnailIndex) {
            onThumbnailIndexChange?.(thumbnailIndex - 1);
        } else if (index === thumbnailIndex) {
            onThumbnailIndexChange?.(Math.min(thumbnailIndex, Math.max(0, next.length - 1)));
        }
    };

    const canAddMore = value.length < MAX_PHOTOS;

    return (
        <View style={styles.wrap}>
            {canAddMore ? (
                <Pressable style={styles.btn} onPress={() => void pick()} disabled={uploading}>
                    {uploading ? (
                        <View style={styles.row}>
                            <ActivityIndicator color={SynthTokens.colors.brandPink500} />
                            <SynthText variant="body" style={styles.btnText}>
                                Uploading photos…
                            </SynthText>
                        </View>
                    ) : (
                        <SynthText variant="body" style={styles.btnText}>
                            Add photos ({value.length}/{MAX_PHOTOS})
                        </SynthText>
                    )}
                </Pressable>
            ) : null}

            {value.length > 0 ? (
                <View style={styles.photoStrip}>
                    {value.map((url, i) => (
                        <View
                            key={`${url}-${i}`}
                            style={[styles.photoThumb, i === thumbnailIndex && styles.photoThumbSelected]}
                        >
                            <Image source={{ uri: url }} style={styles.photoThumbImg} contentFit="cover" />
                            {i === thumbnailIndex ? (
                                <View style={styles.thumbnailBadge}>
                                    <SynthText variant="meta" style={styles.thumbnailBadgeText}>
                                        Cover
                                    </SynthText>
                                </View>
                            ) : null}
                            <View style={styles.photoActions}>
                                {onRequestCrop ? (
                                    <Pressable
                                        style={styles.photoActionBtn}
                                        onPress={() => {
                                            onThumbnailIndexChange?.(i);
                                            onRequestCrop(i);
                                        }}
                                    >
                                        <SynthText variant="meta" style={styles.photoActionTxt}>
                                            Crop
                                        </SynthText>
                                    </Pressable>
                                ) : null}
                                <Pressable
                                    style={[styles.photoActionBtn, styles.photoActionRemove]}
                                    onPress={() => remove(i)}
                                    accessibilityLabel={`Remove photo ${i + 1}`}
                                >
                                    <X size={12} color="#FFFDFA" strokeWidth={2.5} />
                                </Pressable>
                            </View>
                        </View>
                    ))}
                </View>
            ) : null}

            <SynthText variant="meta" color="secondary">
                Optional · up to {MAX_PHOTOS} photos
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
    photoStrip: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    photoThumb: {
        width: 80,
        height: 80,
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral200,
    },
    photoThumbSelected: {
        borderColor: SynthTokens.colors.brandPink500,
    },
    photoThumbImg: {
        width: '100%',
        height: '100%',
    },
    thumbnailBadge: {
        position: 'absolute',
        top: 4,
        left: 4,
        backgroundColor: SynthTokens.colors.brandPink500,
        borderRadius: 6,
        paddingHorizontal: 5,
        paddingVertical: 1,
    },
    thumbnailBadgeText: {
        color: '#FFFDFA',
        fontSize: 9,
        fontWeight: '700',
    },
    photoActions: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
    },
    photoActionBtn: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center',
        paddingVertical: 3,
    },
    photoActionRemove: {
        backgroundColor: 'rgba(180,0,0,0.6)',
    },
    photoActionTxt: {
        color: '#FFFDFA',
        fontSize: 10,
        fontWeight: '600',
    },
});
