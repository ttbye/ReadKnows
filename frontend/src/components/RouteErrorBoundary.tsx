/**
 * @file RouteErrorBoundary.tsx
 * @description 路由级错误边界，防止某个页面组件渲染报错导致整个应用白屏
 */

import React from 'react';

interface RouteErrorBoundaryProps {
  children: React.ReactNode;
  pageName?: string;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class RouteErrorBoundary extends React.Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 在控制台记录详细信息，方便通过 Chrome 远程调试查看
    console.error(
      `[RouteErrorBoundary] 页面渲染出错: ${this.props.pageName || 'UnknownPage'}`,
      error,
      info
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
              页面加载出错
            </h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              {this.props.pageName || '当前页面'} 渲染时出现了异常，已阻止应用崩溃。
            </p>
            {this.state.error && (
              <pre className="mt-2 max-h-40 overflow-auto text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 rounded p-2">
                {this.state.error.message}
              </pre>
            )}
            <p className="mt-3 text-xs text-gray-400">
              如需排查，请使用 Chrome 远程调试查看控制台日志
              （包含完整错误堆栈）。
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

