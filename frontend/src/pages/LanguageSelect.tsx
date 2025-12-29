/**
 * @file LanguageSelect.tsx
 * @author ttbye
 * @date 2025-12-11
 * @description 语言选择页面（首次运行时）
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import i18n from '../i18n/config';

export default function LanguageSelect() {
  const navigate = useNavigate();
  const { t, i18n: i18nInstance } = useTranslation();
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');

  // 检查是否已经选择过语言
  useEffect(() => {
    const savedLanguage = localStorage.getItem('app-language');
    if (savedLanguage && (savedLanguage === 'zh' || savedLanguage === 'en')) {
      // 已经选择过语言，直接跳转到登录页或首页
      const currentPath = window.location.pathname;
      if (currentPath === '/language-select') {
        navigate('/login');
      }
    }
  }, [navigate]);

  const languages = [
    {
      code: 'en',
      name: 'English',
      nativeName: 'English',
      flag: '🇬🇧',
    },
    {
      code: 'zh',
      name: '中文',
      nativeName: '中文',
      flag: '🇨🇳',
    },
  ];

  const handleLanguageSelect = (langCode: string) => {
    setSelectedLanguage(langCode);
  };

  const handleConfirm = () => {
    // 保存语言选择
    localStorage.setItem('app-language', selectedLanguage);
    i18nInstance.changeLanguage(selectedLanguage);
    
    // 跳转到登录页面
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
            <Globe className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            {selectedLanguage === 'zh' ? '选择语言' : 'Select Language'}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {selectedLanguage === 'zh' 
              ? '请选择您的首选语言' 
              : 'Please select your preferred language'}
          </p>
        </div>

        <div className="space-y-3">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageSelect(lang.code)}
              className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                selectedLanguage === lang.code
                  ? 'border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{lang.flag}</span>
                <div className="text-left">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {lang.nativeName}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {lang.name}
                  </div>
                </div>
              </div>
              {selectedLanguage === lang.code && (
                <Check className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              )}
            </button>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          className="w-full btn btn-primary"
        >
          {selectedLanguage === 'zh' ? '确认' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}

