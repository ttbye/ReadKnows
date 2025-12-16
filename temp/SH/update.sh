#!/bin/bash

# KnowBooks Docker 一键更新脚本
# 用于代码更新后重新部署 Docker 容器

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${BLUE}=========================================="
echo "KnowBooks Docker 一键更新脚本"
echo "==========================================${NC}"

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: 未找到 Docker${NC}"
    exit 1
fi

# 检查 Docker Compose 是否安装
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}错误: 未找到 Docker Compose${NC}"
    exit 1
fi

# 检查 docker-compose.yml 是否存在
if [ ! -f "docker-compose.yml" ] && [ ! -f "docker-compose.prod.yml" ]; then
    echo -e "${RED}错误: 未找到 docker-compose.yml 文件${NC}"
    exit 1
fi

# 确定使用的 compose 文件
if [ -f "docker-compose.prod.yml" ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    COMPOSE_CMD="docker-compose -f $COMPOSE_FILE"
else
    COMPOSE_FILE="docker-compose.yml"
    COMPOSE_CMD="docker-compose"
fi

echo -e "${GREEN}使用配置文件: $COMPOSE_FILE${NC}"

# 询问是否备份
echo ""
echo -e "${YELLOW}是否在更新前备份数据？ (y/n)${NC}"
read -r backup_choice
if [ "$backup_choice" = "y" ] || [ "$backup_choice" = "Y" ]; then
    echo "正在备份数据..."
    BACKUP_DIR="../knowbooks-backups"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/knowbooks-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    if [ -d "data" ]; then
        tar -czf "$BACKUP_FILE" data/ 2>/dev/null || {
            echo -e "${YELLOW}警告: 备份数据目录失败，继续更新...${NC}"
        }
        if [ -f "$BACKUP_FILE" ]; then
            echo -e "${GREEN}备份完成: $BACKUP_FILE${NC}"
        fi
    else
        echo -e "${YELLOW}警告: 未找到 data 目录，跳过备份${NC}"
    fi
fi

# 显示当前容器状态
echo ""
echo -e "${BLUE}当前容器状态:${NC}"
$COMPOSE_CMD ps || echo "无运行中的容器"

# 停止旧容器
echo ""
echo -e "${YELLOW}正在停止旧容器...${NC}"
$COMPOSE_CMD down

# 询问是否更新代码（如果使用 Git）
if [ -d ".git" ]; then
    echo ""
    echo -e "${YELLOW}检测到 Git 仓库，是否拉取最新代码？ (y/n)${NC}"
    read -r git_choice
    if [ "$git_choice" = "y" ] || [ "$git_choice" = "Y" ]; then
        echo "正在拉取最新代码..."
        git pull || {
            echo -e "${YELLOW}警告: Git 拉取失败，使用当前代码继续...${NC}"
        }
    fi
fi

# 询问构建方式
echo ""
echo -e "${YELLOW}选择构建方式:${NC}"
echo "1) 标准构建（使用缓存，更快）"
echo "2) 强制重建（不使用缓存，确保使用最新代码）"
read -p "请选择 [1-2] (默认 1): " build_choice
build_choice=${build_choice:-1}

# 构建镜像
echo ""
echo -e "${YELLOW}正在构建镜像...${NC}"
if [ "$build_choice" = "2" ]; then
    echo -e "${BLUE}使用强制重建模式（不使用缓存）${NC}"
    $COMPOSE_CMD build --no-cache
else
    echo -e "${BLUE}使用标准构建模式（使用缓存）${NC}"
    $COMPOSE_CMD build
fi

# 检查构建是否成功
if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 镜像构建失败${NC}"
    exit 1
fi

# 启动新容器
echo ""
echo -e "${YELLOW}正在启动新容器...${NC}"
$COMPOSE_CMD up -d

# 等待服务启动
echo ""
echo -e "${YELLOW}等待服务启动（10秒）...${NC}"
sleep 10

# 检查容器状态
echo ""
echo -e "${BLUE}=========================================="
echo "容器状态:"
echo "==========================================${NC}"
$COMPOSE_CMD ps

# 检查服务健康状态
echo ""
echo -e "${YELLOW}检查服务健康状态...${NC}"

# 检查后端
BACKEND_PORT=$(grep -E "^\s*-\s*\"\d+:3001\"" $COMPOSE_FILE | head -1 | sed 's/.*"\([0-9]*\):3001".*/\1/' || echo "1201")
if curl -s -f "http://localhost:$BACKEND_PORT/api/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 后端服务正常 (http://localhost:$BACKEND_PORT/api/health)${NC}"
else
    echo -e "${RED}✗ 后端服务异常，请检查日志${NC}"
fi

# 检查前端
FRONTEND_PORT=$(grep -E "^\s*-\s*\"\d+:80\"" $COMPOSE_FILE | head -1 | sed 's/.*"\([0-9]*\):80".*/\1/' || echo "1280")
if curl -s -f "http://localhost:$FRONTEND_PORT" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 前端服务正常 (http://localhost:$FRONTEND_PORT)${NC}"
else
    echo -e "${RED}✗ 前端服务异常，请检查日志${NC}"
fi

# 显示更新信息
echo ""
echo -e "${GREEN}=========================================="
echo "更新完成！"
echo "==========================================${NC}"
echo ""
echo -e "${BLUE}服务地址:${NC}"
echo "  前端: http://localhost:$FRONTEND_PORT"
echo "  后端: http://localhost:$BACKEND_PORT/api"
echo ""
echo -e "${BLUE}常用命令:${NC}"
echo "  查看日志: $COMPOSE_CMD logs -f"
echo "  查看后端日志: $COMPOSE_CMD logs -f backend"
echo "  查看前端日志: $COMPOSE_CMD logs -f frontend"
echo "  停止服务: $COMPOSE_CMD down"
echo "  重启服务: $COMPOSE_CMD restart"
echo ""

# 询问是否查看日志
echo -e "${YELLOW}是否查看容器日志？ (y/n)${NC}"
read -r log_choice
if [ "$log_choice" = "y" ] || [ "$log_choice" = "Y" ]; then
    echo ""
    echo -e "${BLUE}显示最近 50 行日志（按 Ctrl+C 退出）:${NC}"
    $COMPOSE_CMD logs --tail=50 -f
fi

echo ""
echo -e "${GREEN}更新完成！${NC}"

