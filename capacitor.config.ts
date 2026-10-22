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
    // Capacitor 8 core plugin. 'css' injects --safe-area-inset-* (real values when the
    // WebView draws edge-to-edge, 0 when Capacitor pads the WebView natively on WebView < 140),
    // which index.css consumes with an env() fallback for browsers / the iPad PWA.
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
      initialViewportFitValueHint: 'cover'
    }
  }
};

export default config;
