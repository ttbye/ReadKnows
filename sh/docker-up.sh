#!/bin/bash

# ============================================
# ReadKnows (读士私人书库) Docker 启动脚本
# 自动创建目录并启动服务
# ============================================

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检测使用的 docker-compose 文件
COMPOSE_FILE="docker-compose-Linux.yml"
if [ -f "$SCRIPT_DIR/docker-compose-Synology.yml" ]; then
    COMPOSE_FILE="docker-compose-Synology.yml"
elif [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
    COMPOSE_FILE="docker-compose.yml"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}ReadKnows (读士私人书库) Docker 启动${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查并创建必要的目录
echo -e "${BLUE}📁 检查并创建 Docker 挂载目录...${NC}"
if [ -f "$SCRIPT_DIR/create-docker-dirs.sh" ]; then
    if ! "$SCRIPT_DIR/create-docker-dirs.sh" "$COMPOSE_FILE"; then
        echo -e "${RED}❌ 目录创建失败，请检查权限${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  目录创建脚本不存在，跳过目录检查${NC}"
fi
echo ""

# 切换到脚本目录
cd "$SCRIPT_DIR" || exit 1

# 检查 Docker Compose 命令
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    echo -e "${RED}❌ 未找到 Docker Compose${NC}"
    exit 1
fi

# 启动服务
echo -e "${BLUE}🚀 启动 Docker 服务...${NC}"
echo -e "${BLUE}使用配置文件: $COMPOSE_FILE${NC}"
echo ""

# 检查是否有额外的参数（如 --profile douban）
if [ $# -gt 0 ]; then
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d "$@"
else
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d
fi

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ 服务启动成功！${NC}"
    echo ""
    echo -e "${BLUE}服务状态:${NC}"
    $COMPOSE_CMD -f "$COMPOSE_FILE" ps
    echo ""
    echo -e "${BLUE}服务地址:${NC}"
    echo "  前端: http://localhost:1280"
    echo "  后端API: http://localhost:1281"
    echo ""
    echo -e "${BLUE}查看日志:${NC}"
    echo "  $COMPOSE_CMD -f $COMPOSE_FILE logs -f"
else
    echo ""
    echo -e "${RED}❌ 服务启动失败${NC}"
    exit 1
fi
