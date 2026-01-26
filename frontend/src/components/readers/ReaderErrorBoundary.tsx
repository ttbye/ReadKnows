import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ChevronLeft } from 'lucide-react';

type ReaderTheme = 'light' | 'dark' | 'sepia' | 'green';

interface ReaderErrorBoundaryProps {
  children: ReactNode;
  theme?: ReaderTheme;
  onClose?: () => void;
}

interface ReaderErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

export class ReaderErrorBoundary extends Component<ReaderErrorBoundaryProps, ReaderErrorBoundaryState> {
  constructor(props: ReaderErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ReaderErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 这里不强依赖任何日志系统，避免边界本身再报错
    if (import.meta.env.DEV) {
      console.error('[ReaderErrorBoundary] Reader crashed', error, errorInfo);
    }
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  render() {
    if (!this.state.hasError) {
      // 用 key 触发子树重新挂载（更接近“重试”语义）
      return <React.Fragment key={this.state.retryCount}>{this.props.children}</React.Fragment>;
    }

    const theme = this.props.theme || 'light';
    const themeStyles =
      {
        light: { bg: '#ffffff', text: '#111827', sub: '#6b7280', border: 'rgba(229,231,235,0.8)' },
        dark: { bg: '#111827', text: '#f9fafb', sub: '#d1d5db', border: 'rgba(31,41,55,0.9)' },
        sepia: { bg: '#f4e4bc', text: '#5c4b37', sub: 'rgba(92,75,55,0.75)', border: 'rgba(212,196,156,0.9)' },
        green: { bg: '#c8e6c9', text: '#2e7d32', sub: 'rgba(46,125,50,0.75)', border: 'rgba(165,214,167,0.9)' },
      }[theme];

    return (
      <div className="w-full h-full flex items-center justify-center p-4">
        <div
          className="max-w-md w-full rounded-2xl shadow-2xl border p-6"
          style={{
            backgroundColor: themeStyles.bg,
            color: themeStyles.text,
            borderColor: themeStyles.border,
          }}
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-8 h-8" style={{ color: '#ef4444' }} />
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold">阅读器加载失败</div>
              <div className="mt-1 text-sm" style={{ color: themeStyles.sub }}>
                已捕获错误，不会影响其它页面。你可以重试或返回上一页。
              </div>

              {this.state.error?.message && (
                <details className="mt-4">
                  <summary className="text-xs cursor-pointer" style={{ color: themeStyles.sub }}>
                    错误详情
                  </summary>
                  <pre className="mt-2 text-xs whitespace-pre-wrap break-words max-h-40 overflow-auto p-2 rounded-lg bg-black/5 dark:bg-black/20">
                    {this.state.error.message}
                  </pre>
                </details>
              )}

              <div className="mt-5 flex items-center gap-2">
                <button
                  onClick={this.handleRetry}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  重试
                </button>
                {this.props.onClose && (
                  <button
                    onClick={this.props.onClose}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 flex items-center gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    返回
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

