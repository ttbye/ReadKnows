import React from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Users, UserPlus } from 'lucide-react';

interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

/**
 * 微信式底部导航栏：对话/好友/群组，替代系统底栏，仅用于消息页移动端
 */
export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  onTabChange
}) => {
  const { t } = useTranslation();
  const tabs = [
    { id: 'messages' as const, icon: MessageCircle, label: t('messages.bottomNavMessages') },
    { id: 'friends' as const, icon: Users, label: t('messages.bottomNavFriends') },
    { id: 'groups' as const, icon: UserPlus, label: t('messages.bottomNavGroups') },
  ];
  return (
    <nav
      className="flex-shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700/80"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
    >
      <div className="h-14 flex items-center justify-around px-1">
        {tabs.map(({ id, icon: Icon, label }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-2 rounded-lg transition-colors active:opacity-80 ${
                isActive
                  ? 'text-[#07C160] dark:text-[#07C160]'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <Icon className="w-6 h-6 mb-0.5" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};