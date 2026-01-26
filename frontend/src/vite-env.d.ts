/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BUILD_VERSION: string;
  readonly VITE_BUILD_TIME: string;
  readonly VITE_API_URL?: string;
  readonly VITE_API_KEY?: string;
  readonly VITE_HIDE_API_SERVER_CONFIG?: string;
  readonly VITE_IS_ANDROID_APP?: string; // 'true' 表示是 Android APK 构建，其他值或未定义表示否
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
/// <reference types="vite-plugin-pwa/client" />
/**
 * @author ttbye
 */

