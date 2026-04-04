/**
 * React Native cannot resolve CSS `var(--token)` strings. Values mirror
 * `src/styles/tokens.css` (hex / rgba literals only).
 */
export const SynthTokens = {
    colors: {
        // Base (from tokens.css --neutral-*)
        neutral0: '#FFFFFF',
        neutral50: '#FCFCFC',
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
    },
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
