/** Synth brand theme extension for Tailwind. Merge into theme.extend. */
export const synthBrandTheme = {
  colors: {
    synth: {
      pink: {
        50: '#FDF2F7',
        500: '#CC2486',
        600: '#951A6D',
        700: '#7B1559',
      },
      purple: '#8D1FF4',
      neutral: {
        0: '#FFFFFF',
        50: '#FCFCFC',
        100: '#F5F5F5',
        200: '#E6E6E6',
        400: '#8A8F98',
        600: '#5D646F',
        900: '#0E0E0E',
      },
      success: '#2E8B63',
      error: '#C62828',
      warning: '#B88900',
      info: '#1F66EA',
    },
  },
  fontFamily: {
    sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  },
  borderRadius: {
    synth: '10px',
  },
  spacing: {
    'screen-x': '20px',
  },
};

export default synthBrandTheme;
