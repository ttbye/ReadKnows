/**
 * @file version.ts
 * @author ttbye
 * @description 版本号管理工具
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// 在编译后的 dist 目录中，__dirname 指向 dist/utils
// 在源码中，__dirname 指向 src/utils
// 所以需要根据实际情况调整路径
const getVersionFilePath = () => {
  // 尝试从当前文件位置推断项目根目录
  const currentDir = __dirname;
  // 如果在 dist/utils 中，需要回到项目根目录
  if (currentDir.includes('dist')) {
    return resolve(currentDir, '../../version.json');
  }
  // 如果在 src/utils 中，也需要回到项目根目录
  return resolve(currentDir, '../../version.json');
};

const VERSION_FILE = getVersionFilePath();

/**
 * 获取 package.json 路径
 */
const getPackageJsonPath = () => {
  const currentDir = __dirname;
  if (currentDir.includes('dist')) {
    return resolve(currentDir, '../../package.json');
  }
  return resolve(currentDir, '../../package.json');
};

/**
 * 生成带随机码的版本号
 * 格式：1.125.12-XXXXXX
 * 1: 大版本号（固定）
 * 125: 小版本号 = "1" + 年份后两位（2025 -> "25"） = "1" + "25" = "125"
 * 12: 编译月份
 * XXXXXX: 6位随机码
 */
export function generateVersion(): string {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 月份从0开始，需要+1
    
    // 计算小版本号：字符串拼接 "1" + 年份后两位
    const yearLastTwo = (year % 100).toString().padStart(2, '0'); // 2025 -> "25"
    const minorVersion = `1${yearLastTwo}`; // "1" + "25" = "125"
    
    // 生成6位随机码
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6位随机码
    
    // 格式：1.125.12(XXXXXX)
    return `1.${minorVersion}.${month.toString().padStart(2, '0')}(${randomCode})`;
  } catch (error) {
    console.error('生成版本号失败:', error);
    return '1.0.0-UNKNOWN';
  }
}

/**
 * 获取当前版本号
 */
export function getVersion(): string {
  try {
    if (existsSync(VERSION_FILE)) {
      const versionData = JSON.parse(readFileSync(VERSION_FILE, 'utf-8'));
      return versionData.version || '0.0.0-UNKNOWN';
    }
    // 如果版本文件不存在，尝试生成一个（开发环境）
    const version = generateVersion();
    saveVersion(version);
    return version;
  } catch (error) {
    console.error('读取版本号失败:', error);
    return '0.0.0-UNKNOWN';
  }
}

/**
 * 获取版本信息（包含版本号和编译时间）
 */
export function getVersionInfo(): { version: string; buildTime?: string } {
  try {
    if (existsSync(VERSION_FILE)) {
      const versionData = JSON.parse(readFileSync(VERSION_FILE, 'utf-8'));
      return {
        version: versionData.version || '0.0.0-UNKNOWN',
        buildTime: versionData.buildTime,
      };
    }
    // 如果版本文件不存在，尝试生成一个（开发环境）
    const version = generateVersion();
    saveVersion(version);
    const versionData = JSON.parse(readFileSync(VERSION_FILE, 'utf-8'));
    return {
      version: versionData.version || '0.0.0-UNKNOWN',
      buildTime: versionData.buildTime,
    };
  } catch (error) {
    console.error('读取版本信息失败:', error);
    return { version: '0.0.0-UNKNOWN' };
  }
}

/**
 * 保存版本号到文件
 */
export function saveVersion(version: string): void {
  try {
    const versionData = {
      version,
      buildTime: new Date().toISOString(),
    };
    writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2), 'utf-8');
    console.log(`📦 后端版本号已保存: ${version}`);
  } catch (error) {
    console.error('保存版本号失败:', error);
  }
}

/**
 * 在构建时生成版本号（用于构建脚本）
 */
if (require.main === module) {
  const version = generateVersion();
  saveVersion(version);
  console.log(`✅ 版本号生成完成: ${version}`);
}

