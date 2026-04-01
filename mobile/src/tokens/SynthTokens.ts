export const SynthTokens = {
    colors: {
        // Base
        neutral0: 'var(--neutral-0)',
        neutral50: 'var(--neutral-50)',
        neutral100: 'var(--neutral-100)',
        neutral200: 'var(--neutral-200)',
        neutral400: 'var(--neutral-400)',
        neutral600: 'var(--neutral-600)',
        neutral900: 'var(--neutral-900)',

        // Brand
        brandPink500: 'var(var(--brand-pink-500))',
        brandPink600: 'var(--brand-pink-600)',
        brandPink700: '#7B1559',
        brandPink050: 'var(--brand-pink-050)',
        purpleAccent: '#8D1FF4',

        // Status
        success: '#2E8B63',
        error: '#C62828',
        warning: 'var(--status-warning-500)',
        stars: '#FCDC5F',

        // Info
        infoBlue050: '#F0F6FE',
        infoBlue500: '#1F66EA',

        // States / overlays (match web tokens.css)
        stateDisabledBg: 'var(--neutral-200)',
        stateDisabledText: 'var(--neutral-600)',
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
