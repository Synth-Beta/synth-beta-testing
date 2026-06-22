import * as ImagePicker from 'expo-image-picker';

/** Picker options aligned with the working review-photo flow (no base64, no extra iOS flags). */
const CHAT_IMAGE_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
    allowsEditing: false,
    exif: false,
    // Prefer JPEG-compatible assets on iOS so uploads decode reliably in chat.
    ...(typeof ImagePicker.UIImagePickerPreferredAssetRepresentationMode !== 'undefined'
        ? {
              preferredAssetRepresentationMode:
                  ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
          }
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
