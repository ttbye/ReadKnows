#!/bin/bash

echo "================================================"
echo "KnowBooks 一键修复脚本"
echo "================================================"
echo ""

cd "$(dirname "$0")"

echo "🔍 正在诊断问题..."
echo ""

# 1. 检查Docker
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker未运行"
    echo "请先启动 Docker Desktop"
    exit 1
fi
echo "✅ Docker 正常运行"

# 2. 检查容器状态
CONTAINERS=$(docker-compose ps -q)
if [ -z "$CONTAINERS" ]; then
    echo "⚠️  容器未运行"
    NEED_START=1
else
    echo "✅ 发现运行中的容器"
    NEED_START=0
fi

# 3. 检查PWA图标
echo ""
echo "🖼️  检查PWA图标..."
if [ ! -f "frontend/public/pwa-192x192.png" ] || [ ! -f "frontend/public/pwa-512x512.png" ]; then
    echo "❌ PWA图标缺失"
    echo ""
    echo "📖 请查看 PWA_ICONS_SETUP.md 了解如何生成图标"
    echo ""
    echo "快速解决方案："
    echo "  1. 访问 https://realfavicongenerator.net/"
    echo "  2. 上传Logo并生成图标"
    echo "  3. 下载后复制到 frontend/public/"
    echo ""
    read -p "已生成图标？按Enter继续，或Ctrl+C退出: "
else
    echo "✅ PWA图标已存在"
fi

# 4. 检查Docker镜像源
echo ""
echo "🔍 检查Docker镜像源..."
MIRRORS=$(docker info 2>/dev/null | grep -A 2 "Registry Mirrors" | grep "http")
if echo "$MIRRORS" | grep -q "tuna.tsinghua.edu.cn"; then
    echo "⚠️  检测到清华镜像源（可能无法访问）"
    echo ""
    echo "建议修复Docker镜像源配置："
    echo "  ./docker-fix-registry.sh"
    echo ""
    read -p "是否继续尝试启动？(y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 5. 启动或重启服务
echo ""
echo "🚀 启动服务..."
echo ""

if [ $NEED_START -eq 1 ]; then
    echo "正在构建和启动容器..."
    docker-compose up -d --build
else
    echo "正在重启容器..."
    docker-compose restart
fi

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 启动失败"
    echo ""
    echo "可能的原因："
    echo "  1. Docker镜像源无法访问 -> 运行 ./docker-fix-registry.sh"
    echo "  2. 端口被占用 -> 检查端口1201和1280"
    echo "  3. 编译错误 -> 检查代码"
    echo ""
    echo "查看详细日志："
    echo "  docker-compose logs backend"
    echo ""
    exit 1
fi

# 6. 等待服务启动
echo ""
echo "⏳ 等待服务启动..."
sleep 5

# 7. 检查后端健康
echo ""
echo "🏥 检查后端健康状态..."
for i in {1..30}; do
    if curl -s http://localhost:1201/api/health > /dev/null 2>&1; then
        echo "✅ 后端服务正常"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ 后端服务未响应"
        echo ""
        echo "查看日志："
        echo "  docker-compose logs backend | tail -50"
        exit 1
    fi
    echo "   等待中... ($i/30)"
    sleep 1
done

# 8. 显示状态
echo ""
echo "================================================"
echo "✅ 服务启动成功！"
echo "================================================"
echo ""
echo "📊 服务状态："
docker-compose ps
echo ""
echo "🌐 访问地址："
echo "  本地前端: http://localhost:1280"
echo "  本地后端: http://localhost:1201"
echo "  外部访问: https://vlistttbye.i234.me:12280"
echo ""
echo "📝 查看日志："
echo "  docker-compose logs -f"
echo ""
echo "🔧 其他工具："
echo "  ./check-covers.sh     - 检查封面状态"
echo "  ./fix-pwa-icons.sh    - 修复PWA图标"
echo "  ./test-auto-import.sh - 测试自动导入"
echo ""
echo "📖 详细文档："
echo "  DOCKER_502_FIX.md        - 502错误修复"
echo "  PWA_ICONS_SETUP.md       - PWA图标设置"
echo "  DOCKER_TROUBLESHOOTING.md - 故障排除"
echo ""
