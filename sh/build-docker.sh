#!/bin/bash

# ============================================
# ReadKnows (读士私人书库) Docker 一键构建脚本
# 自动检测系统并使用对应的配置文件
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
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}ReadKnows (读士私人书库) Docker 一键构建${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检测操作系统并选择对应的docker-compose文件
COMPOSE_FILE="docker-compose.yml"
if [[ "$OSTYPE" == "darwin"* ]]; then
    COMPOSE_FILE="docker-compose-MACOS.yml"
    echo -e "${BLUE}检测到 macOS 系统，使用配置文件: $COMPOSE_FILE${NC}"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    COMPOSE_FILE="docker-compose-Linux.yml"
    echo -e "${BLUE}检测到 Linux 系统，使用配置文件: $COMPOSE_FILE${NC}"
else
    echo -e "${YELLOW}未检测到特定系统，使用默认配置文件: $COMPOSE_FILE${NC}"
fi

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker 未运行，请先启动 Docker${NC}"
    exit 1
fi

# 检查 Docker Compose 命令
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    echo -e "${RED}❌ 未找到 Docker Compose${NC}"
    exit 1
fi

# 切换到脚本目录
cd "$SCRIPT_DIR" || exit 1

# 检查配置文件是否存在
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}❌ 配置文件不存在: $COMPOSE_FILE${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}📦 开始构建 Docker 镜像...${NC}"
echo -e "${BLUE}使用配置文件: $COMPOSE_FILE${NC}"
echo -e "${BLUE}构建上下文: $PROJECT_ROOT${NC}"
echo ""

# 构建镜像
$COMPOSE_CMD -f "$COMPOSE_FILE" build --no-cache

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Docker 镜像构建成功！${NC}"
    echo ""
    echo -e "${BLUE}已构建的镜像:${NC}"
    docker images | grep -E "ttbye/readknows-(backend|frontend)" || echo "未找到相关镜像"
    echo ""
    echo -e "${BLUE}下一步操作:${NC}"
    echo "  运行 ./docker-up.sh 启动服务"
    echo "  或使用: $COMPOSE_CMD -f $COMPOSE_FILE up -d"
    echo ""
else
    echo ""
    echo -e "${RED}❌ Docker 镜像构建失败${NC}"
    exit 1
fi
