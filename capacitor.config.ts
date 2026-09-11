import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.rhhabits.app',
  appName: 'RH Habits',
  webDir: 'www',
  android: { useLegacyBridge: true },
  plugins: {
    SplashScreen: { launchAutoHide: true, launchFadeOutDuration: 180, backgroundColor: '#060c15', showSpinner: false }
  }
};
export default config;
