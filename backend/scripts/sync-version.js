#!/usr/bin/env node

/**
 * @file sync-version.js
 * @description 在 Docker 构建时同步版本号（简化版，不依赖外部脚本）
 * 
 * 从根目录 package.json 读取版本号，同步到 backend/package.json 和 backend/version.json
 */

const fs = require('fs');
const path = require('path');

// 获取项目根目录（从 backend 目录向上）
const BACKEND_DIR = __dirname.includes('dist') 
  ? path.resolve(__dirname, '../..')
  : path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(BACKEND_DIR, '..');
const ROOT_PACKAGE_JSON = path.join(PROJECT_ROOT, 'package.json');
const BACKEND_PACKAGE_JSON = path.join(BACKEND_DIR, 'package.json');
const BACKEND_VERSION_JSON = path.join(BACKEND_DIR, 'version.json');

// 读取 JSON 文件
function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

// 写入 JSON 文件
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// 获取根目录版本号
function getRootVersion() {
  // 尝试项目根目录的 package.json（本地开发时）
  const rootPkg = readJson(ROOT_PACKAGE_JSON);
  if (rootPkg && rootPkg.version) {
    return rootPkg.version;
  }
  
  // Docker 构建时，根目录 package.json 不在构建上下文中
  // 使用 backend/package.json 中的版本号（应该已经同步过了）
  const backendPkg = readJson(BACKEND_PACKAGE_JSON);
  if (backendPkg && backendPkg.version) {
    return backendPkg.version;
  }
  
  return '0.0.0';
}

// 同步版本号
function syncVersion() {
  const version = getRootVersion();
  
  // 更新 backend/package.json
  const backendPkg = readJson(BACKEND_PACKAGE_JSON);
  if (backendPkg) {
    backendPkg.version = version;
    writeJson(BACKEND_PACKAGE_JSON, backendPkg);
  }
  
  // 更新 backend/version.json
  const versionData = {
    version,
    buildTime: new Date().toISOString(),
  };
  writeJson(BACKEND_VERSION_JSON, versionData);
  
  console.log(`📦 版本号已同步: ${version}`);
}

syncVersion();
