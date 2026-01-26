/**
 * @file version.ts
 * @author ttbye
 * @description 版本号管理工具
 * 
 * 统一从根目录 package.json 读取版本号（单一真实来源）
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// 获取项目根目录的 package.json 路径（单一真实来源）
const getRootPackageJsonPath = () => {
  const currentDir = __dirname;
  // 如果在 dist/utils 中，需要回到项目根目录
  if (currentDir.includes('dist')) {
    return resolve(currentDir, '../../../package.json');
  }
  // 如果在 src/utils 中，需要回到项目根目录
  return resolve(currentDir, '../../../package.json');
};

// 获取 backend/version.json 路径（用于保存构建时间）
const getVersionFilePath = () => {
  const currentDir = __dirname;
  if (currentDir.includes('dist')) {
    return resolve(currentDir, '../../version.json');
  }
  return resolve(currentDir, '../../version.json');
};

const ROOT_PACKAGE_JSON = getRootPackageJsonPath();
const VERSION_FILE = getVersionFilePath();

/**
 * 从根目录 package.json 读取版本号（单一真实来源）
 */
function getVersionFromRootPackage(): string {
  try {
    if (existsSync(ROOT_PACKAGE_JSON)) {
      const pkg = JSON.parse(readFileSync(ROOT_PACKAGE_JSON, 'utf-8'));
      return pkg.version || '0.0.0-UNKNOWN';
    }
  } catch (error) {
    console.error('读取根目录 package.json 失败:', error);
  }
  return '0.0.0-UNKNOWN';
}

/**
 * 获取当前版本号（从根目录 package.json）
 */
export function getVersion(): string {
  try {
    // 优先从根目录 package.json 读取（单一真实来源）
    const version = getVersionFromRootPackage();
    
    // 同时更新 backend/version.json（用于保存构建时间）
    if (version !== '0.0.0-UNKNOWN') {
      saveVersion(version);
    }
    
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
    // 从根目录 package.json 读取版本号
    const version = getVersionFromRootPackage();
    
    // 读取或创建 version.json（用于保存构建时间）
    let buildTime: string | undefined;
    if (existsSync(VERSION_FILE)) {
      try {
        const versionData = JSON.parse(readFileSync(VERSION_FILE, 'utf-8'));
        buildTime = versionData.buildTime;
      } catch (e) {
        // 忽略读取错误
      }
    }
    
    // 如果没有构建时间，创建新的
    if (!buildTime) {
      buildTime = new Date().toISOString();
      saveVersion(version);
    }
    
    return {
      version: version !== '0.0.0-UNKNOWN' ? version : '0.0.0-UNKNOWN',
      buildTime,
    };
  } catch (error) {
    console.error('读取版本信息失败:', error);
    return { version: '0.0.0-UNKNOWN' };
  }
}

/**
 * 保存版本号到 backend/version.json（用于保存构建时间）
 */
export function saveVersion(version: string): void {
  try {
    const versionData = {
      version,
      buildTime: new Date().toISOString(),
    };
    writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2), 'utf-8');
  } catch (error) {
    console.error('保存版本号失败:', error);
  }
}

