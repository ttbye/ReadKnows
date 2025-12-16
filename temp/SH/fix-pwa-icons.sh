#!/bin/bash

echo "=================================="
echo "PWA图标快速修复"
echo "=================================="
echo ""

PUBLIC_DIR="frontend/public"

echo "📁 检查public目录..."
if [ ! -d "$PUBLIC_DIR" ]; then
    mkdir -p "$PUBLIC_DIR"
    echo "✅ 已创建 $PUBLIC_DIR"
fi

echo ""
echo "📝 当前状态："
ls -lh "$PUBLIC_DIR"/pwa-*.png 2>/dev/null || echo "❌ 未找到PWA图标"
echo ""

echo "🔧 解决方案选择："
echo ""
echo "1. 使用在线工具生成（推荐）"
echo "   https://realfavicongenerator.net/"
echo ""
echo "2. 从其他项目复制示例图标"
echo ""
echo "3. 临时禁用PWA图标要求（开发用）"
echo ""

read -p "请选择 (1/2/3): " choice

case $choice in
  1)
    echo ""
    echo "📖 步骤："
    echo "1. 在浏览器中打开: https://realfavicongenerator.net/"
    echo "2. 上传一张正方形Logo图片"
    echo "3. 配置PWA选项"
    echo "4. 下载生成的图标包"
    echo "5. 运行以下命令（替换路径）："
    echo ""
    echo "   cp ~/Downloads/favicon_package/pwa-192x192.png $PUBLIC_DIR/"
    echo "   cp ~/Downloads/favicon_package/pwa-512x512.png $PUBLIC_DIR/"
    echo "   cp ~/Downloads/favicon_package/apple-touch-icon.png $PUBLIC_DIR/"
    echo ""
    ;;
  
  2)
    echo ""
    echo "💡 查找示例图标..."
    # 尝试从常见位置复制
    ICON_FOUND=0
    
    # 检查是否有其他React项目的图标
    for dir in ~/Projects/*/public ~/Code/*/public; do
        if [ -f "$dir/logo192.png" ]; then
            echo "找到示例图标: $dir"
            read -p "是否从此处复制？(y/n): " -n 1 -r
            echo ""
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                cp "$dir/logo192.png" "$PUBLIC_DIR/pwa-192x192.png" 2>/dev/null && echo "✅ 已复制 192x192"
                cp "$dir/logo512.png" "$PUBLIC_DIR/pwa-512x512.png" 2>/dev/null && echo "✅ 已复制 512x512"
                ICON_FOUND=1
                break
            fi
        fi
    done
    
    if [ $ICON_FOUND -eq 0 ]; then
        echo "❌ 未找到可用的示例图标"
        echo "请使用方案1或方案3"
    fi
    ;;
  
  3)
    echo ""
    echo "⚠️  临时禁用PWA（仅用于开发测试）"
    echo ""
    echo "编辑 frontend/vite.config.ts："
    echo ""
    echo "将 VitePWA 插件部分注释掉："
    echo ""
    cat << 'EOF'
// VitePWA({
//   registerType: 'autoUpdate',
//   manifest: { ... }
// }),
EOF
    echo ""
    echo "注意：这只是临时方案，生产环境需要正确的图标"
    ;;
  
  *)
    echo "❌ 无效选择"
    exit 1
    ;;
esac

echo ""
echo "=================================="
echo "✅ 下一步"
echo "=================================="
echo ""
echo "生成图标后，重新构建："
echo "  cd frontend && npm run build"
echo ""
echo "或重新部署Docker："
echo "  docker-compose build frontend --no-cache"
echo "  docker-compose up -d"
echo ""
echo "📖 详细文档: PWA_ICONS_SETUP.md"
echo ""
