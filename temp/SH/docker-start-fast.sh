#!/bin/bash

# Docker 快速部署脚本（使用国内镜像源）
# 适用于中国大陆网络环境

set -e

echo "=========================================="
echo "KnowBooks Docker 快速部署脚本"
echo "使用国内镜像源加速部署"
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

# 创建临时 Dockerfile（启用国内镜像源）
echo "正在创建优化的 Dockerfile..."

# 备份原始文件
cp backend/Dockerfile backend/Dockerfile.bak
cp frontend/Dockerfile frontend/Dockerfile.bak

# 修改后端 Dockerfile 启用国内镜像
sed -i.tmp 's/# RUN sed -i/RUN sed -i/g' backend/Dockerfile
sed -i.tmp 's/# RUN npm config set registry/RUN npm config set registry/g' backend/Dockerfile

# 修改前端 Dockerfile 启用国内镜像
sed -i.tmp 's/# RUN npm config set registry/RUN npm config set registry/g' frontend/Dockerfile
sed -i.tmp 's/# RUN sed -i/RUN sed -i/g' frontend/Dockerfile

# 删除临时文件
rm -f backend/Dockerfile.tmp frontend/Dockerfile.tmp

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

# 询问是否清理 Docker 缓存
echo ""
echo "是否清理 Docker 构建缓存？(这会加快首次构建，但会删除所有 Docker 缓存)"
echo "1) 不清理（推荐，如果之前构建过）"
echo "2) 清理构建缓存"
echo "3) 深度清理（包括未使用的镜像）"
read -p "请选择 [1-3]: " clean_choice

case $clean_choice in
    2)
        echo "清理构建缓存..."
        docker builder prune -f
        ;;
    3)
        echo "深度清理..."
        docker system prune -a -f
        ;;
    *)
        echo "跳过清理..."
        ;;
esac

# 构建并启动
echo ""
echo "构建并启动 Docker 容器..."
echo "这可能需要几分钟时间，请耐心等待..."
docker-compose up -d --build

# 恢复原始 Dockerfile
echo ""
echo "恢复原始 Dockerfile..."
mv backend/Dockerfile.bak backend/Dockerfile
mv frontend/Dockerfile.bak frontend/Dockerfile

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
echo "常用命令:"
echo "  查看日志: docker-compose logs -f"
echo "  查看后端日志: docker-compose logs -f backend"
echo "  查看前端日志: docker-compose logs -f frontend"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
echo "=========================================="

