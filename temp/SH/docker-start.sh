#!/bin/bash

# Docker 快速启动脚本

set -e

echo "=========================================="
echo "KnowBooks Docker 部署脚本"
echo "=========================================="

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi

# 检查Docker Compose是否安装
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "错误: 未找到 Docker Compose，请先安装 Docker Compose"
    exit 1
fi

# 检查环境变量文件
if [ ! -f .env ]; then
    echo "警告: 未找到 .env 文件"
    if [ -f .env.example ]; then
        echo "正在从 .env.example 创建 .env 文件..."
        cp .env.example .env
        echo ""
        echo "⚠️  重要: 请编辑 .env 文件，设置 JWT_SECRET 等配置"
        echo "   特别是 JWT_SECRET，必须设置为一个强随机字符串"
        echo ""
        echo "按 Enter 继续（将使用默认配置），或 Ctrl+C 取消并编辑 .env 文件..."
        read
    else
        echo "错误: 未找到 .env.example 文件"
        echo "正在创建 .env.example 文件..."
        cat > .env.example << 'ENVEOF'
# JWT配置
JWT_SECRET=change-this-secret-key-in-production-please-use-a-strong-random-string
JWT_EXPIRES_IN=7d

# 豆瓣API配置（可选）
DOUBAN_API_BASE=

# AI配置（可选）
AI_PROVIDER=ollama
AI_API_URL=http://192.168.6.14:11434
AI_API_KEY=
AI_MODEL=llama2
ENVEOF
        cp .env.example .env
        echo "已创建 .env.example 和 .env 文件"
        echo "⚠️  重要: 请编辑 .env 文件，设置 JWT_SECRET 等配置"
        echo "按 Enter 继续（将使用默认配置），或 Ctrl+C 取消并编辑 .env 文件..."
        read
    fi
fi

# 创建必要的目录
echo "创建必要的目录..."
mkdir -p backend/data backend/books backend/covers backend/fonts

# 构建并启动
echo "构建并启动 Docker 容器..."
docker-compose up -d --build

# 等待服务启动
echo "等待服务启动..."
sleep 5

# 检查服务状态
echo ""
echo "=========================================="
echo "服务状态:"
echo "=========================================="
docker-compose ps

echo ""
echo "=========================================="
echo "初始化管理员账户"
echo "=========================================="
echo "是否现在初始化管理员账户? (y/n)"
read -r answer
if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    docker-compose exec backend node scripts/initAdmin.js
fi

echo ""
echo "=========================================="
echo "部署完成！"
echo "=========================================="
echo "前端地址: http://localhost"
echo "后端API: http://localhost/api"
echo ""
echo "查看日志: docker-compose logs -f"
echo "停止服务: docker-compose down"
echo "=========================================="

