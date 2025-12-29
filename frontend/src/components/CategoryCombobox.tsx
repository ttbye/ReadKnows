/**
 * @file CategoryCombobox.tsx
 * @author ttbye
 * @date 2025-12-11
 * 可输入的下拉框组件，用于书籍分类选择
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface CategoryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  categories: string[];
  placeholder?: string;
  className?: string;
}

export default function CategoryCombobox({
  value,
  onChange,
  categories,
  placeholder = '选择或输入分类',
  className = '',
}: CategoryComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [filteredCategories, setFilteredCategories] = useState<string[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 当外部value改变时，更新inputValue
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // 当categories改变时，更新过滤列表（但不根据inputValue过滤，只在用户输入时过滤）
  useEffect(() => {
    if (categories && Array.isArray(categories) && categories.length > 0) {
      // 当categories改变时，直接显示所有分类，不进行过滤
      const newFiltered = [...categories];
      setFilteredCategories(newFiltered);
    } else {
      setFilteredCategories([]);
    }
  }, [categories]);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue); // 实时更新值，允许自定义输入
    
    // 实时过滤
    if (categories && Array.isArray(categories) && categories.length > 0) {
      if (!newValue.trim()) {
        const newFiltered = [...categories];
        setFilteredCategories(newFiltered);
      } else {
        const filtered = categories.filter(cat =>
          cat && typeof cat === 'string' && cat.toLowerCase().includes(newValue.toLowerCase())
        );
        setFilteredCategories(filtered);
      }
    }
    
    setIsOpen(true);
  };

  const handleSelectCategory = (category: string) => {
    setInputValue(category);
    onChange(category);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleInputFocus = () => {
    // 当用户点击输入框时，显示所有分类（不进行过滤）
    if (categories && Array.isArray(categories) && categories.length > 0) {
      setFilteredCategories([...categories]);
    }
    setIsOpen(true);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          className="w-full px-4 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-blue-400"
        />
        <button
          type="button"
          onClick={() => {
            if (!isOpen) {
              // 当用户点击下拉按钮打开下拉框时，显示所有分类（不进行过滤）
              if (categories && Array.isArray(categories) && categories.length > 0) {
                setFilteredCategories([...categories]);
              }
            }
            setIsOpen(!isOpen);
            inputRef.current?.focus();
          }}
          className="absolute right-0 top-0 h-full px-3 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
          {(() => {
            // 如果filteredCategories为空但categories不为空，使用categories
            const displayCategories = (filteredCategories.length > 0 ? filteredCategories : categories) || [];
            
            if (displayCategories.length > 0) {
              return (
                <ul className="py-1">
                  {displayCategories.map((category, index) => {
                    const categoryStr = String(category || '');
                    return (
                      <li
                        key={`cat-${index}-${categoryStr}`}
                        onClick={() => handleSelectCategory(categoryStr)}
                        className={`px-4 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${
                          inputValue === categoryStr ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                        }`}
                      >
                        {categoryStr}
                      </li>
                    );
                  })}
                </ul>
              );
            } else {
              return (
                <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                  {inputValue.trim() ? '未找到匹配的分类，将使用自定义输入' : '暂无分类'}
                </div>
              );
            }
          })()}
        </div>
      )}
    </div>
  );
}

