/**
 * @file MessageContent.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface MessageContentProps {
  content: string;
  className?: string;
}

export default function MessageContent({ content, className = '' }: MessageContentProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  // 检测并提取 <think> 标签内容
  const reasoningRegex = /<think>([\s\S]*?)<\/redacted_reasoning>/gi;
  const reasoningMatches = Array.from(content.matchAll(reasoningRegex));
  
  // 移除思考内容后的主内容
  let mainContent = content.replace(reasoningRegex, '');
  
  // 提取所有思考内容
  const reasoningContents = reasoningMatches.map(match => match[1].trim());

  return (
    <div className={className}>
      {/* 主内容 - 使用markdown渲染 */}
      <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-2 prose-headings:mb-2 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // 自定义代码块样式
            code: ({ node, inline, className, children, ...props }: any) => {
              return !inline ? (
                <pre className="bg-gray-800 dark:bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto my-2 text-sm">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              ) : (
                <code className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                  {children}
                </code>
              );
            },
            // 自定义段落样式
            p: ({ children }: any) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
            // 自定义列表样式
            ul: ({ children }: any) => <ul className="list-disc list-inside mb-2 space-y-1 ml-2">{children}</ul>,
            ol: ({ children }: any) => <ol className="list-decimal list-inside mb-2 space-y-1 ml-2">{children}</ol>,
            li: ({ children }: any) => <li className="mb-0.5">{children}</li>,
            // 自定义标题样式
            h1: ({ children }: any) => <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0 text-gray-900 dark:text-gray-100">{children}</h1>,
            h2: ({ children }: any) => <h2 className="text-lg font-semibold mb-2 mt-3 first:mt-0 text-gray-900 dark:text-gray-100">{children}</h2>,
            h3: ({ children }: any) => <h3 className="text-base font-semibold mb-1 mt-2 first:mt-0 text-gray-900 dark:text-gray-100">{children}</h3>,
            // 自定义引用样式
            blockquote: ({ children }: any) => (
              <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-2 text-gray-700 dark:text-gray-300">
                {children}
              </blockquote>
            ),
            // 自定义链接样式
            a: ({ children, href }: any) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {children}
              </a>
            ),
            // 自定义强调样式
            strong: ({ children }: any) => <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>,
            em: ({ children }: any) => <em className="italic">{children}</em>,
            // 自定义表格样式
            table: ({ children }: any) => (
              <div className="overflow-x-auto my-2">
                <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }: any) => (
              <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 bg-gray-100 dark:bg-gray-800 font-semibold">
                {children}
              </th>
            ),
            td: ({ children }: any) => (
              <td className="border border-gray-300 dark:border-gray-600 px-3 py-2">
                {children}
              </td>
            ),
          }}
        >
          {mainContent.trim()}
        </ReactMarkdown>
      </div>

      {/* 思考内容 - 可折叠 */}
      {reasoningContents.length > 0 && (
        <div className="mt-3 border-t border-gray-300 dark:border-gray-600 pt-3">
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full"
          >
            {showReasoning ? (
              <>
                <ChevronUp className="w-4 h-4" />
                <span>隐藏思考过程</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                <span>显示思考过程 ({reasoningContents.length} 段)</span>
              </>
            )}
          </button>
          
          {showReasoning && (
            <div className="mt-2 space-y-2">
              {reasoningContents.map((reasoning, index) => (
                <div
                  key={index}
                  className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
                >
                  <div className="font-medium mb-1 text-gray-700 dark:text-gray-300">思考过程 {index + 1}:</div>
                  <div className="whitespace-pre-wrap break-words font-mono">
                    {reasoning}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

