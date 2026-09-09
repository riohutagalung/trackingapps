import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rhhabits.app',
  appName: 'RH Habits',
  webDir: '.',
  android: {
    useLegacyBridge: true
  }
};

export default config;
