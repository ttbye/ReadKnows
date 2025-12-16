#!/bin/bash

# 简单的PWA图标生成脚本
# 使用sips（macOS内置）或curl下载临时图标

set -e

echo "========================================" 
echo "生成 PWA 图标"
echo "========================================"
echo ""

TARGET_DIR="/Users/ttbye/MyCODE/KnowBooks/frontend/public"

# 检查目录是否存在
if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ 错误：目标目录不存在: $TARGET_DIR"
    exit 1
fi

echo "📁 目标目录: $TARGET_DIR"
echo ""

# 方案1: 如果有ImageMagick，使用convert命令
if command -v convert &> /dev/null; then
    echo "✅ 检测到 ImageMagick，使用 convert 生成图标"
    echo ""
    
    # 创建一个简单的蓝色渐变背景，中间白色文字
    echo "生成 192x192 图标..."
    convert -size 192x192 \
        -define gradient:angle=135 \
        gradient:'#4F46E5-#7C3AED' \
        -font Arial-Bold -pointsize 48 \
        -fill white -gravity center \
        -annotate +0+0 '📚\nBooks' \
        "$TARGET_DIR/pwa-192x192.png"
    
    echo "生成 512x512 图标..."
    convert -size 512x512 \
        -define gradient:angle=135 \
        gradient:'#4F46E5-#7C3AED' \
        -font Arial-Bold -pointsize 120 \
        -fill white -gravity center \
        -annotate +0+0 '📚\nBooks' \
        "$TARGET_DIR/pwa-512x512.png"
    
    echo "生成 favicon.ico..."
    convert "$TARGET_DIR/pwa-192x192.png" -resize 32x32 "$TARGET_DIR/favicon.ico"
    
    echo -e "\n✅ 使用 ImageMagick 生成成功！"

# 方案2: 如果在macOS，使用sips创建纯色图标
elif command -v sips &> /dev/null && [ "$(uname)" == "Darwin" ]; then
    echo "✅ 检测到 macOS，使用 sips 生成简单图标"
    echo ""
    
    # 创建临时PNG文件（纯蓝色）
    # 使用sips无法直接创建，所以我们用另一种方法
    echo "⚠️  sips 无法直接创建图标，请选择其他方案"
    echo ""
    echo "推荐使用方案3：下载临时图标"
    
# 方案3: 下载一个通用的书籍图标
else
    echo "未检测到 ImageMagick 或 sips"
fi

echo ""
echo "=== 方案3: 下载临时图标 ==="
echo ""

read -p "是否下载临时图标？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "下载 192x192 图标..."
    curl -L -o "$TARGET_DIR/pwa-192x192.png" \
        "https://via.placeholder.com/192x192/4F46E5/FFFFFF?text=Books"
    
    echo "下载 512x512 图标..."
    curl -L -o "$TARGET_DIR/pwa-512x512.png" \
        "https://via.placeholder.com/512x512/4F46E5/FFFFFF?text=Books"
    
    # 创建favicon（从192缩放）
    if command -v convert &> /dev/null; then
        convert "$TARGET_DIR/pwa-192x192.png" -resize 32x32 "$TARGET_DIR/favicon.ico"
    else
        echo "⚠️  无法生成 favicon.ico（需要 ImageMagick）"
    fi
    
    echo -e "\n✅ 临时图标下载成功！"
fi

echo ""
echo "========================================" 
echo "检查生成的文件"
echo "========================================"
ls -lh "$TARGET_DIR"/pwa-*.png "$TARGET_DIR"/favicon.ico 2>/dev/null || echo "部分文件未生成"

echo ""
echo "========================================" 
echo "下一步"
echo "========================================"
echo ""
echo "1. 重新构建前端镜像："
echo "   cd /volume5/docker/bookpath/install"
echo "   docker-compose build frontend --no-cache"
echo "   docker-compose up -d frontend"
echo ""
echo "2. 或者，如果想自定义图标："
echo "   - 访问 https://realfavicongenerator.net/"
echo "   - 上传你的logo图片"
echo "   - 下载生成的图标包"
echo "   - 复制到 frontend/public/ 目录"
echo ""
echo "3. 临时图标说明："
echo "   - 当前图标是简单的占位图"
echo "   - 建议后续替换为你自己的logo"
echo ""
echo "========================================"
