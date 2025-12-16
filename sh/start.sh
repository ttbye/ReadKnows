#!/bin/bash

# EpubManager 一键启动脚本
# 自动检查依赖、编译、启动前后端服务

# 遇到错误不立即退出，允许检查和处理

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  EpubManager 一键启动脚本${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 未找到 Node.js，请先安装 Node.js${NC}"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓${NC} Node.js 版本: $NODE_VERSION"

# 检查npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ 未找到 npm${NC}"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✓${NC} npm 版本: $NPM_VERSION"
echo ""

# 检查并安装根目录依赖
echo -e "${YELLOW}📦 检查根目录依赖...${NC}"
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    echo "安装根目录依赖..."
    cd "$PROJECT_DIR"
    npm install
else
    echo -e "${GREEN}✓${NC} 根目录依赖已安装"
fi
echo ""

# 检查并安装后端依赖
echo -e "${YELLOW}📦 检查后端依赖...${NC}"
if [ ! -d "$BACKEND_DIR/node_modules" ]; then
    echo "安装后端依赖..."
    cd "$BACKEND_DIR"
    npm install
else
    echo -e "${GREEN}✓${NC} 后端依赖已安装"
fi

# 检查better-sqlite3
echo -e "${YELLOW}🔧 检查 better-sqlite3...${NC}"
cd "$BACKEND_DIR"
if [ ! -f "node_modules/better-sqlite3/build/Release/better_sqlite3.node" ] && 
   [ ! -f "node_modules/better-sqlite3/lib/binding/node-v*/better_sqlite3.node" ]; then
    echo "编译 better-sqlite3..."
    npm rebuild better-sqlite3 || {
        echo -e "${YELLOW}⚠️  自动编译失败，尝试手动编译...${NC}"
        cd node_modules/better-sqlite3
        npm run build-release || npm run install
        cd "$BACKEND_DIR"
    }
fi
echo -e "${GREEN}✓${NC} better-sqlite3 就绪"
echo ""

# 检查并安装前端依赖
echo -e "${YELLOW}📦 检查前端依赖...${NC}"
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo "安装前端依赖..."
    cd "$FRONTEND_DIR"
    npm install
else
    echo -e "${GREEN}✓${NC} 前端依赖已安装"
fi
echo ""

# 检查环境变量文件
echo -e "${YELLOW}⚙️  检查配置文件...${NC}"
if [ ! -f "$BACKEND_DIR/.env" ]; then
    if [ -f "$BACKEND_DIR/.env.example" ]; then
        echo "创建 .env 文件..."
        cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
        echo -e "${YELLOW}⚠️  请编辑 $BACKEND_DIR/.env 设置 JWT_SECRET${NC}"
    else
        echo "创建默认 .env 文件..."
        cat > "$BACKEND_DIR/.env" << EOF
PORT=1281
JWT_SECRET=dev-secret-key-change-this-in-production-$(date +%s)
JWT_EXPIRES_IN=7d
BOOKS_DIR=./books
DB_PATH=./data/database.db
DOUBAN_API_BASE=http://192.168.6.6:1482
EOF
    fi
fi
echo -e "${GREEN}✓${NC} 配置文件就绪"
echo ""

# 创建必要的目录
echo -e "${YELLOW}📁 创建必要目录...${NC}"
mkdir -p "$BACKEND_DIR/data"
mkdir -p "$BACKEND_DIR/books"
echo -e "${GREEN}✓${NC} 目录已创建"
echo ""

# 检查端口占用
echo -e "${YELLOW}🔍 检查端口占用...${NC}"
check_port() {
    local port=$1
    if command -v lsof &> /dev/null; then
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
            echo -e "${RED}❌ 端口 $port 已被占用${NC}"
            echo "   请关闭占用该端口的程序或修改配置"
            return 1
        else
            echo -e "${GREEN}✓${NC} 端口 $port 可用"
            return 0
        fi
    else
        echo -e "${YELLOW}⚠️  未安装 lsof，跳过端口检查${NC}"
        return 0
    fi
}

PORT_1281_OK=0
PORT_1280_OK=0

if check_port 1281; then
    PORT_1281_OK=1
fi
if check_port 1280; then
    PORT_1280_OK=1
fi

if [ $PORT_1281_OK -eq 0 ] || [ $PORT_1280_OK -eq 0 ]; then
    echo -e "${YELLOW}⚠️  端口检查发现问题，但继续启动...${NC}"
    echo "   如果启动失败，请手动关闭占用端口的程序"
fi
echo ""

# 清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 正在停止服务...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID 2>/dev/null || true
    wait $FRONTEND_PID 2>/dev/null || true
    echo -e "${GREEN}✓${NC} 服务已停止"
    exit 0
}

# 捕获退出信号
trap cleanup SIGINT SIGTERM

# 启动后端
echo -e "${BLUE}🚀 启动后端服务器...${NC}"
cd "$BACKEND_DIR"
npm run dev > "$PROJECT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

# 等待后端启动
echo "等待后端启动..."
sleep 3

# 检查后端是否启动成功
if kill -0 $BACKEND_PID 2>/dev/null; then
    if curl -s http://localhost:1281/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} 后端服务器启动成功 (PID: $BACKEND_PID)"
        echo -e "   API地址: ${BLUE}http://localhost:1281${NC}"
        echo -e "   OPDS地址: ${BLUE}http://localhost:1281/opds/${NC}"
    else
        echo -e "${YELLOW}⚠️  后端进程已启动，但API未响应，请查看日志: $PROJECT_DIR/backend.log${NC}"
    fi
else
    echo -e "${RED}❌ 后端启动失败，请查看日志: $PROJECT_DIR/backend.log${NC}"
    cat "$PROJECT_DIR/backend.log" | tail -20
    exit 1
fi
echo ""

# 启动前端
echo -e "${BLUE}🚀 启动前端服务器...${NC}"
cd "$FRONTEND_DIR"
npm run dev > "$PROJECT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

# 等待前端启动
echo "等待前端启动..."
sleep 5

# 检查前端是否启动成功
if kill -0 $FRONTEND_PID 2>/dev/null; then
    if curl -s http://localhost:1280 > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} 前端服务器启动成功 (PID: $FRONTEND_PID)"
        echo -e "   前端地址: ${BLUE}http://localhost:1280${NC}"
    else
        echo -e "${YELLOW}⚠️  前端进程已启动，但未响应，请查看日志: $PROJECT_DIR/frontend.log${NC}"
    fi
else
    echo -e "${RED}❌ 前端启动失败，请查看日志: $PROJECT_DIR/frontend.log${NC}"
    cat "$PROJECT_DIR/frontend.log" | tail -20
    exit 1
fi
echo ""

# 获取本机IP地址
get_local_ip() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        hostname -I | awk '{print $1}'
    else
        echo "localhost"
    fi
}

LOCAL_IP=$(get_local_ip)

# 显示启动信息
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✅ 服务启动成功！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}本地访问：${NC}"
echo -e "  前端: ${BLUE}http://localhost:1280${NC}"
echo -e "  后端: ${BLUE}http://localhost:1281${NC}"
echo -e "  OPDS: ${BLUE}http://localhost:1281/opds/${NC}"
echo ""
if [ "$LOCAL_IP" != "localhost" ] && [ -n "$LOCAL_IP" ]; then
    echo -e "${YELLOW}局域网访问：${NC}"
    echo -e "  前端: ${GREEN}http://${LOCAL_IP}:1280${NC}"
    echo -e "  后端: ${GREEN}http://${LOCAL_IP}:1281${NC}"
    echo -e "  OPDS: ${GREEN}http://${LOCAL_IP}:1281/opds/${NC}"
    echo ""
    echo -e "${YELLOW}💡 提示: 确保防火墙允许端口 1280 和 1281${NC}"
    echo ""
fi
echo -e "日志文件:"
echo -e "  后端: ${YELLOW}$PROJECT_DIR/backend.log${NC}"
echo -e "  前端: ${YELLOW}$PROJECT_DIR/frontend.log${NC}"
echo ""
echo -e "${YELLOW}按 Ctrl+C 停止服务${NC}"
echo ""

# 保持脚本运行
wait

