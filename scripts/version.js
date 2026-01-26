#!/usr/bin/env node

/**
 * @file version.js
 * @description 统一版本号管理工具
 * 
 * 使用语义化版本号 (SemVer): MAJOR.MINOR.PATCH
 * 单一真实来源：根目录 package.json
 * 
 * 使用方法：
 *   node scripts/version.js                    # 显示当前版本
 *   node scripts/version.js patch              # 增加 PATCH 版本 (2.0.26 -> 2.0.27)
 *   node scripts/version.js minor              # 增加 MINOR 版本 (2.0.26 -> 2.1.0)
 *   node scripts/version.js major              # 增加 MAJOR 版本 (2.0.26 -> 3.0.0)
 *   node scripts/version.js set 2.1.0          # 设置特定版本号
 *   node scripts/version.js sync               # 同步版本号到所有组件
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ROOT_PACKAGE_JSON = path.join(PROJECT_ROOT, 'package.json');
const BACKEND_PACKAGE_JSON = path.join(PROJECT_ROOT, 'backend', 'package.json');
const FRONTEND_PACKAGE_JSON = path.join(PROJECT_ROOT, 'frontend', 'package.json');
const BACKEND_VERSION_JSON = path.join(PROJECT_ROOT, 'backend', 'version.json');
const TTS_API_VERSION_JSON = path.join(PROJECT_ROOT, 'tts-api', 'version.json');
const TTS_API_LITE_VERSION_JSON = path.join(PROJECT_ROOT, 'tts-api-lite', 'version.json');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 读取 JSON 文件
function readJson(filePath) {
  try {
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

// 解析版本号
function parseVersion(version) {
  const parts = version.split('.');
  return {
    major: parseInt(parts[0] || '0', 10),
    minor: parseInt(parts[1] || '0', 10),
    patch: parseInt(parts[2] || '0', 10),
  };
}

// 格式化版本号
function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

// 增加版本号
function incrementVersion(version, type) {
  const parsed = parseVersion(version);
  
  switch (type) {
    case 'major':
      parsed.major += 1;
      parsed.minor = 0;
      parsed.patch = 0;
      break;
    case 'minor':
      parsed.minor += 1;
      parsed.patch = 0;
      break;
    case 'patch':
      parsed.patch += 1;
      break;
    default:
      throw new Error(`未知的版本类型: ${type}`);
  }
  
  return formatVersion(parsed);
}

// 获取当前版本号（从根目录 package.json）
function getCurrentVersion() {
  const pkg = readJson(ROOT_PACKAGE_JSON);
  if (!pkg || !pkg.version) {
    throw new Error('无法读取根目录 package.json 中的版本号');
  }
  return pkg.version;
}

// 设置根目录版本号
function setRootVersion(version) {
  const pkg = readJson(ROOT_PACKAGE_JSON);
  if (!pkg) {
    throw new Error('无法读取根目录 package.json');
  }
  pkg.version = version;
  writeJson(ROOT_PACKAGE_JSON, pkg);
  log(`✅ 根目录版本号已更新: ${version}`, 'green');
}

// 同步版本号到所有组件
function syncVersion(version) {
  log(`\n🔄 同步版本号到所有组件: ${version}`, 'blue');
  
  // 1. 更新后端 package.json
  const backendPkg = readJson(BACKEND_PACKAGE_JSON);
  if (backendPkg) {
    backendPkg.version = version;
    writeJson(BACKEND_PACKAGE_JSON, backendPkg);
    log(`  ✅ backend/package.json`, 'green');
  }
  
  // 2. 更新前端 package.json
  const frontendPkg = readJson(FRONTEND_PACKAGE_JSON);
  if (frontendPkg) {
    frontendPkg.version = version;
    writeJson(FRONTEND_PACKAGE_JSON, frontendPkg);
    log(`  ✅ frontend/package.json`, 'green');
  }
  
  // 3. 更新后端 version.json
  const backendVersion = {
    version,
    buildTime: new Date().toISOString(),
  };
  writeJson(BACKEND_VERSION_JSON, backendVersion);
  log(`  ✅ backend/version.json`, 'green');
  
  // 4. 更新 TTS API version.json（如果存在）
  if (fs.existsSync(TTS_API_VERSION_JSON)) {
    const ttsVersion = {
      version,
      buildTime: new Date().toISOString(),
    };
    writeJson(TTS_API_VERSION_JSON, ttsVersion);
    log(`  ✅ tts-api/version.json`, 'green');
  }
  
  // 5. 更新 TTS API Lite version.json（如果存在）
  if (fs.existsSync(TTS_API_LITE_VERSION_JSON)) {
    const ttsLiteVersion = {
      version,
      buildTime: new Date().toISOString(),
    };
    writeJson(TTS_API_LITE_VERSION_JSON, ttsLiteVersion);
    log(`  ✅ tts-api-lite/version.json`, 'green');
  }
  
  log(`\n✅ 版本号同步完成！`, 'green');
}

// 显示当前版本
function showVersion() {
  const version = getCurrentVersion();
  log(`\n📦 当前版本号: ${version}`, 'bright');
  
  // 检查各组件版本是否一致
  log('\n📋 各组件版本检查:', 'blue');
  
  const backendPkg = readJson(BACKEND_PACKAGE_JSON);
  const frontendPkg = readJson(FRONTEND_PACKAGE_JSON);
  const backendVersion = readJson(BACKEND_VERSION_JSON);
  
  const components = [
    { name: '根目录 package.json', version: version },
    { name: 'backend/package.json', version: backendPkg?.version },
    { name: 'frontend/package.json', version: frontendPkg?.version },
    { name: 'backend/version.json', version: backendVersion?.version },
  ];
  
  let allSynced = true;
  components.forEach(({ name, version: compVersion }) => {
    if (compVersion === version) {
      log(`  ✅ ${name}: ${compVersion}`, 'green');
    } else {
      log(`  ⚠️  ${name}: ${compVersion || '未找到'} (期望: ${version})`, 'yellow');
      allSynced = false;
    }
  });
  
  if (!allSynced) {
    log('\n⚠️  检测到版本号不一致，建议运行: node scripts/version.js sync', 'yellow');
  } else {
    log('\n✅ 所有组件版本号已同步', 'green');
  }
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  try {
    switch (command) {
      case 'patch':
      case 'minor':
      case 'major': {
        const currentVersion = getCurrentVersion();
        const newVersion = incrementVersion(currentVersion, command);
        log(`\n📦 版本号更新: ${currentVersion} -> ${newVersion}`, 'blue');
        setRootVersion(newVersion);
        syncVersion(newVersion);
        break;
      }
      
      case 'set': {
        const version = args[1];
        if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
          log('❌ 无效的版本号格式，请使用 MAJOR.MINOR.PATCH (例如: 2.1.0)', 'red');
          process.exit(1);
        }
        log(`\n📦 设置版本号: ${version}`, 'blue');
        setRootVersion(version);
        syncVersion(version);
        break;
      }
      
      case 'sync': {
        const version = getCurrentVersion();
        syncVersion(version);
        break;
      }
      
      case undefined:
      case 'show':
      case 'current': {
        showVersion();
        break;
      }
      
      default: {
        log('❌ 未知命令', 'red');
        log('\n使用方法:', 'yellow');
        log('  node scripts/version.js                    # 显示当前版本');
        log('  node scripts/version.js patch              # 增加 PATCH 版本');
        log('  node scripts/version.js minor              # 增加 MINOR 版本');
        log('  node scripts/version.js major              # 增加 MAJOR 版本');
        log('  node scripts/version.js set 2.1.0          # 设置特定版本号');
        log('  node scripts/version.js sync               # 同步版本号到所有组件');
        process.exit(1);
      }
    }
  } catch (error) {
    log(`\n❌ 错误: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
