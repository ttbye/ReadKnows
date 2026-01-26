/**
 * @file timezone.ts
 * @author ttbye
 * @date 2026-01-06
 * @description 时区处理工具函数
 */

/**
 * 获取系统时区偏移（小时）
 * 从系统设置中获取，默认为+8（中国上海时区）
 */
export function getTimezoneOffset(): number {
  try {
    // 优先从localStorage获取（前端缓存）
    const cachedOffset = localStorage.getItem('system_timezone_offset');
    if (cachedOffset !== null) {
      const offset = parseInt(cachedOffset, 10);
      if (!isNaN(offset) && offset >= -12 && offset <= 14) {
        return offset;
      }
    }
  } catch (e) {
    // 忽略错误，使用默认值
  }
  // 默认时区：+8（中国上海时区）
  return 8;
}

// 全局时区同步状态，避免重复API调用
let isTimezoneSyncing = false;
let timezoneSyncPromise: Promise<void> | null = null;

/**
 * 从后端设置同步时区偏移到localStorage
 */
export function syncTimezoneFromBackend(offset: number): void {
  if (offset >= -12 && offset <= 14) {
    localStorage.setItem('system_timezone_offset', offset.toString());
    // 触发时区变化事件，通知其他组件
    window.dispatchEvent(new CustomEvent('timezoneChanged', { detail: { offset } }));
  }
}

/**
 * 全局时区同步函数，避免重复API调用
 */
export async function syncTimezoneFromBackendGlobal(): Promise<void> {
  // 如果正在同步中，返回已有的Promise
  if (isTimezoneSyncing && timezoneSyncPromise) {
    return timezoneSyncPromise;
  }

  // 如果已经同步过，直接返回
  const cached = localStorage.getItem('system_timezone_offset');
  if (cached !== null) {
    return Promise.resolve();
  }

  // 开始同步
  isTimezoneSyncing = true;
  timezoneSyncPromise = (async () => {
    try {
      const api = (await import('./api')).default;
      let response;
      try {
        response = await api.get('/settings', { timeout: 3000 });
      } catch (error: any) {
        // 如果是429错误，重试一次
        if (error.response?.status === 429) {
          console.warn('[时区同步] 429错误，等待1秒后重试');
          await new Promise(resolve => setTimeout(resolve, 1000));
          response = await api.get('/settings', { timeout: 3000 });
        } else {
          throw error;
        }
      }

      const v = response?.data?.settings?.system_timezone_offset?.value;
      if (v != null) {
        const o = parseInt(String(v), 10);
        if (!isNaN(o) && o >= -12 && o <= 14) {
          syncTimezoneFromBackend(o);
        }
      }
    } catch (error) {
      console.error('[时区调试] 全局时区同步失败:', error);
    } finally {
      isTimezoneSyncing = false;
      timezoneSyncPromise = null;
    }
  })();

  return timezoneSyncPromise;
}

/**
 * 设置系统时区偏移
 */
export function setTimezoneOffset(offset: number): void {
  if (offset >= -12 && offset <= 14) {
    localStorage.setItem('system_timezone_offset', offset.toString());
  }
}

/**
 * 根据系统时区偏移得到 IANA 时区 id（用于 Intl 格式化）
 * 例如：+8 -> Etc/GMT-8，-5 -> Etc/GMT+5
 * 若用户未在设置中配置时区，返回 undefined，格式化时将使用浏览器本地时区
 */
export function getSystemTimeZoneId(): string | undefined {
  try {
    const cached = localStorage.getItem('system_timezone_offset');
    if (cached === null) return undefined;
    const offset = parseInt(cached, 10);
    if (isNaN(offset) || offset < -12 || offset > 14) return undefined;
    if (offset === 0) return 'Etc/GMT';
    const sign = offset > 0 ? '-' : '+';
    return `Etc/GMT${sign}${Math.abs(offset)}`;
  } catch {
    return undefined;
  }
}

/**
 * 在系统时区下取日期的 YYYY-MM-DD，用于按日分组、比较
 * 未配置时区时使用浏览器本地时区
 */
export function getDateKeyInSystemTZ(dateString: string): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    const tz = getSystemTimeZoneId();
    return d.toLocaleDateString('en-CA', tz ? { timeZone: tz } : {});
  } catch {
    return '';
  }
}

/**
 * 仅格式化时间 HH:mm（按系统时区，未配置时用浏览器本地时区）
 */
export function formatTimeOnly(dateString: string): string {
  if (!dateString) return '';
  try {
    let d: Date;

    // 处理不同格式的时间字符串
    if (dateString.includes('T') && dateString.includes('Z')) {
      // ISO格式的UTC时间，直接使用
      d = new Date(dateString);
    } else if (dateString.includes(' ') && !dateString.includes('T')) {
      // 本地时间格式（如 "2026-01-26 02:15:08"）
      // 后端返回的可能是UTC时间的字符串表示，需要将其作为UTC时间解析
      // 先构造ISO格式的UTC时间字符串
      const utcDateString = dateString.replace(' ', 'T') + '.000Z';
      d = new Date(utcDateString);
    } else {
      // 其他格式，尝试直接解析
      d = new Date(dateString);
    }

    if (isNaN(d.getTime())) return '';

    const tz = getSystemTimeZoneId();

    return d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(tz ? { timeZone: tz } : {}),
    });
  } catch {
    return '';
  }
}

/**
 * 日期分隔用：今天 / 昨天 / 或完整日期（按系统时区，未配置时用浏览器本地时区）
 */
export function formatDateForSeparator(
  dateString: string,
  i18n: { today: string; yesterday: string }
): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    const tz = getSystemTimeZoneId();
    const tzOpt = tz ? { timeZone: tz } : {};
    const key = d.toLocaleDateString('en-CA', tzOpt);
    const todayKey = new Date().toLocaleDateString('en-CA', tzOpt);
    const yesterdayKey = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', tzOpt);
    if (key === todayKey) return i18n.today;
    if (key === yesterdayKey) return i18n.yesterday;
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...tzOpt,
    });
  } catch {
    return '';
  }
}

/**
 * 将UTC时间转换为本地时区时间
 * @param utcDateString UTC时间字符串（ISO格式）
 * @returns 本地时区时间对象
 */
export function utcToLocal(utcDateString: string): Date {
  // 如果输入已经是有效的日期字符串，直接使用
  // JavaScript的Date构造函数会自动将ISO格式的UTC时间字符串转换为本地时区
  const date = new Date(utcDateString);
  
  // 验证日期是否有效
  if (isNaN(date.getTime())) {
    console.warn('Invalid date string:', utcDateString);
    return new Date();
  }
  
  // 直接返回，因为Date对象已经自动转换为浏览器本地时区
  return date;
}

/**
 * 格式化时间显示（考虑时区）
 * @param dateString UTC时间字符串（ISO格式，如 "2024-01-01T12:00:00.000Z"）
 * @param options 格式化选项
 */
export function formatTimeWithTimezone(
  dateString: string,
  options?: {
    showTime?: boolean;
    showDate?: boolean;
    relative?: boolean;
  }
): string {
  if (!dateString) return '';
  
  const { showTime = true, showDate = true, relative = true } = options || {};
  
  // 将UTC时间转换为本地时区时间
  // JavaScript的Date构造函数会自动将ISO格式的UTC时间字符串转换为浏览器本地时区
  const localDate = utcToLocal(dateString);
  const now = new Date();
  
  // 相对时间显示（时间点比较用 UTC 即可；展示的“昨天 14:30”“周X”按系统时区）
  const tz = getSystemTimeZoneId();
  const tzOpt = tz ? { timeZone: tz } : {};
  const timeOpts = { hour: '2-digit' as const, minute: '2-digit' as const, hour12: false, ...tzOpt };

  if (relative) {
    const diff = now.getTime() - localDate.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (days === 0) {
      if (hours === 0) {
        return minutes <= 0 ? '刚刚' : `${minutes}分钟前`;
      }
      return `${hours}小时前`;
    } else if (days === 1) {
      return showTime
        ? `昨天 ${localDate.toLocaleTimeString('zh-CN', timeOpts)}`
        : '昨天';
    } else if (days < 7) {
      const wd = new Intl.DateTimeFormat('zh-CN', { ...tzOpt, weekday: 'short' }).format(localDate);
      return showTime
        ? `${wd} ${localDate.toLocaleTimeString('zh-CN', timeOpts)}`
        : `${days}天前`;
    }
  }

  // 绝对时间显示 - 使用系统设置时区，未配置时用浏览器本地时区
  if (showDate && showTime) {
    return localDate.toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...tzOpt,
    });
  } else if (showDate) {
    return localDate.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...tzOpt,
    });
  } else if (showTime) {
    return localDate.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...tzOpt,
    });
  }

  return localDate.toLocaleString('zh-CN', tzOpt);
}
