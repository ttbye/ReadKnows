/**
 * @file errorLogger.ts
 * @description 错误日志记录和监控工具
 */

/**
 * 错误类别
 */
export enum ErrorCategory {
  /** 组件错误 */
  COMPONENT = 'component',
  /** 音频错误 */
  AUDIO = 'audio',
  /** 网络错误 */
  NETWORK = 'network',
  /** PWA错误 */
  PWA = 'pwa',
  /** 存储错误 */
  STORAGE = 'storage',
  /** 未知错误 */
  UNKNOWN = 'unknown',
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  /** 低 - 不影响功能 */
  LOW = 'low',
  /** 中 - 影响部分功能 */
  MEDIUM = 'medium',
  /** 高 - 影响核心功能 */
  HIGH = 'high',
  /** 严重 - 导致功能完全不可用 */
  CRITICAL = 'critical',
}

/**
 * 错误上下文信息
 */
export interface ErrorContext {
  /** 错误类别 */
  category: ErrorCategory;
  /** 错误严重程度 */
  severity?: ErrorSeverity;
  /** 组件堆栈信息 */
  componentStack?: string;
  /** 错误边界名称 */
  errorBoundary?: string;
  /** 用户操作 */
  userAction?: string;
  /** 音频文件ID */
  fileId?: string;
  /** 有声小说ID */
  audiobookId?: string;
  /** 网络请求URL */
  url?: string;
  /** 网络请求方法 */
  method?: string;
  /** 额外数据 */
  extra?: Record<string, unknown>;
}

/**
 * 错误信息
 */
export interface ErrorInfo {
  message: string;
  stack?: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  timestamp: number;
  context: ErrorContext;
  userAgent?: string;
  url?: string;
}

/**
 * 错误日志存储（内存中，最多保存100条）
 */
const errorLogs: ErrorInfo[] = [];
const MAX_LOG_SIZE = 100;

/**
 * 获取错误严重程度（根据错误类型自动判断）
 */
function getErrorSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
  // 网络错误通常是中等严重程度
  if (category === ErrorCategory.NETWORK) {
    return ErrorSeverity.MEDIUM;
  }

  // 音频错误根据错误代码判断
  if (category === ErrorCategory.AUDIO) {
    const audioError = error as any;
    if (audioError?.code === 4) {
      // MEDIA_ERR_SRC_NOT_SUPPORTED
      return ErrorSeverity.CRITICAL;
    }
    if (audioError?.code === 2) {
      // MEDIA_ERR_NETWORK
      return ErrorSeverity.HIGH;
    }
    return ErrorSeverity.MEDIUM;
  }

  // PWA错误通常是中等严重程度
  if (category === ErrorCategory.PWA) {
    return ErrorSeverity.MEDIUM;
  }

  // 组件错误通常是高严重程度
  if (category === ErrorCategory.COMPONENT) {
    return ErrorSeverity.HIGH;
  }

  // 存储错误通常是低严重程度
  if (category === ErrorCategory.STORAGE) {
    return ErrorSeverity.LOW;
  }

  return ErrorSeverity.MEDIUM;
}

/**
 * 记录错误
 */
export function logError(
  error: Error | string,
  context: ErrorContext
): ErrorInfo {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = typeof error === 'string' ? undefined : error.stack;

  const errorInfo: ErrorInfo = {
    message: errorMessage,
    stack: errorStack,
    category: context.category,
    severity: context.severity || getErrorSeverity(error as Error, context.category),
    timestamp: Date.now(),
    context,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
  };

  // 添加到日志
  errorLogs.push(errorInfo);
  if (errorLogs.length > MAX_LOG_SIZE) {
    errorLogs.shift(); // 移除最旧的日志
  }

  // 在开发环境下输出到控制台
  if (process.env.NODE_ENV === 'development') {
    console.error('[ErrorLogger]', errorInfo);
  }

  // 在生产环境下，可以发送到错误监控服务
  if (process.env.NODE_ENV === 'production') {
    // TODO: 集成错误监控服务（如 Sentry、LogRocket 等）
    // sendToErrorService(errorInfo);
  }

  return errorInfo;
}

/**
 * 获取错误日志
 */
export function getErrorLogs(limit?: number): ErrorInfo[] {
  if (limit) {
    return errorLogs.slice(-limit);
  }
  return [...errorLogs];
}

/**
 * 清除错误日志
 */
export function clearErrorLogs(): void {
  errorLogs.length = 0;
}

/**
 * 获取特定类别的错误日志
 */
export function getErrorLogsByCategory(
  category: ErrorCategory
): ErrorInfo[] {
  return errorLogs.filter((log) => log.category === category);
}

/**
 * 获取特定严重程度的错误日志
 */
export function getErrorLogsBySeverity(
  severity: ErrorSeverity
): ErrorInfo[] {
  return errorLogs.filter((log) => log.severity === severity);
}

/**
 * 获取最近的错误
 */
export function getRecentErrors(count: number = 10): ErrorInfo[] {
  return errorLogs.slice(-count);
}
