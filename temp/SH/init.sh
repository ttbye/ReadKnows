#!/bin/bash

# KnowBooks 一键初始化脚本
# 自动安装依赖、初始化数据库、创建管理员账号

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# 错误处理
set -e
trap 'echo -e "\n${RED}❌ 初始化失败，请检查错误信息${NC}"; exit 1' ERR

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  KnowBooks 一键初始化脚本${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. 检查Node.js和npm
echo -e "${CYAN}[1/8]${NC} ${YELLOW}检查运行环境...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 未找到 Node.js，请先安装 Node.js (>= 18.0.0)${NC}"
    exit 1
fi

NODE_VERSION=$(node -v)
NODE_MAJOR=$(node -v | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 版本过低，需要 >= 18.0.0，当前版本: $NODE_VERSION${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ 未找到 npm${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js: $NODE_VERSION"
echo -e "${GREEN}✓${NC} npm: $(npm -v)"
echo ""

# 2. 安装根目录依赖
echo -e "${CYAN}[2/8]${NC} ${YELLOW}安装根目录依赖...${NC}"
cd "$PROJECT_DIR"
if [ ! -d "node_modules" ]; then
    echo "正在安装..."
    npm install
else
    echo -e "${GREEN}✓${NC} 根目录依赖已安装"
fi
echo ""

# 3. 安装后端依赖
echo -e "${CYAN}[3/8]${NC} ${YELLOW}安装后端依赖...${NC}"
cd "$BACKEND_DIR"
if [ ! -d "node_modules" ]; then
    echo "正在安装后端依赖（这可能需要几分钟）..."
    npm install
else
    echo -e "${GREEN}✓${NC} 后端依赖已安装"
fi
echo ""

# 4. 编译better-sqlite3
echo -e "${CYAN}[4/8]${NC} ${YELLOW}编译 better-sqlite3...${NC}"
cd "$BACKEND_DIR"
if [ ! -f "node_modules/better-sqlite3/build/Release/better_sqlite3.node" ] && 
   [ ! -f "node_modules/better-sqlite3/lib/binding/node-v*/better_sqlite3.node" ]; then
    echo "正在编译 better-sqlite3（这可能需要几分钟）..."
    npm rebuild better-sqlite3 || {
        echo -e "${YELLOW}⚠️  自动编译失败，尝试手动编译...${NC}"
        cd node_modules/better-sqlite3
        npm run build-release || npm run install || true
        cd "$BACKEND_DIR"
    }
    echo -e "${GREEN}✓${NC} better-sqlite3 编译完成"
else
    echo -e "${GREEN}✓${NC} better-sqlite3 已就绪"
fi
echo ""

# 5. 安装前端依赖
echo -e "${CYAN}[5/8]${NC} ${YELLOW}安装前端依赖...${NC}"
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    echo "正在安装前端依赖（这可能需要几分钟）..."
    npm install
else
    echo -e "${GREEN}✓${NC} 前端依赖已安装"
fi
echo ""

# 6. 创建必要的目录
echo -e "${CYAN}[6/8]${NC} ${YELLOW}创建必要目录...${NC}"
mkdir -p "$BACKEND_DIR/data"
mkdir -p "$BACKEND_DIR/books"
mkdir -p "$BACKEND_DIR/covers"
mkdir -p "$BACKEND_DIR/fonts"
echo -e "${GREEN}✓${NC} 目录已创建"
echo ""

# 7. 创建配置文件
echo -e "${CYAN}[7/8]${NC} ${YELLOW}检查配置文件...${NC}"
cd "$BACKEND_DIR"
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "从 .env.example 创建 .env 文件..."
        cp ".env.example" ".env"
        echo -e "${YELLOW}⚠️  请编辑 $BACKEND_DIR/.env 设置 JWT_SECRET${NC}"
    else
        echo "创建默认 .env 文件..."
        cat > ".env" << EOF
PORT=3001
JWT_SECRET=dev-secret-key-change-this-in-production-$(date +%s)
JWT_EXPIRES_IN=7d
BOOKS_DIR=./books
DB_PATH=./data/database.db
DOUBAN_API_BASE=https://127.0.0.1:1552
EOF
        echo -e "${GREEN}✓${NC} 已创建默认 .env 文件"
        echo -e "${YELLOW}⚠️  请编辑 $BACKEND_DIR/.env 设置 JWT_SECRET（生产环境必须修改）${NC}"
    fi
else
    echo -e "${GREEN}✓${NC} .env 文件已存在"
fi
echo ""

# 8. 初始化数据库和管理员账号
echo -e "${CYAN}[8/8]${NC} ${YELLOW}初始化数据库...${NC}"

# 检查是否已有数据库文件
cd "$BACKEND_DIR"
DB_PATH="${DB_PATH:-./data/database.db}"
if [ -f "$DB_PATH" ] || [ -f "database.db" ]; then
    echo -e "${YELLOW}⚠️  数据库文件已存在: $DB_PATH${NC}"
    read -p "是否删除现有数据库并重新初始化？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "删除现有数据库..."
        rm -f "$DB_PATH"
        rm -f "database.db"
        rm -f "data/database.db"
        echo -e "${GREEN}✓${NC} 数据库文件已删除"
    else
        echo -e "${YELLOW}⚠️  保留现有数据库${NC}"
    fi
fi

# 初始化数据库
echo "正在初始化数据库..."

# 检查端口3001是否被占用
if command -v lsof &> /dev/null; then
    if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  端口3001已被占用，跳过数据库初始化${NC}"
        echo -e "${YELLOW}   数据库将在服务器启动时自动初始化${NC}"
        SKIP_DB_INIT=true
    fi
fi

if [ "$SKIP_DB_INIT" != "true" ]; then
    # 方法1: 尝试通过启动服务器初始化数据库（推荐）
    echo "启动后端服务器以初始化数据库..."
    
    # 检查是否有timeout命令
    if command -v timeout &> /dev/null; then
        timeout 10 npm run dev > /tmp/init-db.log 2>&1 &
    else
        npm run dev > /tmp/init-db.log 2>&1 &
    fi
    INIT_PID=$!
    
    # 等待数据库初始化
    sleep 6
    
    # 检查服务器是否启动成功
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} 数据库初始化成功"
        
        # 停止临时服务器
        kill $INIT_PID 2>/dev/null || true
        pkill -f "tsx watch src/index.ts" 2>/dev/null || true
        pkill -f "node.*index.js" 2>/dev/null || true
        sleep 2
        
        # 创建默认管理员账号
        echo "创建默认管理员账号..."
        if node scripts/initAdmin.js 2>/dev/null; then
            echo -e "${GREEN}✓${NC} 默认管理员账号已创建"
        else
            echo -e "${YELLOW}⚠️  管理员账号可能已存在，跳过创建${NC}"
        fi
    else
        # 如果服务器启动失败，尝试直接运行initAdmin.js
        echo -e "${YELLOW}⚠️  服务器启动失败，尝试直接初始化...${NC}"
        kill $INIT_PID 2>/dev/null || true
        pkill -f "tsx watch src/index.ts" 2>/dev/null || true
        pkill -f "node.*index.js" 2>/dev/null || true
        sleep 1
        
        if [ -f "scripts/initAdmin.js" ]; then
            if node scripts/initAdmin.js 2>/dev/null; then
                echo -e "${GREEN}✓${NC} 数据库已初始化"
            else
                echo -e "${YELLOW}⚠️  数据库将在首次启动服务器时自动初始化${NC}"
            fi
        else
            echo -e "${YELLOW}⚠️  数据库将在首次启动服务器时自动初始化${NC}"
        fi
    fi
fi

echo ""

# 完成
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✅ 初始化完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${CYAN}下一步：${NC}"
echo ""
echo -e "1. ${YELLOW}检查配置文件${NC}"
echo -e "   编辑: ${BLUE}$BACKEND_DIR/.env${NC}"
echo -e "   重要: 修改 JWT_SECRET（生产环境必须修改）"
echo ""
echo -e "2. ${YELLOW}启动服务${NC}"
echo -e "   运行: ${BLUE}./start.sh${NC}"
echo -e "   或分别启动:"
echo -e "   后端: ${BLUE}cd backend && npm run dev${NC}"
echo -e "   前端: ${BLUE}cd frontend && npm run dev${NC}"
echo ""
echo -e "3. ${YELLOW}访问系统${NC}"
echo -e "   前端: ${BLUE}http://localhost:3000${NC}"
echo -e "   后端: ${BLUE}http://localhost:3001${NC}"
echo ""
echo -e "4. ${YELLOW}默认管理员账号${NC}"
echo -e "   用户名: ${BLUE}ttbye${NC}"
echo -e "   邮箱: ${BLUE}ttbye@example.com${NC}"
echo -e "   密码: ${BLUE}admin123456${NC}"
echo -e "   ${RED}⚠️  首次登录后请立即修改密码！${NC}"
echo ""
echo -e "${CYAN}其他命令：${NC}"
echo -e "   创建管理员: ${BLUE}cd backend && npm run init-admin${NC}"
echo -e "   重置密码: ${BLUE}cd backend && npm run reset-password <用户名> <新密码>${NC}"
echo -e "   清除数据库: ${BLUE}cd backend && npm run clear-db${NC}"
echo ""
echo -e "${GREEN}========================================${NC}"

