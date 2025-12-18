import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.synth.app',
  appName: 'Synth',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Allow localhost for development
    hostname: 'localhost',
    // For production, you may want to set this to your backend URL
    // hostname: 'your-backend-domain.com',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false, // We'll hide it manually when app is ready
      backgroundColor: '#FF3399',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#ffffff',
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#FF3399',
    },
  },
};

export default config;

