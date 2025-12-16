#!/bin/bash

# 在远程服务器上创建 PWA 图标
# 使用 ImageMagick 或下载临时图标

echo "========================================" 
echo "创建 PWA 图标（远程服务器）"
echo "========================================"
echo ""

# 目标目录（容器内）
CONTAINER_NAME="knowbooks-frontend"
ICON_DIR="/usr/share/nginx/html"

echo "📦 容器名称: $CONTAINER_NAME"
echo "📁 图标目录: $ICON_DIR"
echo ""

# 检查容器是否运行
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "❌ 错误：容器 $CONTAINER_NAME 未运行"
    exit 1
fi

echo "=== 方案1: 使用 ImageMagick 生成图标 ==="
echo ""

# 检查容器内是否有 ImageMagick
if docker exec $CONTAINER_NAME which convert > /dev/null 2>&1; then
    echo "✅ 容器内已安装 ImageMagick"
    echo ""
    echo "生成图标..."
    
    # 在容器内生成图标
    docker exec $CONTAINER_NAME sh -c "
        cd $ICON_DIR
        
        # 生成 192x192 图标（蓝色渐变背景）
        convert -size 192x192 xc:'#4F46E5' pwa-192x192.png
        
        # 生成 512x512 图标
        convert -size 512x512 xc:'#7C3AED' pwa-512x512.png
        
        # 生成 favicon
        convert -size 32x32 xc:'#4F46E5' favicon.ico
        
        ls -lh pwa-*.png favicon.ico 2>/dev/null || true
    "
    
    echo ""
    echo "✅ 图标生成完成！"
else
    echo "⚠️  容器内未安装 ImageMagick"
    echo ""
    echo "=== 方案2: 创建简单的纯色PNG ==="
    echo ""
    
    # 使用base64创建简单的PNG（在容器内）
    docker exec $CONTAINER_NAME sh -c "
        cd $ICON_DIR
        
        # 一个最小的蓝色PNG（base64）
        echo 'iVBORw0KGgoAAAANSUhEUgAAAMAAAADAAQMAAABoEv5EAAAABlBMVEVPRuV8Ou0qVCl1AAAAy0lEQVRYw+3WMQ6AIBBFUbfxNrANx+U4tocDdsRaK03MUoig84qf6P4kMD8AAAAAAAAAAADgvxQ0bMo2FdO0zdVxg5qGTdmmYpq2uTpuUNOwKdtUTNM2V8cNaho2ZZuKadrm6rhBTcOmbFMxTdtcHTeoadiUbSqmaZur4wY1DZuyTcU0bXN13KCmYVO2qZimba6OG9Q0bMo2FdO0zdVxg5qGTdmmYpq2uTpuUNOwKdtUTNM2V8cNaho2ZZuKadrm6rhBTcOmbFMxTdtcHTcAAAD4tQsHOwMDbOT3SQAAAABJRU5ErkJggg==' | base64 -d > pwa-192x192.png
        
        # 复制到512版本
        cp pwa-192x192.png pwa-512x512.png
        
        ls -lh pwa-*.png 2>/dev/null || true
    "
    
    echo ""
    echo "✅ 简单图标创建完成！"
fi

echo ""
echo "=== 验证图标 ==="
docker exec $CONTAINER_NAME sh -c "
    cd $ICON_DIR
    
    echo '检查文件：'
    ls -lh pwa-*.png 2>/dev/null || echo '❌ PNG文件不存在'
    
    echo ''
    echo '检查PNG文件头（前4字节应该是: 89 50 4e 47）：'
    if [ -f pwa-192x192.png ]; then
        xxd -l 4 pwa-192x192.png || od -t x1 -N 4 pwa-192x192.png || echo '无法检查文件头'
    fi
"

echo ""
echo "========================================" 
echo "测试访问"
echo "========================================"
echo ""

echo "测试前端图标访问..."
curl -I http://localhost:1280/pwa-192x192.png 2>&1 | head -10

echo ""
echo "========================================" 
echo "完成！"
echo "========================================" 
echo ""
echo "✅ PWA图标已创建在前端容器中"
echo ""
echo "🌐 可以通过以下URL访问："
echo "   http://localhost:1280/pwa-192x192.png"
echo "   http://localhost:1280/pwa-512x512.png"
echo ""
echo "⚠️  注意事项："
echo "   1. 当前图标是简单占位符"
echo "   2. 建议替换为自定义logo"
echo "   3. 如果重建容器，需要重新执行此脚本"
echo ""
echo "💡 持久化方案："
echo "   1. 在本地 frontend/public/ 目录创建图标"
echo "   2. 重新构建前端镜像："
echo "      docker-compose build frontend --no-cache"
echo "      docker-compose up -d frontend"
echo ""
echo "========================================"
