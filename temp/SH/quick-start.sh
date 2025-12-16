#!/bin/bash

echo "=================================="
echo "KnowBooks 快速启动脚本"
echo "=================================="
echo ""

# 检查Docker是否运行
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker 未运行"
    echo "请先启动 Docker Desktop"
    exit 1
fi

echo "✅ Docker 正在运行"
echo ""

# 检查是否有镜像
BACKEND_IMAGE=$(docker images | grep "knowbooks.*backend" | wc -l)
FRONTEND_IMAGE=$(docker images | grep "knowbooks.*frontend" | wc -l)

if [ $BACKEND_IMAGE -eq 0 ] || [ $FRONTEND_IMAGE -eq 0 ]; then
    echo "📦 需要构建镜像..."
    echo ""
    
    # 检查镜像源
    echo "检查 Docker 镜像源配置..."
    MIRRORS=$(docker info | grep -A 2 "Registry Mirrors" | grep "http")
    
    if echo "$MIRRORS" | grep -q "tuna.tsinghua.edu.cn"; then
        echo ""
        echo "⚠️  检测到清华镜像源，可能无法访问"
        echo "建议运行修复脚本："
        echo "  ./docker-fix-registry.sh"
        echo ""
        read -p "是否继续尝试构建？(y/n): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    echo "开始构建镜像..."
    docker-compose build
    
    if [ $? -ne 0 ]; then
        echo ""
        echo "❌ 构建失败"
        echo ""
        echo "可能的原因："
        echo "1. Docker 镜像源无法访问"
        echo "   解决：运行 ./docker-fix-registry.sh 查看修复指南"
        echo ""
        echo "2. 网络问题"
        echo "   解决：检查网络连接，或使用 VPN"
        echo ""
        echo "3. 磁盘空间不足"
        echo "   解决：清理 Docker 缓存 'docker system prune -a'"
        exit 1
    fi
else
    echo "✅ 镜像已存在"
fi

echo ""
echo "🚀 启动服务..."
docker-compose up -d

if [ $? -eq 0 ]; then
    echo ""
    echo "=================================="
    echo "✅ 启动成功！"
    echo "=================================="
    echo ""
    echo "📊 服务状态："
    docker-compose ps
    echo ""
    echo "🌐 访问地址："
    echo "  前端: http://localhost:1280"
    echo "  后端: http://localhost:1201"
    echo ""
    echo "📝 查看日志："
    echo "  docker-compose logs -f"
    echo ""
    echo "🔧 常用命令："
    echo "  停止: docker-compose down"
    echo "  重启: docker-compose restart"
    echo "  查看状态: docker-compose ps"
    echo ""
else
    echo ""
    echo "❌ 启动失败"
    echo "查看日志: docker-compose logs"
    exit 1
fi
