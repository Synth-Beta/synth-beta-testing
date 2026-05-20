import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/** Picker options aligned with the working review-photo flow (no base64, no extra iOS flags). */
const CHAT_IMAGE_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    allowsEditing: false,
    ...(Platform.OS === 'ios'
        ? { presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN }
        : {}),
};

export type ChatImagePickerSource = 'library' | 'camera';

export async function launchChatImagePicker(
    source: ChatImagePickerSource
): Promise<ImagePicker.ImagePickerResult | null> {
    if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return null;
        return ImagePicker.launchCameraAsync(CHAT_IMAGE_PICKER_OPTIONS);
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    return ImagePicker.launchImageLibraryAsync(CHAT_IMAGE_PICKER_OPTIONS);
}
