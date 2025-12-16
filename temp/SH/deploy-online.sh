#!/bin/bash

# KnowBooks 在线部署脚本
# 适用于远程服务器一键部署

set -e

echo "=========================================="
echo "KnowBooks Docker 在线部署脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}提示: 建议使用 root 用户运行此脚本${NC}"
fi

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: 未找到 Docker${NC}"
    echo "正在安装 Docker..."
    
    # 检测系统类型并安装 Docker
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        case $ID in
            ubuntu|debian)
                curl -fsSL https://get.docker.com -o get-docker.sh
                sh get-docker.sh
                rm get-docker.sh
                ;;
            centos|rhel|fedora)
                curl -fsSL https://get.docker.com -o get-docker.sh
                sh get-docker.sh
                rm get-docker.sh
                ;;
            *)
                echo -e "${RED}不支持的系统类型，请手动安装 Docker${NC}"
                exit 1
                ;;
        esac
    else
        echo -e "${RED}无法检测系统类型，请手动安装 Docker${NC}"
        exit 1
    fi
fi

# 检查 Docker Compose 是否安装
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${YELLOW}未找到 Docker Compose，正在安装...${NC}"
    # 安装 Docker Compose
    if command -v curl &> /dev/null; then
        curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
    else
        echo -e "${RED}需要 curl 来下载 Docker Compose${NC}"
        exit 1
    fi
fi

# 获取安装目录
INSTALL_DIR=${1:-/opt/knowbooks}
echo -e "${GREEN}安装目录: ${INSTALL_DIR}${NC}"

# 创建安装目录
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# 检查是否已存在项目
if [ -d "$INSTALL_DIR/.git" ] || [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
    echo -e "${YELLOW}检测到已存在的安装，是否更新？ (y/n)${NC}"
    read -r answer
    if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
        echo "已取消"
        exit 0
    fi
    echo "正在更新..."
    if [ -d "$INSTALL_DIR/.git" ]; then
        git pull || echo "Git 更新失败，继续使用现有文件"
    fi
else
    # 检查是否有 Git 仓库 URL
    echo -e "${GREEN}请输入 Git 仓库地址（留空则使用当前目录）:${NC}"
    read -r GIT_URL
    
    if [ -n "$GIT_URL" ]; then
        echo "正在克隆仓库..."
        git clone "$GIT_URL" .
    else
        echo -e "${YELLOW}未提供 Git 仓库，请确保当前目录包含项目文件${NC}"
        if [ ! -f "docker-compose.yml" ]; then
            echo -e "${RED}错误: 未找到 docker-compose.yml 文件${NC}"
            exit 1
        fi
    fi
fi

# 创建数据目录
echo "创建数据目录..."
mkdir -p data/backend/{data,books,covers,fonts}
mkdir -p data/frontend

# 创建环境变量文件
if [ ! -f .env ]; then
    echo "创建环境变量文件..."
    cat > .env << 'ENVEOF'
# JWT配置（请修改为强随机字符串）
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=7d

# 豆瓣API配置（可选）
DOUBAN_API_BASE=

# AI配置（可选）
AI_PROVIDER=ollama
AI_API_URL=http://localhost:11434
AI_API_KEY=
AI_MODEL=llama2
ENVEOF
    
    # 生成 JWT_SECRET
    if command -v openssl &> /dev/null; then
        JWT_SECRET=$(openssl rand -base64 32)
        sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
    fi
    
    echo -e "${GREEN}已创建 .env 文件${NC}"
    echo -e "${YELLOW}请编辑 .env 文件设置配置（特别是 JWT_SECRET）${NC}"
    echo "按 Enter 继续..."
    read
fi

# 配置 docker-compose 文件
if [ -f docker-compose.prod.yml ]; then
    echo "使用生产环境配置 docker-compose.prod.yml"
    COMPOSE_FILE="docker-compose.prod.yml"
elif [ -f docker-compose.yml ]; then
    echo "配置数据卷路径..."
    # 备份原文件
    cp docker-compose.yml docker-compose.yml.bak
    
    # 替换绝对路径为相对路径
    sed -i "s|/Users/ttbye/BooksPath/backend/data|./data/backend/data|g" docker-compose.yml
    sed -i "s|/Users/ttbye/BooksPath/backend/books|./data/backend/books|g" docker-compose.yml
    sed -i "s|/Users/ttbye/BooksPath/backend/covers|./data/backend/covers|g" docker-compose.yml
    sed -i "s|/Users/ttbye/BooksPath/backend/fonts|./data/backend/fonts|g" docker-compose.yml
    
    COMPOSE_FILE="docker-compose.yml"
else
    echo -e "${RED}错误: 未找到 docker-compose.yml 文件${NC}"
    exit 1
fi

# 修改端口（如果需要）
echo -e "${GREEN}当前端口配置:${NC}"
echo "  后端: 1201"
echo "  前端: 1280"
echo "是否修改端口？ (y/n)"
read -r answer
if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    echo "请输入后端端口（默认 1201）:"
    read -r BACKEND_PORT
    BACKEND_PORT=${BACKEND_PORT:-1201}
    echo "请输入前端端口（默认 1280）:"
    read -r FRONTEND_PORT
    FRONTEND_PORT=${FRONTEND_PORT:-1280}
    
    # 更新 .env 文件
    if ! grep -q "BACKEND_PORT" .env 2>/dev/null; then
        echo "BACKEND_PORT=$BACKEND_PORT" >> .env
    else
        sed -i "s|BACKEND_PORT=.*|BACKEND_PORT=$BACKEND_PORT|" .env
    fi
    
    if ! grep -q "FRONTEND_PORT" .env 2>/dev/null; then
        echo "FRONTEND_PORT=$FRONTEND_PORT" >> .env
    else
        sed -i "s|FRONTEND_PORT=.*|FRONTEND_PORT=$FRONTEND_PORT|" .env
    fi
fi

# 构建并启动容器
echo ""
echo -e "${GREEN}开始构建和启动容器...${NC}"
echo "这可能需要几分钟时间，请耐心等待..."

# 使用国内镜像源（如果在中国）
if [ -f docker-start-fast.sh ]; then
    chmod +x docker-start-fast.sh
    # 修改脚本使用正确的 compose 文件
    if [ "$COMPOSE_FILE" = "docker-compose.prod.yml" ]; then
        COMPOSE_CMD="docker-compose -f $COMPOSE_FILE"
        $COMPOSE_CMD up -d --build
    else
        ./docker-start-fast.sh
    fi
else
    if [ "$COMPOSE_FILE" = "docker-compose.prod.yml" ]; then
        docker-compose -f $COMPOSE_FILE up -d --build
    else
        docker-compose up -d --build
    fi
fi

# 等待服务启动
echo "等待服务启动..."
sleep 10

# 检查服务状态
echo ""
echo "=========================================="
echo "服务状态:"
echo "=========================================="
if [ "$COMPOSE_FILE" = "docker-compose.prod.yml" ]; then
    docker-compose -f $COMPOSE_FILE ps
else
    docker-compose ps
fi

# 获取服务器 IP
SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "localhost")
fi

# 获取端口配置
FRONTEND_PORT=${FRONTEND_PORT:-1280}
BACKEND_PORT=${BACKEND_PORT:-1201}

# 显示访问信息
echo ""
echo "=========================================="
echo -e "${GREEN}部署完成！${NC}"
echo "=========================================="
echo "前端地址: http://${SERVER_IP}:${FRONTEND_PORT}"
echo "后端API: http://${SERVER_IP}:${BACKEND_PORT}/api"
echo ""
echo "常用命令:"
if [ "$COMPOSE_FILE" = "docker-compose.prod.yml" ]; then
    echo "  查看日志: cd $INSTALL_DIR && docker-compose -f $COMPOSE_FILE logs -f"
    echo "  停止服务: cd $INSTALL_DIR && docker-compose -f $COMPOSE_FILE down"
    echo "  重启服务: cd $INSTALL_DIR && docker-compose -f $COMPOSE_FILE restart"
    echo "  更新服务: cd $INSTALL_DIR && git pull && docker-compose -f $COMPOSE_FILE up -d --build"
else
    echo "  查看日志: cd $INSTALL_DIR && docker-compose logs -f"
    echo "  停止服务: cd $INSTALL_DIR && docker-compose down"
    echo "  重启服务: cd $INSTALL_DIR && docker-compose restart"
    echo "  更新服务: cd $INSTALL_DIR && git pull && docker-compose up -d --build"
fi
echo ""

# 初始化管理员账户
echo "=========================================="
echo "初始化管理员账户"
echo "=========================================="
echo "是否现在初始化管理员账户? (y/n)"
read -r answer
if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    if [ "$COMPOSE_FILE" = "docker-compose.prod.yml" ]; then
        docker-compose -f $COMPOSE_FILE exec backend node scripts/initAdmin.js
    else
        docker-compose exec backend node scripts/initAdmin.js
    fi
fi

echo ""
echo -e "${GREEN}部署完成！${NC}"
echo "安装目录: $INSTALL_DIR"
echo "=========================================="

