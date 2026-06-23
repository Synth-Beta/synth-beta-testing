import React, { useEffect, useRef } from 'react';
import {
    InteractionManager,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { Camera, Image as ImageIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import type { ChatImagePickerSource } from '../../utils/launchChatImagePicker';

const PINK = SynthTokens.colors.brandPink500;

type ChatImageSourceSheetProps = {
    visible: boolean;
    onClose: () => void;
    /** Called after the sheet has fully closed — safe to present the system picker. */
    onChoose: (source: ChatImagePickerSource) => void;
};

/**
 * In-app overlay (not RN Modal) so presenting UIImagePicker / camera does not
 * stack two native modals and crash on iOS.
 */
export function ChatImageSourceSheet({ visible, onClose, onChoose }: ChatImageSourceSheetProps) {
    const insets = useSafeAreaInsets();
    const pendingSourceRef = useRef<ChatImagePickerSource | null>(null);
    const wasVisibleRef = useRef(false);

    const flushPendingChoice = () => {
        const source = pendingSourceRef.current;
        pendingSourceRef.current = null;
        if (source) {
            onChoose(source);
        }
    };

    const choose = (source: ChatImagePickerSource) => {
        pendingSourceRef.current = source;
        onClose();
    };

    useEffect(() => {
        if (visible) {
            wasVisibleRef.current = true;
            return;
        }
        if (!wasVisibleRef.current) return;
        wasVisibleRef.current = false;
        InteractionManager.runAfterInteractions(() => {
            requestAnimationFrame(() => {
                requestAnimationFrame(flushPendingChoice);
            });
        });
    }, [visible]);

    if (!visible) {
        return null;
    }

    return (
        <View style={styles.root} pointerEvents="box-none">
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
                <View style={styles.handle} />
                <SynthText variant="h2" style={styles.title}>
                    Send Image
                </SynthText>
                <Pressable style={styles.option} onPress={() => choose('camera')}>
                    <Camera size={22} color={PINK} />
                    <Text style={styles.optionText}>Take Photo</Text>
                </Pressable>
                <Pressable style={styles.option} onPress={() => choose('library')}>
                    <ImageIcon size={22} color={PINK} />
                    <Text style={styles.optionText}>Choose from Library</Text>
                </Pressable>
                <Pressable style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1000,
        elevation: 1000,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: SynthTokens.spacing.lg,
        paddingTop: 8,
    },
    handle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: SynthTokens.colors.neutral200,
        marginBottom: 12,
    },
    title: {
        marginBottom: 16,
        textAlign: 'center',
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    optionText: {
        fontSize: 17,
        color: SynthTokens.colors.neutral900,
    },
    cancelBtn: {
        marginTop: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    cancelText: {
        fontSize: 17,
        color: SynthTokens.colors.neutral600,
        fontWeight: '600',
    },
});
