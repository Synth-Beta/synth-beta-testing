/**
 * React Native cannot resolve CSS `var(--token)` strings. Values mirror
 * `src/styles/tokens.css` (hex / rgba literals only).
 *
 * Dark mode: on iOS every color is a DynamicColorIOS, so static StyleSheets flip the moment
 * Appearance.setColorScheme changes (see src/theme/themePreference.ts). Android has no dynamic
 * color, so it picks the palette once at launch.
 * shortcut: Android needs an app restart after the toggle; switch to a hook-based theme if Android ships.
 */
import { Appearance, DynamicColorIOS, Platform, type ColorValue } from 'react-native';

const lightColors = {
    // Base (from tokens.css --neutral-*)
    // No pure white or black: warm off-white surfaces, near-black text.
    neutral0: '#FFFDFA',
    neutral50: '#FBF9F6',
    neutral100: '#F5F5F5',
    neutral200: '#E6E6E6',
    neutral400: '#8A8F98',
    neutral600: '#5D646F',
    neutral900: '#0E0E0E',

    // Brand (from tokens.css --brand-pink-*)
    brandPink500: '#CC2486',
    brandPink600: '#951A6D',
    brandPink700: '#7B1559',
    brandPink050: '#FDF2F7',
    brandInstagram: '#E1306C',
    brandSpotify: '#1DB954',
    brandAppleMusic: '#FB5C74',
    purpleAccent: '#8D1FF4',

    // Status (from tokens.css)
    success: '#2E8B63',
    error: '#C62828',
    warning: '#B88900',
    stars: '#FCDC5F',

    // Info
    infoBlue050: '#F0F6FE',
    infoBlue500: '#1F66EA',

    // States / overlays (match web tokens.css)
    stateDisabledBg: '#E6E6E6',
    stateDisabledText: '#5D646F',
    overlay50: 'rgba(14, 14, 14, 0.5)',
    overlay20: 'rgba(14, 14, 14, 0.2)',

    /** Text and icons on pink, red, black or photo fills: stays off-white in both themes. */
    onAccent: '#FFFDFA',
};

/** Venue at night: warm near-black, surfaces lift by getting lighter, pink lifted for dark contrast. */
const darkColors: Record<keyof typeof lightColors, string> = {
    neutral0: '#1B1918',
    neutral50: '#121110',
    neutral100: '#252321',
    neutral200: '#353230',
    neutral400: '#807B76',
    neutral600: '#ABA59F',
    neutral900: '#F4F0EB',

    brandPink500: '#D63C93',
    brandPink600: '#E968AD',
    brandPink700: '#F28DC2',
    brandPink050: '#2B1621',
    brandInstagram: '#E1306C',
    brandSpotify: '#1DB954',
    brandAppleMusic: '#FB5C74',
    purpleAccent: '#A65CF7',

    success: '#5BBF8E',
    error: '#F07167',
    warning: '#E2B84A',
    stars: '#FCDC5F',

    infoBlue050: '#142035',
    infoBlue500: '#7AA5F7',

    stateDisabledBg: '#2A2826',
    stateDisabledText: '#8C8680',
    overlay50: 'rgba(0, 0, 0, 0.6)',
    overlay20: 'rgba(0, 0, 0, 0.3)',

    onAccent: '#FFFDFA',
};

export type SynthColorName = keyof typeof lightColors;

const androidDark = Platform.OS !== 'ios' && Appearance.getColorScheme() === 'dark';

function themed(light: string, dark: string): ColorValue {
    if (light === dark) return light;
    if (Platform.OS === 'ios') return DynamicColorIOS({ light, dark });
    return androidDark ? dark : light;
}

const colors = Object.fromEntries(
    (Object.keys(lightColors) as SynthColorName[]).map((k) => [k, themed(lightColors[k], darkColors[k])]),
) as Record<SynthColorName, ColorValue>;

/** A token at a hex alpha (`'20'` = 12%), still theme-aware. Use instead of `color + '20'`. */
function alpha(name: SynthColorName, hexAlpha: string): ColorValue {
    const add = (c: string) => (c.startsWith('#') && c.length === 7 ? c + hexAlpha : c);
    return themed(add(lightColors[name]), add(darkColors[name]));
}

export const SynthTokens = {
    colors,
    /** Plain hex per theme, for APIs that need a string (string math, web views). */
    palette: { light: lightColors, dark: darkColors },
    alpha,
    shadow: {
        color: 'rgba(0, 0, 0, 0.25)',
    },
    typography: {
        fontFamily: {
            regular: 'Inter-Regular', // Needs to be loaded via expo-font
            medium: 'Inter-Medium',
            bold: 'Inter-Bold',
        },
        sizes: {
            h1: 35,
            h2: 24,
            body: 20,
            accent: 20,
            meta: 16,
            steps: 16,
        },
        lineHeights: {
            h1: 35 * 1.2,
            h2: 24 * 1.3,
            body: 20 * 1.5,
            accent: 20 * 1.5,
            meta: 16 * 1.5,
            steps: 16 * 1.5,
        },
    },
    spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
        xxl: 48,
        inline: 6,
        small: 12,
        grouped: 24,
        bigSection: 60,
        screenMarginX: 20,
        menuItemRowHeight: 48,
        bottomNav: 32,
    },
    sizing: {
        buttonHeight: 36,
        buttonHeightSm: 28,
        inputHeight: 44,
    },
    radius: {
        small: 8,
        corner: 10,
        medium: 12,
        large: 16,
        full: 9999,
    },
};
