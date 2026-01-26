import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录（ES modules 兼容）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 从根目录 package.json 读取版本号（单一真实来源）
function getVersionFromRootPackage(): string {
  try {
    const rootPackageJson = resolve(__dirname, '..', 'package.json');
    if (existsSync(rootPackageJson)) {
      const pkg = JSON.parse(readFileSync(rootPackageJson, 'utf-8'));
      const version = pkg.version || '1.0.0';
      console.log(`✓ 读取到根目录版本号: ${version} (从 ${rootPackageJson})`);
      return version;
    } else {
      console.warn(`⚠️ 根目录 package.json 不存在: ${rootPackageJson}`);
    }
  } catch (error) {
    console.warn('无法读取根目录 package.json，使用默认版本号:', error);
  }
  return '0.0.0';
}

const BUILD_VERSION = getVersionFromRootPackage();
const BUILD_TIME = new Date().toISOString();
console.log(`📦 Build Version: ${BUILD_VERSION}`);
console.log(`🕐 Build Time: ${BUILD_TIME}`);

// SPA fallback插件：确保所有路由都返回index.html
function spaFallback(): Plugin {
  return {
    name: 'spa-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        
        // 优先跳过 OPDS 请求（必须在最前面检查，确保不被 SPA fallback 处理）
        if (url.startsWith('/opds')) {
          return next();
        }
        
        // 跳过静态资源请求（包括 JS、CSS 等文件）
        if (
          url.startsWith('/src/') ||
          url.startsWith('/node_modules/') ||
          url.startsWith('/@') ||
          url.startsWith('/api/') ||
          url === '/vite.svg' ||
          url === '/favicon.ico' ||
          url.startsWith('/pwa-') ||
          url.startsWith('/apple-touch-icon') ||
          url.startsWith('/mask-icon')
        ) {
          return next();
        }
        
        // 跳过所有文件请求（带扩展名的），包括 JS、CSS、图片等
        // 这很重要，避免将 JS 文件请求重定向到 index.html
        const filePattern = /\.(epub|pdf|txt|mobi|jpg|jpeg|png|gif|webp|js|mjs|ts|tsx|jsx|css|json|svg|ico|woff|woff2|ttf|otf|map)$/i;
        if (filePattern.test(url)) {
          return next();
        }
        
        // 对于/books路径，检查是否是UUID格式（不带扩展名）
        if (url.startsWith('/books/')) {
          const uuidPattern = /^\/books\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (uuidPattern.test(url)) {
            // UUID格式的页面请求，返回index.html
            console.log('[SPA Fallback] UUID页面请求，返回index.html:', url);
            req.url = '/index.html';
            return next();
          }
          
          // 检查是否是文件请求（带扩展名）
          const booksFilePattern = /^\/books\/[^/]+\.(epub|pdf|txt|mobi|jpg|jpeg|png|gif|webp)$/i;
          if (booksFilePattern.test(url)) {
            // 文件请求，继续处理（会被代理到后端）
            return next();
          }
          
          // 其他/books路径，返回index.html
          console.log('[SPA Fallback] /books路径，返回index.html:', url);
          req.url = '/index.html';
          return next();
        }
        
        // 其他所有路由，返回index.html
        console.log('[SPA Fallback] 其他路由，返回index.html:', url);
        req.url = '/index.html';
        next();
      });
    },
  };
}

export default defineConfig({
  define: {
    // 将版本号和编译时间注入到代码中，可以在任何地方使用
    'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(BUILD_VERSION),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(BUILD_TIME),
  },
  plugins: [
    react(),
    spaFallback(), // 添加SPA fallback插件
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      // 确保 manifest 文件格式正确
      manifestFilename: 'manifest.webmanifest',
      strategies: 'generateSW',
      manifest: {
        name: '读士私人书库 | ReadKnows',
        short_name: 'ReadKnows',
        description: '读士AI 私人书库 | ReadKnows - 支持多格式、多平台、多用户的私人电子书管理平台',
        // ✅ 修复：theme_color 和 background_color 由 JavaScript 动态设置，不在 manifest 中硬编码
        // 这些值会在运行时根据主题动态更新
        theme_color: '#ffffff', // 初始值，会被 JavaScript 覆盖
        background_color: '#ffffff', // 初始值，会被 JavaScript 覆盖
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        lang: 'zh-CN',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
        ],
        categories: ['books', 'education', 'productivity'],
        display_override: ['standalone', 'fullscreen', 'minimal-ui'],
        // 支持后台音频播放
        // 注意：iOS Safari 对后台播放有严格限制，需要用户交互才能开始播放
        // Android 需要相应的权限配置（已在 AndroidManifest.xml 中配置）
        // 添加这些字段以提高安装提示的触发率
        prefer_related_applications: false,
        related_applications: [],
        // 添加 screenshots 可以提高安装提示触发率（参考 LearnQ 项目）
        // 注意：需要至少一个非 wide 的 screenshot 才能在移动端显示
        screenshots: [
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'narrow' // 改为 narrow 或移除 form_factor，避免 wide only 警告
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'wide' // 保留 wide 版本用于桌面端
          }
        ],
        // 添加快捷方式（参考 LearnQ 项目）
        shortcuts: [
          {
            name: '我的书架',
            short_name: '书架',
            description: '快速进入我的书架',
            url: '/shelf',
            icons: [
              {
                src: 'pwa-192x192.png',
                sizes: '192x192'
              }
            ]
          },
          {
            name: '上传书籍',
            short_name: '上传',
            description: '快速上传新书籍',
            url: '/upload',
            icons: [
              {
                src: 'pwa-192x192.png',
                sizes: '192x192'
              }
            ]
          }
        ],
      },
      workbox: {
        // 预缓存所有关键资源（包括index.html）
        // 排除 icon-template.html（这是开发工具文件，不需要预缓存）
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}'],
        globIgnores: ['**/icon-template.html', '**/*.template.*'],
        // 参考 LearnQ 项目：增加最大缓存文件大小
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024, // 20MB
        // 离线fallback：所有导航请求都回退到index.html
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/books\/.*\.(epub|pdf|txt|mobi)$/i],
        // 确保离线时能打开应用
        skipWaiting: true,
        clientsClaim: true,
        // 清理旧缓存
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          // 页面导航：优先网络，避免缓存旧版本页面
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-cache',
              networkTimeoutSeconds: 2, // 减少超时时间，优先获取最新内容
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 2 }, // 2小时缓存，减少版本冲突
              cacheableResponse: { statuses: [0, 200] },
              plugins: [
                {
                  fetchDidFail: async ({ request, error }) => {
                    // 网络请求失败时，尝试从缓存获取
                    try {
                      const cache = await caches.open('pages-cache');
                      const cachedResponse = await cache.match(request);
                      if (cachedResponse) {
                        return cachedResponse;
                      }
                    } catch (cacheError) {
                      // 缓存获取失败，静默处理
                    }
                    return null;
                  },
                },
              ],
            },
          },
          // 静态资源（JS、CSS等关键资源）：使用CacheFirst确保离线可用
          {
            urlPattern: ({ request }) =>
              request.destination === 'style' ||
              request.destination === 'script' ||
              request.destination === 'worker',
            handler: 'CacheFirst', // 改为CacheFirst，确保离线时能加载
            options: {
              cacheName: 'assets-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 }, // 1年，确保离线可用
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // 封面与书籍资源（已访问的可离线打开）
          {
            urlPattern: /\/books\/.*\.(epub|pdf|txt|mobi|jpg|jpeg|png|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'books-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // API 数据：优先网络，离线回退缓存（缩短缓存时间避免版本问题）
          // 排除音频文件，因为它们很大且不应该被缓存
          {
            urlPattern: ({ url }) => {
              // 排除音频文件请求（这些文件很大且不应该被缓存）
              if (url.pathname.includes('/audiobooks/') && url.pathname.includes('/files/')) {
                return false;
              }
              // 其他 API 请求可以使用缓存
              return url.pathname.startsWith('/api/');
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 3, // 网络请求超时时间
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 6 }, // 6小时缓存，减少版本冲突
              cacheableResponse: { statuses: [0, 200] },
              // 离线时使用缓存，并处理网络错误
              plugins: [
                {
                  cacheKeyWillBeUsed: async ({ request }) => {
                    return request.url;
                  },
                  cacheWillUpdate: async ({ response }) => {
                    // 只缓存成功的响应
                    return response && response.status === 200 ? response : null;
                  },
                  fetchDidFail: async ({ request, error }) => {
                    // 网络请求失败时，尝试从缓存获取
                    // 这样可以避免抛出未捕获的 Promise 错误
                    try {
                      const cache = await caches.open('api-cache');
                      const cachedResponse = await cache.match(request);
                      if (cachedResponse) {
                        return cachedResponse;
                      }
                    } catch (cacheError) {
                      // 缓存获取失败，返回 null 让 Workbox 处理
                      console.warn('[Service Worker] API 请求失败且缓存不可用:', request.url, error);
                    }
                    // 返回 null 让 Workbox 使用默认的错误处理
                    return null;
                  },
                },
              ],
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0', // 允许局域网访问
    port: 1280,
    proxy: {
      '/api': {
        target: 'http://localhost:1281',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/books': {
        target: 'http://localhost:1281',
        changeOrigin: true,
        // 智能代理：区分文件请求和页面请求
        bypass: function(req, res, options) {
          const url = req.url || '';
          const accept = req.headers.accept || '';
          const method = req.method || 'GET';
          
          console.log('[Vite Proxy] /books bypass:', { url, accept, method });
          
          // 优先检查：如果是UUID格式（不带扩展名），优先返回 index.html
          // 这样可以确保书籍详情页的请求不会被代理到后端
          const uuidPattern = /^\/books\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (uuidPattern.test(url)) {
            // 只有在明确的文件请求时才代理到后端
            const isFileRequest = accept.includes('application/epub+zip') || 
                                  accept.includes('application/pdf') || 
                                  accept.includes('application/octet-stream') ||
                                  accept.includes('image/') ||
                                  accept.includes('application/zip') ||
                                  accept.includes('application/x-epub+zip') ||
                                  accept.includes('application/x-pdf');
            if (isFileRequest) {
              console.log('[Vite Proxy] UUID文件请求，继续代理:', url);
              return undefined; // 继续代理到后端
            }
            // 其他所有情况（包括HTML、Accept为空等）都返回 index.html
            console.log('[Vite Proxy] UUID页面请求，返回 /index.html:', url, 'Accept:', accept);
              return '/index.html';
            }
          
          // 1. 如果是 /books 根路径，返回 /index.html 让前端路由处理
          if (url === '/books' || url === '/books/') {
            console.log('[Vite Proxy] 返回 /index.html for /books');
            return '/index.html';
          }
          
          // 2. 检查是否是带扩展名的文件请求（如 /books/xxx.epub）
          const filePattern = /^\/books\/[^/]+\.(epub|pdf|txt|mobi|jpg|jpeg|png|gif|webp)$/i;
          if (filePattern.test(url)) {
            console.log('[Vite Proxy] 文件请求，继续代理:', url);
            // 带扩展名的文件请求，继续代理到后端
            return undefined;
          }
          
          // 3. 检查是否是相对路径的文件请求（如 /books/分类/作者/书名/cover.jpg）
          const relativePathFilePattern = /^\/books\/[^/]+(\/[^/]+)*\/[^/]+\.(epub|pdf|txt|mobi|jpg|jpeg|png|gif|webp)$/i;
          if (relativePathFilePattern.test(url)) {
            console.log('[Vite Proxy] 相对路径文件请求，继续代理:', url);
            // 相对路径的文件请求，继续代理到后端
            return undefined;
          }
          
          // 4. 如果是HTML请求，返回 /index.html
          if (accept.includes('text/html')) {
            console.log('[Vite Proxy] HTML请求，返回 /index.html:', url);
            return '/index.html';
          }
          
          // 5. 其他情况：如果是明确的文件请求，继续代理；否则返回 /index.html
          const isFileRequest = accept.includes('application/epub+zip') || 
                                accept.includes('application/pdf') || 
                                accept.includes('application/octet-stream') ||
                                accept.includes('image/') ||
                                accept.includes('text/plain') ||
                                accept.includes('application/zip');
          
          if (isFileRequest) {
            console.log('[Vite Proxy] 明确的文件请求，继续代理:', url);
            return undefined;
          }
          
          // 默认情况：返回 /index.html（包括Accept为空的情况）
          console.log('[Vite Proxy] 默认返回 /index.html:', url, 'Accept:', accept);
          return '/index.html';
        },
      },
      '/api/covers': {
        target: 'http://localhost:1281',
        changeOrigin: true,
      },
      '/messages': {
        target: 'http://localhost:1281',
        changeOrigin: true,
        // 代理消息文件（图片、语音、文件等）
      },
      '/opds': {
        target: 'http://localhost:1281',
        changeOrigin: true,
        // Vite 代理会自动匹配 /opds 和所有 /opds/* 路径
      },
    },
  },
});

