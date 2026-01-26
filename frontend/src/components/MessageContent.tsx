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
  theme?: 'light' | 'dark' | 'sepia' | 'green';
}

export default function MessageContent({ content, className = '', theme = 'light' }: MessageContentProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  // 检测并提取 <think> 标签内容
  const reasoningRegex = /<think>([\s\S]*?)<\/redacted_reasoning>/gi;
  const reasoningMatches = Array.from(content.matchAll(reasoningRegex));
  
  // 移除思考内容后的主内容
  let mainContent = content.replace(reasoningRegex, '');
  
  // 提取所有思考内容
  const reasoningContents = reasoningMatches.map(match => match[1].trim());

  // 根据主题设置文本颜色
  const textColors = {
    light: {
      text: 'text-gray-900',
      heading: 'text-gray-900',
      muted: 'text-gray-700',
      code: 'text-gray-100',
      codeBg: 'bg-gray-800',
      inlineCode: 'text-gray-800',
      inlineCodeBg: 'bg-gray-200',
      border: 'border-gray-300',
      blockquote: 'text-gray-700 border-gray-300',
      link: 'text-blue-600',
      tableBorder: 'border-gray-300',
      tableHeader: 'bg-gray-100',
    },
    dark: {
      text: 'text-gray-100',
      heading: 'text-gray-100',
      muted: 'text-gray-300',
      code: 'text-gray-100',
      codeBg: 'bg-gray-900',
      inlineCode: 'text-gray-100',
      inlineCodeBg: 'bg-gray-700',
      border: 'border-gray-600',
      blockquote: 'text-gray-300 border-gray-600',
      link: 'text-blue-400',
      tableBorder: 'border-gray-600',
      tableHeader: 'bg-gray-800',
    },
    sepia: {
      text: 'text-[#5c4b37]',
      heading: 'text-[#5c4b37]',
      muted: 'text-[#5c4b37]',
      code: 'text-gray-100',
      codeBg: 'bg-gray-800',
      inlineCode: 'text-[#5c4b37]',
      inlineCodeBg: 'bg-[#d4c49c]',
      border: 'border-[#d4c49c]',
      blockquote: 'text-[#5c4b37] border-[#d4c49c]',
      link: 'text-blue-600',
      tableBorder: 'border-[#d4c49c]',
      tableHeader: 'bg-[#d4c49c]',
    },
    green: {
      text: 'text-[#2e7d32]',
      heading: 'text-[#2e7d32]',
      muted: 'text-[#2e7d32]',
      code: 'text-gray-100',
      codeBg: 'bg-gray-800',
      inlineCode: 'text-[#2e7d32]',
      inlineCodeBg: 'bg-[#a5d6a7]',
      border: 'border-[#a5d6a7]',
      blockquote: 'text-[#2e7d32] border-[#a5d6a7]',
      link: 'text-blue-600',
      tableBorder: 'border-[#a5d6a7]',
      tableHeader: 'bg-[#a5d6a7]',
    },
  };

  const colors = textColors[theme];

  return (
    <div className={className} style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
      {/* 主内容 - 使用markdown渲染 */}
      <div className={`prose prose-sm max-w-none prose-headings:mt-2 prose-headings:mb-2 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 ${colors.text} select-text`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // 自定义代码块样式
            code: ({ node, inline, className, children, ...props }: any) => {
              return !inline ? (
                <pre className={`${colors.codeBg} ${colors.code} rounded-lg p-3 overflow-x-auto my-2 text-sm`}>
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              ) : (
                <code className={`${colors.inlineCodeBg} ${colors.inlineCode} px-1.5 py-0.5 rounded text-sm font-mono`} {...props}>
                  {children}
                </code>
              );
            },
            // 自定义段落样式
            p: ({ children }: any) => <p className={`mb-2 last:mb-0 leading-relaxed ${colors.text}`}>{children}</p>,
            // 自定义列表样式
            ul: ({ children }: any) => <ul className={`list-disc list-inside mb-2 space-y-1 ml-2 ${colors.text}`}>{children}</ul>,
            ol: ({ children }: any) => <ol className={`list-decimal list-inside mb-2 space-y-1 ml-2 ${colors.text}`}>{children}</ol>,
            li: ({ children }: any) => <li className={`mb-0.5 ${colors.text}`}>{children}</li>,
            // 自定义标题样式
            h1: ({ children }: any) => <h1 className={`text-xl font-bold mb-2 mt-4 first:mt-0 ${colors.heading}`}>{children}</h1>,
            h2: ({ children }: any) => <h2 className={`text-lg font-semibold mb-2 mt-3 first:mt-0 ${colors.heading}`}>{children}</h2>,
            h3: ({ children }: any) => <h3 className={`text-base font-semibold mb-1 mt-2 first:mt-0 ${colors.heading}`}>{children}</h3>,
            h4: ({ children }: any) => <h4 className={`text-sm font-semibold mb-1 mt-2 first:mt-0 ${colors.heading}`}>{children}</h4>,
            h5: ({ children }: any) => <h5 className={`text-sm font-semibold mb-1 mt-2 first:mt-0 ${colors.heading}`}>{children}</h5>,
            h6: ({ children }: any) => <h6 className={`text-sm font-semibold mb-1 mt-2 first:mt-0 ${colors.heading}`}>{children}</h6>,
            // 自定义引用样式
            blockquote: ({ children }: any) => (
              <blockquote className={`border-l-4 ${colors.blockquote} pl-4 italic my-2`}>
                {children}
              </blockquote>
            ),
            // 自定义链接样式
            a: ({ children, href }: any) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${colors.link} hover:underline`}
              >
                {children}
              </a>
            ),
            // 自定义强调样式
            strong: ({ children }: any) => <strong className={`font-semibold ${colors.heading}`}>{children}</strong>,
            em: ({ children }: any) => <em className="italic">{children}</em>,
            // 自定义表格样式
            table: ({ children }: any) => (
              <div className="overflow-x-auto my-2">
                <table className={`min-w-full border-collapse border ${colors.tableBorder}`}>
                  {children}
                </table>
              </div>
            ),
            th: ({ children }: any) => (
              <th className={`border ${colors.tableBorder} px-3 py-2 ${colors.tableHeader} font-semibold ${colors.text}`}>
                {children}
              </th>
            ),
            td: ({ children }: any) => (
              <td className={`border ${colors.tableBorder} px-3 py-2 ${colors.text}`}>
                {children}
              </td>
            ),
            // 自定义水平线样式
            hr: () => <hr className={`my-4 ${colors.border} border-t`} />,
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

