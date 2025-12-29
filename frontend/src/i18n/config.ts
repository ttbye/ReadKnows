/**
 * @file config.ts
 * @author ttbye
 * @date 2025-12-11
 * @description i18n 配置文件
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import zh from './locales/zh.json';
import en from './locales/en.json';

// 检查是否已选择语言
const getInitialLanguage = (): string => {
  const savedLanguage = localStorage.getItem('app-language');
  if (savedLanguage && (savedLanguage === 'zh' || savedLanguage === 'en')) {
    return savedLanguage;
  }
  // 默认英文
  return 'en';
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: {
        translation: zh,
      },
      en: {
        translation: en,
      },
    },
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React 已经转义了
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'app-language',
    },
  });

export default i18n;

