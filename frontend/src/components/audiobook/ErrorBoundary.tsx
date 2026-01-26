/**
 * @file ErrorBoundary.tsx
 * @description 有声小说播放器错误边界组件
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { logError, ErrorCategory } from './utils/errorLogger';

interface ErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

/**
 * 有声小说播放器错误边界
 * 捕获组件树中的错误，防止整个应用崩溃
 */
export class AudiobookPlayerErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 记录错误
    logError(error, {
      category: ErrorCategory.COMPONENT,
      componentStack: errorInfo.componentStack,
      errorBoundary: 'AudiobookPlayerErrorBoundary',
    });

    this.setState({
      errorInfo,
    });

    // 调用外部错误处理函数
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  handleRetry = () => {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }

    this.setState((prevState) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1,
    }));
  };

  handleReset = () => {
    // 完全重置组件
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, retryCount } = this.state;
      const maxRetries = 3;

      return (
        <div
          className="flex items-center justify-center min-h-[400px] p-4"
          role="alert"
          aria-live="assertive"
        >
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  播放器出现错误
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  播放器遇到了一个错误，但我们已经捕获了它，不会影响其他功能。
                </p>
                {error && (
                  <details className="mb-4">
                    <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 mb-2">
                      错误详情
                    </summary>
                    <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 rounded p-2 overflow-auto max-h-32">
                      {error.message}
                      {error.stack && `\n\n${error.stack}`}
                    </pre>
                  </details>
                )}
                <div className="flex gap-2">
                  {retryCount < maxRetries ? (
                    <button
                      onClick={this.handleRetry}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      aria-label="重试"
                    >
                      <RefreshCw className="w-4 h-4" />
                      重试
                    </button>
                  ) : (
                    <button
                      onClick={this.handleReset}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                      aria-label="重新加载页面"
                    >
                      <RefreshCw className="w-4 h-4" />
                      重新加载
                    </button>
                  )}
                </div>
                {retryCount >= maxRetries && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    已重试 {retryCount} 次，建议重新加载页面
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
