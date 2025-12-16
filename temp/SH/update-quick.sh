#!/bin/bash

# KnowBooks Docker 快速更新脚本（无交互）
# 适用于自动化部署或快速更新

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 确定使用的 compose 文件
if [ -f "docker-compose.prod.yml" ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    COMPOSE_CMD="docker-compose -f $COMPOSE_FILE"
else
    COMPOSE_FILE="docker-compose.yml"
    COMPOSE_CMD="docker-compose"
fi

echo "=========================================="
echo "KnowBooks 快速更新"
echo "=========================================="

# 停止旧容器
echo "停止旧容器..."
$COMPOSE_CMD down

# 更新代码（如果使用 Git）
if [ -d ".git" ]; then
    echo "拉取最新代码..."
    git pull || echo "警告: Git 拉取失败，使用当前代码"
fi

# 重新构建并启动
echo "重新构建并启动..."
$COMPOSE_CMD up -d --build

# 等待启动
echo "等待服务启动..."
sleep 5

# 显示状态
echo ""
echo "容器状态:"
$COMPOSE_CMD ps

echo ""
echo "更新完成！"
echo "查看日志: $COMPOSE_CMD logs -f"

