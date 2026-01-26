#!/usr/bin/env node

/**
 * APK 配置脚本
 * 用于在生成 APK 时自定义应用名称和图标
 * 
 * 使用方法:
 *   1. 通过环境变量：
 *      APP_NAME="我的应用" APP_ICON_PATH="./custom-icon.png" node scripts/configure-apk.js
 *   
 *   2. 通过配置文件：
 *      创建 frontend/apk-config.json，然后运行：
 *      node scripts/configure-apk.js
 * 
 * 配置文件示例 (apk-config.json):
 * {
 *   "appName": "我的应用名称",
 *   "appIconPath": "./custom-icon.png"
 * }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configFilePath = path.join(__dirname, '../apk-config.json');
const stringsXmlPath = path.join(__dirname, '../android/app/src/main/res/values/strings.xml');
const capacitorConfigPath = path.join(__dirname, '../capacitor.config.ts');

/**
 * 读取配置
 */
function loadConfig() {
  // 优先使用环境变量
  const appName = process.env.APP_NAME;
  const appIconPath = process.env.APP_ICON_PATH;
  const applicationId = process.env.ANDROID_APPLICATION_ID;
  
  if (appName || appIconPath || applicationId) {
    return { appName, appIconPath, applicationId };
  }
  
  // 如果没有环境变量，尝试读取配置文件
  if (fs.existsSync(configFilePath)) {
    try {
      const configContent = fs.readFileSync(configFilePath, 'utf-8');
      const config = JSON.parse(configContent);
      return {
        appName: config.appName,
        appIconPath: config.appIconPath,
        applicationId: config.applicationId
      };
    } catch (error) {
      console.error('❌ 读取配置文件失败:', error.message);
      return null;
    }
  }
  
  return null;
}

/**
 * 更新 strings.xml 中的应用名称
 */
function updateStringsXml(appName) {
  if (!appName) return;
  
  try {
    let content = fs.readFileSync(stringsXmlPath, 'utf-8');
    
    // 更新 app_name
    content = content.replace(
      /<string name="app_name">.*?<\/string>/,
      `<string name="app_name">${appName}</string>`
    );
    
    // 更新 title_activity_main
    content = content.replace(
      /<string name="title_activity_main">.*?<\/string>/,
      `<string name="title_activity_main">${appName}</string>`
    );
    
    fs.writeFileSync(stringsXmlPath, content, 'utf-8');
    console.log(`✅ 已更新 Android strings.xml: ${appName}`);
  } catch (error) {
    console.error('❌ 更新 strings.xml 失败:', error.message);
    process.exit(1);
  }
}

/**
 * 更新 capacitor.config.ts 中的应用名称和包名
 */
function updateCapacitorConfig(appName, applicationId) {
  try {
    let content = fs.readFileSync(capacitorConfigPath, 'utf-8');
    
    // 更新 appName
    if (appName) {
      content = content.replace(
        /appName:\s*['"](.*?)['"]/,
        `appName: '${appName}'`
      );
      console.log(`✅ 已更新 capacitor.config.ts appName: ${appName}`);
    }
    
    // 更新 appId (包名)
    if (applicationId) {
      content = content.replace(
        /appId:\s*['"](.*?)['"]/,
        `appId: '${applicationId}'`
      );
      console.log(`✅ 已更新 capacitor.config.ts appId: ${applicationId}`);
    }
    
    fs.writeFileSync(capacitorConfigPath, content, 'utf-8');
  } catch (error) {
    console.error('❌ 更新 capacitor.config.ts 失败:', error.message);
    process.exit(1);
  }
}

/**
 * 验证图标文件是否存在
 */
function validateIconPath(iconPath) {
  if (!iconPath) return null;
  
  // 如果是相对路径，相对于 frontend 目录
  const absolutePath = path.isAbsolute(iconPath) 
    ? iconPath 
    : path.join(__dirname, '..', iconPath);
  
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ 图标文件不存在: ${absolutePath}`);
    console.error('💡 请确保图标文件路径正确');
    return null;
  }
  
  // 检查文件扩展名
  const ext = path.extname(absolutePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
    console.error(`❌ 不支持的图标格式: ${ext}`);
    console.error('💡 支持的格式: .png, .jpg, .jpeg');
    return null;
  }
  
  return absolutePath;
}

/**
 * 复制自定义图标到 public 目录
 */
function copyCustomIcon(iconPath) {
  if (!iconPath) return;
  
  const absolutePath = validateIconPath(iconPath);
  if (!absolutePath) {
    process.exit(1);
  }
  
  const publicDir = path.join(__dirname, '../public');
  const targetPath = path.join(publicDir, 'pwa-512x512.png');
  
  try {
    // 确保 public 目录存在
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // 复制文件
    fs.copyFileSync(absolutePath, targetPath);
    console.log(`✅ 已复制自定义图标: ${absolutePath} -> ${targetPath}`);
    console.log('💡 注意: 图标文件应为 512x512 像素的 PNG 格式，以获得最佳效果');
  } catch (error) {
    console.error('❌ 复制图标文件失败:', error.message);
    process.exit(1);
  }
}

/**
 * 主函数
 */
function main() {
  console.log('🔧 APK 配置工具');
  console.log('');
  
  const config = loadConfig();
  
  if (!config || (!config.appName && !config.appIconPath)) {
    console.log('ℹ️  未提供自定义配置，使用默认值');
    console.log('');
    console.log('💡 使用方法:');
    console.log('   1. 环境变量方式:');
    console.log('      APP_NAME="我的应用" APP_ICON_PATH="./custom-icon.png" node scripts/configure-apk.js');
    console.log('');
    console.log('   2. 配置文件方式:');
    console.log('      创建 frontend/apk-config.json:');
    console.log('      {');
    console.log('        "appName": "我的应用名称",');
    console.log('        "appIconPath": "./custom-icon.png"');
    console.log('      }');
    console.log('');
    return;
  }
  
  // 更新应用名称
  if (config.appName) {
    updateStringsXml(config.appName);
  }
  
  // 更新 Capacitor 配置（应用名称和包名）
  if (config.appName || config.applicationId) {
    updateCapacitorConfig(config.appName, config.applicationId);
  }
  
  // 处理图标
  if (config.appIconPath) {
    copyCustomIcon(config.appIconPath);
    console.log('💡 请运行图标生成脚本生成 Android 所需的各种尺寸:');
    console.log('   node scripts/generate-android-icons.js');
  }
  
  console.log('');
  console.log('✨ 配置完成！');
  console.log('');
}

// 运行主函数
main();
