#!/usr/bin/env node

/**
 * 更新 Android 应用的版本号
 * 从 package.json 读取版本号并更新到 android/app/build.gradle
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取 package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const buildGradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ package.json 不存在');
  process.exit(1);
}

if (!fs.existsSync(buildGradlePath)) {
  console.error('❌ android/app/build.gradle 不存在');
  process.exit(1);
}

// 读取 package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

if (!version) {
  console.error('❌ package.json 中没有 version 字段');
  process.exit(1);
}

// 解析版本号
// 格式: 0.2025.12 或 1.0.0
const versionParts = version.split('.');
let versionCode, versionName;

if (versionParts.length >= 2) {
  // 将版本号转换为 versionCode（整数）
  // 例如: 0.2025.12 -> versionCode: 202512 (去掉前导0)
  // 或者: 1.0.0 -> versionCode: 100
  const major = parseInt(versionParts[0] || '0', 10);
  const minor = parseInt(versionParts[1] || '0', 10);
  const patch = parseInt(versionParts[2] || '0', 10);
  
  // 计算 versionCode: major * 10000 + minor * 100 + patch
  // 或者对于 0.2025.12 这种格式，使用: 2025 * 100 + 12 = 202512
  if (major === 0 && minor >= 2000) {
    // 特殊格式: 0.2025.12 -> 202512
    versionCode = minor * 100 + patch;
  } else {
    // 标准格式: 1.0.0 -> 10000
    versionCode = major * 10000 + minor * 100 + patch;
  }
  
  versionName = version;
} else {
  versionCode = 1;
  versionName = version;
}

console.log(`📦 从 package.json 读取版本: ${version}`);
console.log(`   versionCode: ${versionCode}`);
console.log(`   versionName: ${versionName}`);

// 读取 build.gradle
let buildGradle = fs.readFileSync(buildGradlePath, 'utf8');

// 更新 versionCode
buildGradle = buildGradle.replace(
  /versionCode\s+\d+/,
  `versionCode ${versionCode}`
);

// 更新 versionName
buildGradle = buildGradle.replace(
  /versionName\s+"[^"]*"/,
  `versionName "${versionName}"`
);

// 写入文件
fs.writeFileSync(buildGradlePath, buildGradle, 'utf8');

console.log('✅ Android 版本号已更新');
console.log(`   文件: ${buildGradlePath}`);
