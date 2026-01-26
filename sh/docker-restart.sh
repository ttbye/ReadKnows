#!/bin/bash

# ============================================
# ReadKnows (读士私人书库) 重启容器脚本
# ============================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
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

# 检查并创建必要的目录
echo -e "${BLUE}📁 检查 Docker 挂载目录...${NC}"
if [ -f "$SCRIPT_DIR/create-docker-dirs.sh" ]; then
    "$SCRIPT_DIR/create-docker-dirs.sh" "$COMPOSE_FILE"
else
    echo -e "${YELLOW}⚠️  目录创建脚本不存在，跳过目录检查${NC}"
fi
echo ""

echo -e "${BLUE}🔄 重启 ReadKnows (读士私人书库) 容器...${NC}"
cd "$SCRIPT_DIR" || exit 1
docker-compose -f "$COMPOSE_FILE" restart

echo ""
echo -e "${GREEN}✅ 重启完成！${NC}"
echo ""
docker-compose -f "$COMPOSE_FILE" ps

