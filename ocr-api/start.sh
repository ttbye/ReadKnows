#!/bin/bash

# OCR API 快速启动脚本

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}OCR API 服务启动脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查 Docker 是否运行
if ! docker info &> /dev/null; then
    echo -e "${RED}错误: Docker 服务未运行${NC}"
    echo "请先启动 Docker 服务"
    exit 1
fi

# 检查是否存在 docker-compose.yml
if [ -f "docker-compose.yml" ]; then
    echo -e "${YELLOW}使用 Docker Compose 启动...${NC}"
    docker-compose up -d || docker compose up -d
    echo ""
    echo -e "${GREEN}服务已启动${NC}"
    echo ""
    echo "查看日志: docker-compose logs -f"
    echo "停止服务: docker-compose down"
    echo "健康检查: curl http://localhost:5080/health"
elif [ -f "../sh/docker-compose-OCR-MACOS.yml" ] || [ -f "../sh/docker-compose-OCR-Linux.yml" ]; then
    echo -e "${YELLOW}使用平台特定的 Docker Compose 文件启动...${NC}"
    cd ../sh
    if [ -f "docker-compose-OCR-MACOS.yml" ]; then
        docker-compose -f docker-compose-OCR-MACOS.yml up -d || docker compose -f docker-compose-OCR-MACOS.yml up -d
    elif [ -f "docker-compose-OCR-Linux.yml" ]; then
        docker-compose -f docker-compose-OCR-Linux.yml up -d || docker compose -f docker-compose-OCR-Linux.yml up -d
    fi
    echo ""
    echo -e "${GREEN}服务已启动${NC}"
else
    echo -e "${YELLOW}未找到 Docker Compose 文件，尝试本地运行...${NC}"
    
    # 检查 Python
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}错误: 未找到 Python 3${NC}"
        exit 1
    fi
    
    # 检查依赖
    if ! python3 -c "import fastapi" &> /dev/null; then
        echo -e "${YELLOW}安装依赖...${NC}"
        pip3 install -r requirements.txt
    fi
    
    # 启动服务
    echo -e "${GREEN}启动 OCR API 服务...${NC}"
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 5080
fi
