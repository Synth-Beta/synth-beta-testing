import React from 'react';
import {
    InteractionManager,
    Modal,
    Platform,
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

export function ChatImageSourceSheet({ visible, onClose, onChoose }: ChatImageSourceSheetProps) {
    const insets = useSafeAreaInsets();

    const choose = (source: ChatImagePickerSource) => {
        onClose();
        InteractionManager.runAfterInteractions(() => {
            setTimeout(() => onChoose(source), Platform.OS === 'ios' ? 500 : 300);
        });
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
            presentationStyle="overFullScreen"
            statusBarTranslucent
        >
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
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
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
