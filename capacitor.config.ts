import type {CapacitorConfig} from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.myboma.app',
  appName: 'MyBoma',
  webDir: 'dist',
  backgroundColor: '#f8f9fa',
  server: {
    androidScheme: 'https',
  },
  ios: {
    preferredContentMode: 'mobile',
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true,
    },
  },
};

export default config;
