#!/bin/bash

# ============================================
# KnowBooks 快速部署脚本（无交互）
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}🚀 KnowBooks 快速部署${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 1. 停止容器
echo -e "${BLUE}▶️  停止容器...${NC}"
docker-compose down

# 2. 构建镜像
echo -e "${BLUE}▶️  构建镜像...${NC}"
docker-compose build --no-cache

# 3. 启动容器
echo -e "${BLUE}▶️  启动容器...${NC}"
docker-compose up -d

# 4. 等待
echo -e "${BLUE}▶️  等待服务启动...${NC}"
sleep 30

# 5. 检查状态
echo ""
echo -e "${GREEN}✅ 部署完成！${NC}"
echo ""
docker-compose ps

echo ""
echo -e "${BLUE}ℹ️  访问地址: http://localhost:1280${NC}"
echo -e "${BLUE}ℹ️  查看日志: docker-compose logs -f${NC}"

