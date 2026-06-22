/**
 * MobileImageCropper
 * Lets the user pan and zoom an image to define a square thumbnail crop.
 * Produces { xPct, yPct, zoom } matching the web's thumbnailCrop format.
 * Uses only React Native core (Animated, PanResponder) — no extra packages.
 */
import React, { useRef, useState, useCallback } from 'react';
import {
    Modal,
    View,
    Animated,
    PanResponder,
    Image,
    Pressable,
    StyleSheet,
    Dimensions,
    GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ZoomIn, ZoomOut, Check, X } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';

export interface CropResult {
    xPct: number;
    yPct: number;
    zoom: number;
}

interface Props {
    visible: boolean;
    imageUri: string;
    initial?: CropResult | null;
    onDone: (crop: CropResult) => void;
    onCancel: () => void;
}

const FRAME_SIZE = Dimensions.get('window').width - 48; // square crop frame
const ZOOM_STEP = 0.25;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export function MobileImageCropper({ visible, imageUri, initial, onDone, onCancel }: Props) {
    const insets = useSafeAreaInsets();

    // Pan position (pixels relative to frame center)
    const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
    const [zoom, setZoom] = useState(initial?.zoom ?? 1);
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;

    // Current pan offset tracked separately for clamping
    const panOffset = useRef({ x: 0, y: 0 });
    // Image natural size (from onLoad)
    const [imgSize, setImgSize] = useState({ w: 1, h: 1 });

    // Max pan offset = half of (rendered image size - frame size)
    const getMaxOffset = useCallback((z: number) => {
        const renderedW = FRAME_SIZE * z;
        const renderedH = FRAME_SIZE * (imgSize.h / imgSize.w) * z;
        return {
            x: Math.max(0, (renderedW - FRAME_SIZE) / 2),
            y: Math.max(0, (renderedH - FRAME_SIZE) / 2),
        };
    }, [imgSize]);

    const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                pan.stopAnimation();
            },
            onPanResponderMove: (_, g) => {
                const max = getMaxOffset(zoomRef.current);
                const nx = clamp(panOffset.current.x + g.dx, -max.x, max.x);
                const ny = clamp(panOffset.current.y + g.dy, -max.y, max.y);
                pan.setValue({ x: nx, y: ny });
            },
            onPanResponderRelease: (_, g) => {
                const max = getMaxOffset(zoomRef.current);
                const nx = clamp(panOffset.current.x + g.dx, -max.x, max.x);
                const ny = clamp(panOffset.current.y + g.dy, -max.y, max.y);
                panOffset.current = { x: nx, y: ny };
                pan.setValue({ x: nx, y: ny });
            },
        })
    ).current;

    const adjustZoom = (delta: number) => {
        setZoom((z) => {
            const next = clamp(z + delta, MIN_ZOOM, MAX_ZOOM);
            zoomRef.current = next;
            // Re-clamp pan to new bounds
            const max = getMaxOffset(next);
            const nx = clamp(panOffset.current.x, -max.x, max.x);
            const ny = clamp(panOffset.current.y, -max.y, max.y);
            panOffset.current = { x: nx, y: ny };
            pan.setValue({ x: nx, y: ny });
            return next;
        });
    };

    const handleDone = () => {
        // Convert pan offset (pixels) to percentage of rendered image
        const max = getMaxOffset(zoom);
        // xPct: 0 = left edge visible, 0.5 = center, 1 = right edge visible
        const xPct = max.x > 0 ? 0.5 - panOffset.current.x / (max.x * 2) : 0.5;
        const yPct = max.y > 0 ? 0.5 - panOffset.current.y / (max.y * 2) : 0.5;
        onDone({
            xPct: Math.round(xPct * 1000) / 1000,
            yPct: Math.round(yPct * 1000) / 1000,
            zoom: Math.round(zoom * 100) / 100,
        });
    };

    // Reset when opening
    React.useEffect(() => {
        if (visible) {
            const initZoom = initial?.zoom ?? 1;
            setZoom(initZoom);
            zoomRef.current = initZoom;
            panOffset.current = { x: 0, y: 0 };
            pan.setValue({ x: 0, y: 0 });
        }
    }, [visible, initial]);

    const renderedImgW = FRAME_SIZE * zoom;
    const renderedImgH = imgSize.w > 0 ? (FRAME_SIZE * imgSize.h / imgSize.w) * zoom : FRAME_SIZE * zoom;

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
            <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={onCancel} style={styles.headerBtn}>
                        <X size={22} color={SynthTokens.colors.neutral900} />
                    </Pressable>
                    <SynthText variant="accent">Crop Thumbnail</SynthText>
                    <Pressable onPress={handleDone} style={styles.doneBtn}>
                        <Check size={20} color="#fff" />
                        <SynthText variant="meta" style={styles.doneTxt}>Done</SynthText>
                    </Pressable>
                </View>

                <SynthText variant="meta" color="secondary" style={styles.hint}>
                    Drag to reposition · Use +/− to zoom
                </SynthText>

                {/* Crop frame */}
                <View style={styles.frameWrapper}>
                    <View style={styles.frame} {...panResponder.panHandlers}>
                        <Animated.Image
                            source={{ uri: imageUri }}
                            style={[
                                styles.image,
                                {
                                    width: renderedImgW,
                                    height: renderedImgH,
                                    transform: [
                                        { translateX: pan.x },
                                        { translateY: pan.y },
                                    ],
                                },
                            ]}
                            resizeMode="cover"
                            onLoad={(e) => {
                                const { width, height } = e.nativeEvent.source;
                                setImgSize({ w: width || 1, h: height || 1 });
                            }}
                        />
                        {/* Corner guides */}
                        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                            {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                                <View key={corner} style={[styles.corner, styles[corner]]} />
                            ))}
                        </View>
                    </View>
                </View>

                {/* Zoom controls */}
                <View style={styles.zoomRow}>
                    <Pressable
                        style={[styles.zoomBtn, zoom <= MIN_ZOOM && styles.zoomBtnDisabled]}
                        onPress={() => adjustZoom(-ZOOM_STEP)}
                        disabled={zoom <= MIN_ZOOM}
                    >
                        <ZoomOut size={22} color={zoom <= MIN_ZOOM ? SynthTokens.colors.neutral400 : SynthTokens.colors.neutral900} />
                    </Pressable>
                    <SynthText variant="meta" color="secondary" style={styles.zoomLabel}>
                        {zoom.toFixed(2)}×
                    </SynthText>
                    <Pressable
                        style={[styles.zoomBtn, zoom >= MAX_ZOOM && styles.zoomBtnDisabled]}
                        onPress={() => adjustZoom(ZOOM_STEP)}
                        disabled={zoom >= MAX_ZOOM}
                    >
                        <ZoomIn size={22} color={zoom >= MAX_ZOOM ? SynthTokens.colors.neutral400 : SynthTokens.colors.neutral900} />
                    </Pressable>
                </View>

                <SynthText variant="meta" color="secondary" style={styles.footerNote}>
                    This crop is used as the thumbnail for your review card.
                </SynthText>
            </View>
        </Modal>
    );
}

const CORNER_SIZE = 20;
const CORNER_THICKNESS = 3;

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#111',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 12,
    },
    headerBtn: {
        padding: 6,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 8,
    },
    doneBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: SynthTokens.colors.brandPink500,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
    },
    doneTxt: { color: '#fff', fontWeight: '600' },
    hint: {
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 20,
        textAlign: 'center',
    },
    frameWrapper: {
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 4 },
        elevation: 12,
    },
    frame: {
        width: FRAME_SIZE,
        height: FRAME_SIZE,
        overflow: 'hidden',
        borderRadius: 4,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
    },
    image: {
        position: 'absolute',
    },
    corner: {
        position: 'absolute',
        width: CORNER_SIZE,
        height: CORNER_SIZE,
        borderColor: '#fff',
    },
    tl: {
        top: 8,
        left: 8,
        borderTopWidth: CORNER_THICKNESS,
        borderLeftWidth: CORNER_THICKNESS,
        borderTopLeftRadius: 3,
    },
    tr: {
        top: 8,
        right: 8,
        borderTopWidth: CORNER_THICKNESS,
        borderRightWidth: CORNER_THICKNESS,
        borderTopRightRadius: 3,
    },
    bl: {
        bottom: 8,
        left: 8,
        borderBottomWidth: CORNER_THICKNESS,
        borderLeftWidth: CORNER_THICKNESS,
        borderBottomLeftRadius: 3,
    },
    br: {
        bottom: 8,
        right: 8,
        borderBottomWidth: CORNER_THICKNESS,
        borderRightWidth: CORNER_THICKNESS,
        borderBottomRightRadius: 3,
    },
    zoomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        marginTop: 28,
    },
    zoomBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    zoomBtnDisabled: {
        opacity: 0.4,
    },
    zoomLabel: {
        color: 'rgba(255,255,255,0.8)',
        width: 60,
        textAlign: 'center',
        fontSize: 16,
    },
    footerNote: {
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
        marginTop: 20,
        fontSize: 12,
    },
});
