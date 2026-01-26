import React from 'react';
import { useTranslation } from 'react-i18next';

interface TopNavigationProps {
  activeTab: string;
}

/**
 * 顶部导航栏组件
 */
export const TopNavigation: React.FC<TopNavigationProps> = ({ activeTab }) => {
  const { t } = useTranslation();
  const getTitle = () => {
    switch (activeTab) {
      case 'messages':
        return t('messages.tabConversations');
      case 'friends':
        return t('messages.tabFriends');
      case 'groups':
        return t('messages.tabGroups');
      default:
        return t('messages.tabConversations');
    }
  };

  return (
    <header className="flex-shrink-0 h-11 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="h-full flex items-center justify-center px-4">
        <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100">
          {getTitle()}
        </h1>
      </div>
    </header>
  );
};