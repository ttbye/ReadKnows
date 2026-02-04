#!/usr/bin/env node

/**
 * 从 pwa-512x512.png 生成 Android 所需的各种尺寸的图标
 * 
 * 使用方法: node scripts/generate-android-icons.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 支持自定义图标源文件（通过环境变量或默认值）
// 注意：如果 configure-apk.js 已经复制了图标到 public/pwa-512x512.png，直接使用该文件
// 否则，尝试使用环境变量指定的自定义图标路径
const defaultIconPath = path.join(__dirname, '../public/pwa-512x512.png');
const customIconPath = process.env.APP_ICON_PATH 
  ? (path.isAbsolute(process.env.APP_ICON_PATH) 
      ? process.env.APP_ICON_PATH 
      : path.join(__dirname, '..', process.env.APP_ICON_PATH))
  : null;

// 优先使用默认图标路径（configure-apk.js 已经复制了自定义图标到这里）
// 如果默认路径不存在且指定了自定义路径，使用自定义路径
const sourceIcon = fs.existsSync(defaultIconPath)
  ? defaultIconPath
  : (customIconPath && fs.existsSync(customIconPath)
      ? customIconPath
      : defaultIconPath);

const androidResDir = path.join(__dirname, '../android/app/src/main/res');

// Android 图标尺寸定义
const iconSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// Adaptive icon foreground 尺寸
const adaptiveForegroundSize = 1024;

async function generateIcons() {
  try {
    // 检查源图标是否存在
    if (!fs.existsSync(sourceIcon)) {
      console.error(`❌ 源图标文件不存在: ${sourceIcon}`);
      process.exit(1);
    }

    console.log(`📱 开始生成 Android 图标...`);
    console.log(`   源图标: ${sourceIcon}`);
    if (customIconPath && customIconPath !== sourceIcon) {
      console.log(`   自定义图标路径: ${customIconPath}`);
    }

    // 尝试使用 sharp（推荐）
    let sharp;
    try {
      // 先尝试同步导入
      const sharpModule = require('sharp');
      sharp = sharpModule.default || sharpModule;
      console.log('✅ 使用同步导入的 sharp 库');
    } catch (syncError) {
      try {
        // 如果同步导入失败，尝试动态导入
        sharp = (await import('sharp')).default;
        console.log('✅ 使用动态导入的 sharp 库');
      } catch (dynamicError) {
        console.error('❌ 未找到 sharp 库');
        console.log('');
        console.log('💡 请安装 sharp 库:');
        console.log('   npm install --save-dev sharp');
        console.log('');
        console.log('   或者使用 ImageMagick:');
        console.log('   brew install imagemagick  # macOS');
        console.log('   apt-get install imagemagick  # Linux');
        process.exit(1);
      }
    }

    // 读取源图标
    const sourceImage = sharp(sourceIcon);
    const metadata = await sourceImage.metadata();
    console.log(`   源图标尺寸: ${metadata.width}x${metadata.height}`);

    // 生成各种尺寸的图标
    for (const [mipmapDir, size] of Object.entries(iconSizes)) {
      const outputDir = path.join(androidResDir, mipmapDir);
      const outputPath = path.join(outputDir, 'ic_launcher.png');
      const outputPathRound = path.join(outputDir, 'ic_launcher_round.png');

      // 确保目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 生成方形图标 - 使用 contain 模式确保图标完整显示，不会被裁剪
      // 添加适当的内边距（约15%）确保图标在圆形和方形裁剪时都能完整显示
      const padding = Math.max(1, Math.floor(size * 0.15)); // 至少 1 像素 padding
      const iconSize = Math.max(1, size - padding * 2);
      
      // 先缩放图标到安全区域大小（使用 contain 确保完整显示）
      const resizedIconBuffer = await sourceImage
        .clone()
        .resize(iconSize, iconSize, {
          fit: 'contain',
          position: 'center',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toBuffer();
      
      // 创建透明背景画布，将缩放后的图标居中放置
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
      .composite([{
        input: resizedIconBuffer,
        top: padding,
        left: padding
      }])
      .toFile(outputPath);

      // 生成圆形图标（实际上是方形，Android会自动裁剪为圆形）
      // 使用相同的逻辑确保图标完整显示
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
      .composite([{
        input: resizedIconBuffer,
        top: padding,
        left: padding
      }])
      .toFile(outputPathRound);

      console.log(`   ✅ ${mipmapDir}: ${size}x${size}`);
    }

    // 生成 adaptive icon foreground (1024x1024) - 需要生成到所有mipmap目录
    const foregroundSizes = {
      'mipmap-mdpi': 162,   // 108dp * 1.5
      'mipmap-hdpi': 216,   // 108dp * 2
      'mipmap-xhdpi': 324,  // 108dp * 3
      'mipmap-xxhdpi': 432, // 108dp * 4
      'mipmap-xxxhdpi': 648, // 108dp * 6
    };

    for (const [mipmapDir, size] of Object.entries(foregroundSizes)) {
      const foregroundDir = path.join(androidResDir, mipmapDir);
      const foregroundPath = path.join(foregroundDir, 'ic_launcher_foreground.png');

      // 确保目录存在
      if (!fs.existsSync(foregroundDir)) {
        fs.mkdirSync(foregroundDir, { recursive: true });
      }

      // 生成前景层（需要留出安全区域，适配adaptive icon）
      // Adaptive icon的安全区域是中心的66%，即左右上下各留17%
      // 为了确保图标在所有设备上完整显示，我们使用66%的安全区域大小
      const safeAreaSize = Math.max(1, Math.floor(size * 0.66)); // 安全区域大小（66%）
      const foregroundPadding = Math.floor((size - safeAreaSize) / 2); // 边距（17%）
      
      // 先缩放图标到安全区域大小（使用 contain 确保完整显示）
      const resizedForegroundBuffer = await sourceImage
        .clone()
        .resize(safeAreaSize, safeAreaSize, {
          fit: 'contain',
          position: 'center',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toBuffer();
      
      // 创建透明背景画布，将缩放后的图标居中放置在安全区域内
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
      .composite([{
        input: resizedForegroundBuffer,
        top: foregroundPadding,
        left: foregroundPadding
      }])
      .toFile(foregroundPath);
    }

    console.log(`   ✅ Adaptive Icon Foreground: 已生成所有尺寸`);
    console.log('');
    console.log('✨ Android 图标生成完成！');
    console.log('');
    console.log('📝 注意:');
    console.log('   - ic_launcher.png: 标准应用图标');
    console.log('   - ic_launcher_round.png: 圆形图标');
    console.log('   - ic_launcher_foreground.png: Adaptive Icon 前景层');
    console.log('   - Adaptive Icon 背景色在 values/ic_launcher_background.xml 中配置');

  } catch (error) {
    console.error('❌ 生成图标时出错:', error);
    process.exit(1);
  }
}

// 运行脚本
generateIcons();
