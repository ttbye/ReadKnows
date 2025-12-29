import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 生成带随机码的版本号
// 格式：1.225.12-XXXXXX
// 1: 大版本号（固定）
// 225: 小版本号 = "2" + 年份后两位（2025 -> "25"） = "2" + "25" = "225"
// 12: 编译月份
// XXXXXX: 6位随机码
function generateVersion(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 月份从0开始，需要+1
  
  // 计算小版本号：字符串拼接 "2" + 年份后两位
  const yearLastTwo = (year % 100).toString().padStart(2, '0'); // 2025 -> "25"
  const minorVersion = `2${yearLastTwo}`; // "2" + "25" = "225"
  
  // 生成6位随机码
  const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6位随机码
  
  // 格式：1.225.12(XXXXXX)
  return `1.${minorVersion}.${month.toString().padStart(2, '0')}(${randomCode})`;
}

const BUILD_VERSION = generateVersion();
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
        short_name: '读士私人书库',
        description: '读士AI 私人书库 | ReadKnows - 支持多格式、多平台、多用户的私人电子书管理平台',
        theme_color: '#ffffff',
        background_color: '#ffffff',
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
          // 页面导航：离线时使用缓存，确保可以打开应用
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-cache',
              networkTimeoutSeconds: 1, // 缩短超时时间，更快回退到缓存
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30天，确保离线可用
              cacheableResponse: { statuses: [0, 200] },
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
          // API 数据：优先网络，离线回退缓存
          {
            urlPattern: /\/api\/.*$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 1, // 缩短超时时间，更快回退到缓存
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30天，确保离线可用
              cacheableResponse: { statuses: [0, 200] },
              // 离线时使用缓存
              plugins: [
                {
                  cacheKeyWillBeUsed: async ({ request }) => {
                    return request.url;
                  },
                  cacheWillUpdate: async ({ response }) => {
                    // 只缓存成功的响应
                    return response && response.status === 200 ? response : null;
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
      '/opds': {
        target: 'http://localhost:1281',
        changeOrigin: true,
        // Vite 代理会自动匹配 /opds 和所有 /opds/* 路径
      },
    },
  },
});

