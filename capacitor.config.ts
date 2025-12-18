import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.synth.app',
  appName: 'Synth',
  webDir: 'dist',
  // Server config only for live-reload development
  // Comment out server config for production builds (bundled assets)
  // Uncomment below for live-reload development:
  // server: {
  //   androidScheme: 'https',
  //   iosScheme: 'https',
  //   hostname: 'localhost',
  //   url: 'http://localhost:5174',
  // },
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

