#!/bin/bash

# Docker 镜像源配置脚本
# 解决 Docker 拉取镜像失败的问题

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  🔧 Docker 镜像源配置${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检测操作系统
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - Docker Desktop
    DOCKER_CONFIG_FILE="$HOME/.docker/daemon.json"
    echo -e "${YELLOW}检测到 macOS 系统${NC}"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    DOCKER_CONFIG_FILE="/etc/docker/daemon.json"
    echo -e "${YELLOW}检测到 Linux 系统${NC}"
    if [ "$EUID" -ne 0 ]; then 
        echo -e "${RED}❌ 需要 root 权限来修改 /etc/docker/daemon.json${NC}"
        echo -e "${YELLOW}请使用: sudo $0${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ 不支持的操作系统${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}将配置以下镜像源：${NC}"
echo -e "  - 阿里云镜像"
echo -e "  - 腾讯云镜像"
echo -e "  - 网易镜像"
echo ""

# 创建配置目录
mkdir -p "$(dirname "$DOCKER_CONFIG_FILE")"

# 读取现有配置
if [ -f "$DOCKER_CONFIG_FILE" ]; then
    echo -e "${YELLOW}发现现有配置文件，将备份为: ${DOCKER_CONFIG_FILE}.bak${NC}"
    cp "$DOCKER_CONFIG_FILE" "${DOCKER_CONFIG_FILE}.bak"
    EXISTING_CONFIG=$(cat "$DOCKER_CONFIG_FILE")
else
    EXISTING_CONFIG="{}"
fi

# 创建新的配置
cat > "$DOCKER_CONFIG_FILE" << 'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ],
  "insecure-registries": [],
  "experimental": false
}
EOF

echo -e "${GREEN}✅ 已配置 Docker 镜像源${NC}"
echo ""
echo -e "${YELLOW}配置文件位置: ${DOCKER_CONFIG_FILE}${NC}"
echo ""
echo -e "${BLUE}配置的镜像源：${NC}"
cat "$DOCKER_CONFIG_FILE" | grep -A 3 "registry-mirrors"
echo ""

if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}⚠️  macOS 用户请注意：${NC}"
    echo -e "${YELLOW}  1. 打开 Docker Desktop${NC}"
    echo -e "${YELLOW}  2. 进入 Settings > Docker Engine${NC}"
    echo -e "${YELLOW}  3. 将以下配置粘贴到 JSON 配置中：${NC}"
    echo ""
    cat "$DOCKER_CONFIG_FILE"
    echo ""
    echo -e "${YELLOW}  4. 点击 'Apply & Restart'${NC}"
    echo ""
    echo -e "${GREEN}或者直接使用已生成的配置文件${NC}"
else
    echo -e "${YELLOW}正在重启 Docker 服务...${NC}"
    systemctl restart docker 2>/dev/null || service docker restart 2>/dev/null
    echo -e "${GREEN}✅ Docker 服务已重启${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✅ 配置完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}现在可以重试构建：${NC}"
echo -e "${BLUE}docker pull python:3.11-slim${NC}"

