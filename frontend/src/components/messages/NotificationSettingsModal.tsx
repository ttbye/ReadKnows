import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Bell, Volume2, VolumeX, Play } from 'lucide-react';

interface NotificationSettingsModalProps {
  onClose: () => void;
  notificationEnabled: boolean;
  soundEnabled: boolean;
  disableNotificationsWhenTTSPlaying: boolean;
  onUpdateSettings: (settings: {
    notificationEnabled: boolean;
    soundEnabled: boolean;
    disableNotificationsWhenTTSPlaying: boolean;
  }) => void;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  onClose,
  notificationEnabled,
  soundEnabled,
  disableNotificationsWhenTTSPlaying,
  onUpdateSettings,
}) => {
  const { t } = useTranslation();

  const handleToggleNotification = () => {
    const newSettings = {
      notificationEnabled: !notificationEnabled,
      soundEnabled,
      disableNotificationsWhenTTSPlaying,
    };
    onUpdateSettings(newSettings);
  };

  const handleToggleSound = () => {
    const newSettings = {
      notificationEnabled,
      soundEnabled: !soundEnabled,
      disableNotificationsWhenTTSPlaying,
    };
    onUpdateSettings(newSettings);
  };

  const handleToggleTTSNotification = () => {
    const newSettings = {
      notificationEnabled,
      soundEnabled,
      disableNotificationsWhenTTSPlaying: !disableNotificationsWhenTTSPlaying,
    };
    onUpdateSettings(newSettings);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('messages.messageSettings')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* 设置选项 */}
        <div className="p-4 space-y-6">
          {/* 消息通知 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">消息通知</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">接收新消息提醒</div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationEnabled}
                onChange={handleToggleNotification}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* 提示音 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                {soundEnabled ? (
                  <Volume2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <VolumeX className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                )}
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{t('messages.sound')}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{t('messages.newMessageSound')}</div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={handleToggleSound}
                className="sr-only peer"
                disabled={!notificationEnabled}
              />
              <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600 ${
                !notificationEnabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}></div>
            </label>
          </div>

          {/* TTS播放时禁用通知 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Play className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{t('messages.muteWhenTTS')}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{t('messages.muteWhenTTSDesc')}</div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={disableNotificationsWhenTTSPlaying}
                onChange={handleToggleTTSNotification}
                className="sr-only peer"
                disabled={!notificationEnabled}
              />
              <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 dark:peer-focus:ring-orange-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-orange-600 ${
                !notificationEnabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}></div>
            </label>
          </div>
        </div>

        {/* 底部说明 */}
        <div className="px-4 pb-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
            <p className="mb-1"><strong>{t('messages.noticeNote')}</strong></p>
            <p>• {t('messages.noticePermission')}</p>
            <p>• {t('messages.noticeMobileLimit')}</p>
            <p>• {t('messages.noticeTTSMute')}</p>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            {t('messages.confirmOk')}
          </button>
        </div>
      </div>
    </div>
  );
};