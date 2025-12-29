#!/bin/bash

# ============================================
# ReadKnows Docker 网络清理脚本
# ============================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧹 清理 ReadKnows Docker 网络...${NC}"
echo ""

# 检查是否有活动的容器
echo -e "${YELLOW}检查活动容器...${NC}"
ACTIVE_CONTAINERS=$(docker ps -a --filter "network=sh_readknows-network" --format "{{.Names}}" 2>/dev/null)

if [ -n "$ACTIVE_CONTAINERS" ]; then
    echo -e "${YELLOW}发现以下容器使用该网络:${NC}"
    echo "$ACTIVE_CONTAINERS"
    echo ""
    
    # 停止容器
    echo -e "${YELLOW}停止容器...${NC}"
    echo "$ACTIVE_CONTAINERS" | xargs -r docker stop 2>/dev/null || true
    
    # 移除容器
    echo -e "${YELLOW}移除容器...${NC}"
    echo "$ACTIVE_CONTAINERS" | xargs -r docker rm 2>/dev/null || true
else
    echo -e "${GREEN}✓${NC} 未发现活动容器"
fi

echo ""

# 尝试移除网络
echo -e "${YELLOW}移除网络 sh_readknows-network...${NC}"
if docker network rm sh_readknows-network 2>/dev/null; then
    echo -e "${GREEN}✓${NC} 网络已移除"
else
    echo -e "${RED}❌${NC} 网络移除失败，可能仍有容器在使用"
    echo -e "${YELLOW}提示: 请手动检查并停止相关容器${NC}"
    echo ""
    echo "检查命令:"
    echo "  docker ps -a --filter 'network=sh_readknows-network'"
    echo "  docker network inspect sh_readknows-network"
fi

echo ""
echo -e "${GREEN}✅ 清理完成！${NC}"

