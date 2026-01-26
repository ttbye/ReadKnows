/**
 * @file PasswordInput.tsx
 * @author ttbye
 * @date 2025-01-01
 * @description 密码输入组件，支持显示/隐藏密码
 */

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  minLength?: number;
  maxLength?: number;
  onKeyPress?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export default function PasswordInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  className = '',
  required = false,
  autoFocus = false,
  disabled = false,
  minLength,
  maxLength,
  onKeyPress,
  onBlur,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // 默认样式类
  const defaultClassName = 'w-full px-4 py-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors';
  
  // 如果提供了 className，使用提供的；否则使用默认样式
  const inputClassName = className || defaultClassName;
  
  // 如果 className 包含 'input'，说明使用了全局 input 样式，需要添加相对定位的容器
  const needsWrapper = className.includes('input') || className.includes('w-full');

  const inputElement = (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        minLength={minLength}
        maxLength={maxLength}
        onKeyPress={onKeyPress}
        onBlur={onBlur}
        autoComplete={name === 'password' ? 'current-password' : name === 'username' ? 'username' : undefined}
        className={`${inputClassName} ${needsWrapper ? 'pr-10' : ''}`}
      />
      <button
        type="button"
        onClick={togglePasswordVisibility}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 focus:outline-none transition-colors"
        tabIndex={-1}
        aria-label={showPassword ? '隐藏密码' : '显示密码'}
      >
        {showPassword ? (
          <EyeOff className="w-5 h-5" />
        ) : (
          <Eye className="w-5 h-5" />
        )}
      </button>
    </div>
  );

  return inputElement;
}
