#!/bin/bash

# ============================================
# ReadKnows (读士私人书库) 重启容器脚本
# ============================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔄 重启 ReadKnows (读士私人书库) 容器...${NC}"
docker-compose restart

echo ""
echo -e "${GREEN}✅ 重启完成！${NC}"
echo ""
docker-compose ps

