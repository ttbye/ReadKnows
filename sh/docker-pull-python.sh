#!/bin/bash

# 手动拉取 Python 镜像脚本
# 使用多个镜像源尝试拉取

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  🐳 拉取 Python 镜像${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 方法1: 直接从 Docker Hub 拉取
echo -e "${YELLOW}方法1: 从 Docker Hub 拉取...${NC}"
if docker pull python:3.11-slim; then
    echo -e "${GREEN}✅ 成功拉取 python:3.11-slim${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}方法2: 从阿里云镜像拉取...${NC}"
# 方法2: 使用阿里云镜像
if docker pull registry.cn-hangzhou.aliyuncs.com/library/python:3.11-slim; then
    echo -e "${GREEN}✅ 成功拉取，正在标记为 python:3.11-slim...${NC}"
    docker tag registry.cn-hangzhou.aliyuncs.com/library/python:3.11-slim python:3.11-slim
    echo -e "${GREEN}✅ 镜像已标记完成${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}方法3: 配置 Docker 镜像源后重试...${NC}"
echo -e "${YELLOW}请先运行: ./sh/fix-docker-mirror.sh${NC}"
echo -e "${YELLOW}然后重启 Docker Desktop${NC}"

echo ""
echo -e "${RED}❌ 所有方法都失败了${NC}"
echo -e "${YELLOW}建议：${NC}"
echo -e "  1. 检查网络连接"
echo -e "  2. 配置 Docker 镜像源: ./sh/fix-docker-mirror.sh"
echo -e "  3. 重启 Docker Desktop"
echo -e "  4. 重试构建"

