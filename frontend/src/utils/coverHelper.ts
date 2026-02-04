/**
 * @author ttbye
 * 处理书籍封面URL的工具函数
 * 支持多种封面URL格式：
 * 1. 完整URL（http/https）- 通过代理访问（避免CORS）
 * 2. /books/路径 - 书籍目录下的cover图片（支持中文路径）
 * 3. API路径（/api/covers/）- 直接使用
 * 4. 相对路径 - 通过API访问
 * 5. 豆瓣图片URL - 通过代理访问
 */

import { getFullApiUrl, getCustomApiUrl, getActualApiUrl, getFullBookUrl } from './api';

// 模块级别的变量，用于跟踪是否已经记录过APK环境未配置服务器地址的错误
// 避免在每次渲染时重复输出错误日志
let hasLoggedApkNoServerError = false;

// 检测是否在APK/Capacitor环境中
function isCapacitorEnvironment(): boolean {
  try {
    // 检查是否存在Capacitor对象（最可靠的检测方式）
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      console.log('[coverHelper] 检测到Capacitor对象，确认为APK环境');
      return true;
    }

    // 检查是否通过Capacitor协议访问
    if (typeof window !== 'undefined' && window.location) {
      const protocol = window.location.protocol;
      if (protocol === 'capacitor:' || protocol === 'capacitor-http:' || protocol === 'capacitor-https:') {
        console.log('[coverHelper] 检测到Capacitor协议，确认为APK环境');
        return true;
      }

      // 检查origin是否无效（移动应用常见情况）
      const origin = window.location.origin;
      const hostname = window.location.hostname;
      console.log('[coverHelper] 当前环境检测:', { protocol, origin, hostname });

      if (!origin || origin === 'null' || origin === 'file://' || origin.startsWith('capacitor://')) {
        console.log('[coverHelper] origin无效，确认为APK环境');
        return true;
      }

      // 额外检查：如果是localhost或常见开发主机名，不认为是APK环境
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
        console.log('[coverHelper] 检测到本地开发环境，确认为Web环境');
        return false;
      }
    }

    console.log('[coverHelper] 未检测到APK环境特征，确认为Web环境');
    return false;
  } catch (error) {
    console.log('[coverHelper] 环境检测出错:', error);
    return false;
  }
}

// 构建完整的 API URL（支持自定义服务器地址）
// 使用统一的 getFullApiUrl 函数，确保与全局 API 配置一致
function buildApiUrl(path: string): string {
  return getFullApiUrl(path);
}

export function getCoverUrl(coverUrl?: string | null): string | null {
  // 严格检查：确保 coverUrl 是字符串类型
  if (!coverUrl || typeof coverUrl !== 'string') {
    return null;
  }
  
  // 去除首尾空格
  const trimmedUrl = coverUrl.trim();
  if (!trimmedUrl) {
    return null;
  }
  
  // 只在开发环境或APK环境中记录详细日志
  const isAPK = isCapacitorEnvironment();
  const isDev = import.meta.env.DEV;

  // 如果是/books/路径（书籍目录下的cover图片）
  if (trimmedUrl.startsWith('/books/')) {
    // 处理中文路径：对路径的每个部分进行编码
    try {
      // 分割路径
      const parts = trimmedUrl.split('/').filter(p => p);
      
      // 对每个部分进行编码（跳过已编码的部分）
      const encodedParts = parts.map(part => {
        // 检查是否已经编码
        try {
          if (decodeURIComponent(part) !== part) {
            // 已经编码，直接返回
            return part;
          }
        } catch (e) {
          // 解码失败，说明可能已经编码或包含特殊字符
        }
        // 编码部分（保留斜杠）
        return encodeURIComponent(part);
      });
      
      // 重新组合路径
      const encodedPath = '/' + encodedParts.join('/');
      
      // 使用 getFullBookUrl 函数统一处理 /books/ 路径
      // 它会自动检查：1. 自定义URL（localStorage） 2. 环境变量 3. APK环境
      const fullUrl = getFullBookUrl(encodedPath);
      
      // 获取调试信息
      const actualApiUrl = getActualApiUrl();
      const customApiUrl = getCustomApiUrl();
      const envApiUrl = import.meta.env.VITE_API_URL;
      
      // 如果是绝对URL（不是相对路径），说明已经成功构建了完整URL
      if (fullUrl && (fullUrl.startsWith('http://') || fullUrl.startsWith('https://'))) {
        // 安全修复：仅在开发环境输出，避免生产环境泄露API URL
        // if (isDev) {
        //   console.log('[coverHelper] 使用API URL构建封面URL:', {
        //     actualApiUrl,
        //     customApiUrl,
        //     envApiUrl,
        //     encodedPath,
        //     fullUrl
        //   });
        // }
        return fullUrl;
      }
      
      // Web环境：没有自定义URL，使用相对路径（浏览器会自动使用当前页面的 origin）
      // APK环境：如果到这里说明配置有问题，返回相对路径（会在加载时失败，但至少不会报语法错误）
      if (isAPK) {
        // 只有在APK环境中且没有配置服务器地址时才记录错误
        // 如果 getFullBookUrl 返回的是相对路径，说明没有配置服务器地址
        if (!actualApiUrl || !actualApiUrl.startsWith('http')) {
          // 只在开发环境或首次遇到时记录详细错误（避免重复日志）
          const errorKey = 'coverHelper:apk:no-server:logged';
          const hasLogged = sessionStorage.getItem(errorKey);

          // 安全修复：仅在开发环境输出详细错误信息，避免生产环境泄露配置信息
          if (isDev && (!hasLogged || isDev)) {
            console.error('[coverHelper] ⚠️ APK环境中未配置服务器地址，封面图片无法加载');
            // 仅在开发环境输出详细配置信息
            if (isDev) {
            console.error('[coverHelper] 📍 当前状态:', {
              实际API地址: actualApiUrl || '(未配置)',
              自定义URL: customApiUrl || '(未设置)',
              环境变量: envApiUrl || '(未设置)',
              封面路径: encodedPath
            });
            console.error('[coverHelper] 🔧 解决方案（二选一）:');
            console.error('[coverHelper]   方案1: 在应用内设置服务器地址');
            console.error('[coverHelper]     - 打开应用 → 设置页面 → 找到"服务器地址"配置项');
            console.error('[coverHelper]     - 输入服务器地址，例如: https://your-server.com 或 http://192.168.1.100:1281');
            console.error('[coverHelper]     - 点击"保存"，应用会自动刷新');
            console.error('[coverHelper]   方案2: 重新构建APK时设置环境变量');
            console.error('[coverHelper]     - 使用命令: VITE_API_URL=https://your-server.com ./build-apk.sh debug');
            console.error('[coverHelper]     - 或使用默认服务器: USE_DEFAULT_SERVER=true ./build-apk.sh debug');
            }

            if (!hasLogged) {
              sessionStorage.setItem(errorKey, 'true');
            }
          }
        }
      }
      // 在Web环境中，不显示APK环境的错误信息
      // 相对路径在Web环境中是正常的，不需要报错
      return encodedPath;
    } catch (error) {
      console.error('[coverHelper] URL编码失败:', trimmedUrl, error);
      // 编码失败，返回原始URL（确保是字符串）
      return typeof trimmedUrl === 'string' ? trimmedUrl : null;
    }
  }

  // 如果已经是API路径，直接返回（但需要处理自定义 API URL）
  if (trimmedUrl.startsWith('/api/covers/')) {
    return buildApiUrl(trimmedUrl);
  }

  // 如果是完整URL（http/https开头），使用代理避免CORS问题
  if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
    // 使用后端代理
    const proxyPath = `/api/covers/proxy?url=${encodeURIComponent(trimmedUrl)}`;
    return buildApiUrl(proxyPath);
  }

  // 如果是相对路径，添加API前缀
  if (trimmedUrl.startsWith('/')) {
    // 如果已经是/covers/路径，转换为/api/covers/
    if (trimmedUrl.startsWith('/covers/')) {
      return buildApiUrl(`/api${trimmedUrl}`);
    }
    // 使用相对路径，让浏览器自动处理（会使用当前页面的 baseURL）
    return buildApiUrl(trimmedUrl);
  }

  // 如果是本地文件路径，尝试通过API访问
  if (trimmedUrl.includes('covers/') || trimmedUrl.includes('cover')) {
    const fileName = trimmedUrl.split('/').pop() || trimmedUrl;
    return buildApiUrl(`/api/covers/${encodeURIComponent(fileName)}`);
  }

  // 其他情况，假设是文件名，直接使用API路径
  return buildApiUrl(`/api/covers/${encodeURIComponent(trimmedUrl)}`);
}

/**
 * 检查图片是否可以加载
 */
export function checkImageExists(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

