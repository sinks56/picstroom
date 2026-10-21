import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.sinks56.picstroom',
  appName: 'PicStroom',
  webDir: 'dist',
  server: {
    androidScheme: 'http'
  },
  android: {
    backgroundColor: '#000000',
    allowMixedContent: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#000000'
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#000000'
    }
  }
};

export default config;
