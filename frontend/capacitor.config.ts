import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qhsw.HydroReader',
  appName: 'HydroReader',
  webDir: 'dist',
  server: {
    // 开发时可以使用本地服务器，生产环境注释掉
    // url: 'http://localhost:1280',
    // cleartext: true
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'light',
      backgroundColor: '#ffffff',
      overlaysWebView: false,
    },
  },
};

export default config;
