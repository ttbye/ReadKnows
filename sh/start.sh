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
TTS_API_DIR="$PROJECT_DIR/tts-api"

# 检测操作系统平台
detect_platform() {
    local platform=""
    local uname_s=$(uname -s)
    
    # 检测 macOS
    if [ "$uname_s" = "Darwin" ]; then
        platform="macos"
    # 检测 Windows (WSL 或 Git Bash)
    # MINGW64_NT, MINGW32_NT, MSYS_NT 都是 Git Bash 的标识
    elif [ -n "$WSL_DISTRO_NAME" ] || [ -n "$WSLENV" ] || \
         echo "$uname_s" | grep -qE "^MINGW(64|32)_NT" || \
         echo "$uname_s" | grep -qE "^MSYS_NT" || \
         echo "$uname_s" | grep -qE "^CYGWIN_NT"; then
        platform="windows"
    # 检测 Linux
    elif [ "$uname_s" = "Linux" ]; then
        platform="linux"
    else
        platform="unknown"
    fi
    
    # 如果无法自动检测，提示用户手动选择
    if [ "$platform" = "unknown" ]; then
        echo -e "${YELLOW}⚠️  无法自动检测操作系统平台${NC}" >&2
        echo -e "${YELLOW}请手动选择平台:${NC}" >&2
        echo "  1) Windows" >&2
        echo "  2) macOS" >&2
        echo "  3) Linux" >&2
        echo "" >&2
        read -p "请输入选项 (1-3，默认: 1): " platform_choice
        platform_choice=${platform_choice:-1}
        
        case $platform_choice in
            1)
                platform="windows"
                ;;
            2)
                platform="macos"
                ;;
            3)
                platform="linux"
                ;;
            *)
                platform="windows"
                echo -e "${YELLOW}⚠️  无效选项，默认使用 Windows${NC}" >&2
                ;;
        esac
        echo "" >&2
    fi
    
    echo "$platform"
}

# 根据平台获取虚拟环境目录名
get_venv_dir() {
    # 如果 PLATFORM 变量已设置，直接使用；否则调用 detect_platform
    local platform=${PLATFORM:-$(detect_platform)}
    case $platform in
        windows)
            echo "venv-win"
            ;;
        macos)
            echo "venv-mac"
            ;;
        linux)
            echo "venv-linux"
            ;;
        *)
            echo "venv"
            ;;
    esac
}

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
DOUBAN_API_BASE=http://127.0.0.1:1482
TTS_BASE_URL=http://127.0.0.1:5050
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
    local port_in_use=0
    
    # 方法1: 使用 lsof (macOS/Linux)
    if command -v lsof &> /dev/null; then
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            port_in_use=1
        fi
    # 方法2: 使用 netstat (Linux/Windows WSL)
    elif command -v netstat &> /dev/null; then
        if netstat -tuln 2>/dev/null | grep -q ":$port " || \
           netstat -an 2>/dev/null | grep -q ":$port.*LISTEN"; then
            port_in_use=1
        fi
    # 方法3: 使用 ss (现代 Linux 系统)
    elif command -v ss &> /dev/null; then
        if ss -tuln 2>/dev/null | grep -q ":$port "; then
            port_in_use=1
        fi
    # 方法4: 尝试使用 /proc/net/tcp (Linux)
    elif [ -f /proc/net/tcp ]; then
        # 将端口号转换为十六进制
        local hex_port=$(printf "%04X" $port)
        if grep -q ":$hex_port " /proc/net/tcp 2>/dev/null; then
            port_in_use=1
        fi
    else
        echo -e "${YELLOW}⚠️  未找到端口检查工具 (lsof/netstat/ss)，跳过端口 $port 检查${NC}"
        return 0
    fi
    
    if [ $port_in_use -eq 1 ]; then
        echo -e "${RED}❌ 端口 $port 已被占用${NC}"
        echo "   请关闭占用该端口的程序或修改配置"
        return 1
    else
        echo -e "${GREEN}✓${NC} 端口 $port 可用"
        return 0
    fi
}

PORT_1281_OK=0
PORT_1280_OK=0
PORT_5050_OK=0

if check_port 1281; then
    PORT_1281_OK=1
fi
if check_port 1280; then
    PORT_1280_OK=1
fi
if check_port 5050; then
    PORT_5050_OK=1
fi

if [ $PORT_1281_OK -eq 0 ] || [ $PORT_1280_OK -eq 0 ] || [ $PORT_5050_OK -eq 0 ]; then
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
    kill $TTS_PID 2>/dev/null || true
    wait $BACKEND_PID 2>/dev/null || true
    wait $FRONTEND_PID 2>/dev/null || true
    wait $TTS_PID 2>/dev/null || true
    echo -e "${GREEN}✓${NC} 服务已停止"
    exit 0
}

# 捕获退出信号
trap cleanup SIGINT SIGTERM

# 启动后端
echo -e "${BLUE}🚀 启动后端服务器...${NC}"
cd "$BACKEND_DIR"

# 设置 TTS 服务地址环境变量（TTS 服务会在本地运行）
# 如果 TTS 服务启动，它会在 http://127.0.0.1:5050 上运行
export TTS_BASE_URL="http://127.0.0.1:5050"
echo -e "${GREEN}✓${NC} 设置 TTS_BASE_URL=http://127.0.0.1:5050"

# 读取 TTS API Key（如果存在）
if [ -f "$TTS_API_DIR/.env" ]; then
    TTS_API_KEY=$(grep "^API_KEY=" "$TTS_API_DIR/.env" | cut -d'=' -f2 | tr -d '"' | tr -d "'" | xargs)
    if [ -n "$TTS_API_KEY" ] && [ "$TTS_API_KEY" != "your_api_key_here" ]; then
        export TTS_API_KEY="$TTS_API_KEY"
        echo -e "${GREEN}✓${NC} 从 TTS .env 文件读取 API Key"
    fi
fi

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

# ========================================
# 启动 TTS 服务
# ========================================
if [ -d "$TTS_API_DIR" ]; then
    echo -e "${BLUE}🚀 检查 TTS 服务...${NC}"
    
    # 获取虚拟环境目录名（如果之前没有检测过，这里会提示用户选择）
    PLATFORM=$(detect_platform)
    VENV_DIR=$(get_venv_dir)
    echo -e "${GREEN}✓${NC} 检测到平台: $PLATFORM，使用虚拟环境目录: $VENV_DIR"
    
    # 切换到 TTS API 目录
    cd "$TTS_API_DIR"
    
    # 检查虚拟环境是否已存在（优先检查平台特定的，其次检查通用的 venv）
    VENV_FOUND=0
    if [ -d "$VENV_DIR" ]; then
        echo -e "${GREEN}✓${NC} 发现已存在的虚拟环境: $VENV_DIR"
        # 激活虚拟环境
        source "$VENV_DIR/bin/activate"
        VENV_FOUND=1
    elif [ -d "venv" ]; then
        echo -e "${YELLOW}⚠️  发现通用虚拟环境 venv，建议使用平台特定的 $VENV_DIR${NC}"
        echo -e "${GREEN}✓${NC} 使用通用虚拟环境: venv"
        # 激活虚拟环境
        source venv/bin/activate
        VENV_FOUND=1
    fi
    
    if [ $VENV_FOUND -eq 1 ]; then
        # 检查是否已安装 uvicorn
        if ! python -c "import uvicorn" &> /dev/null; then
            echo -e "${YELLOW}📦 安装 TTS 依赖...${NC}"
            if [ -f "requirements.txt" ]; then
                pip install -r requirements.txt
                if [ $? -ne 0 ]; then
                    echo -e "${YELLOW}⚠️  TTS 依赖安装失败，尝试继续启动...${NC}"
                fi
            else
                echo -e "${YELLOW}⚠️  未找到 requirements.txt，尝试安装基础依赖...${NC}"
                pip install fastapi uvicorn[standard] python-multipart python-dotenv pydantic pydantic-settings
            fi
        else
            echo -e "${GREEN}✓${NC} TTS 依赖已安装"
        fi
            
        # 创建必要的目录
        mkdir -p models temp static
        
        # 检查 .env 文件
        if [ ! -f ".env" ]; then
            echo -e "${YELLOW}⚙️  创建 TTS .env 文件...${NC}"
            if [ -f ".env.example" ]; then
                cp ".env.example" ".env"
            else
                cat > ".env" << EOF
# TTS API 环境配置文件
API_KEY=your_api_key_here
EOF
            fi
            echo -e "${YELLOW}⚠️  请编辑 $TTS_API_DIR/.env 设置 API_KEY 等配置${NC}"
        fi
        
        # 设置环境变量
        export PYTHONPATH="$TTS_API_DIR"
        
        # 设置模型目录（如果未设置）
        if [ -z "$MODELS_DIR" ]; then
            if [ -d "/mnt/d/Docker/ReadKnows/tts-models" ]; then
                export MODELS_DIR="/mnt/d/Docker/ReadKnows/tts-models"
            elif [ -d "$HOME/Docker/ReadKnows/tts-models" ]; then
                export MODELS_DIR="$HOME/Docker/ReadKnows/tts-models"
            else
                export MODELS_DIR="$TTS_API_DIR/models"
            fi
        fi
        
        # 检查端口 5050
        if [ $PORT_5050_OK -eq 1 ]; then
            echo -e "${BLUE}🚀 启动 TTS 服务...${NC}"
            
            # 启动 TTS 服务（在后台）
            uvicorn app.main:app --host 0.0.0.0 --port 5050 > "$PROJECT_DIR/tts-api.log" 2>&1 &
            TTS_PID=$!
            
            # 等待 TTS 服务启动
            echo "等待 TTS 服务启动..."
            sleep 3
            
            # 检查 TTS 服务是否启动成功
            if kill -0 $TTS_PID 2>/dev/null; then
                if curl -s http://localhost:5050/docs > /dev/null 2>&1; then
                    echo -e "${GREEN}✓${NC} TTS 服务启动成功 (PID: $TTS_PID)"
                    echo -e "   TTS API地址: ${BLUE}http://localhost:5050${NC}"
                    echo -e "   API文档: ${BLUE}http://localhost:5050/docs${NC}"
                    TTS_STARTED=1
                else
                    echo -e "${YELLOW}⚠️  TTS 进程已启动，但API未响应，请查看日志: $PROJECT_DIR/tts-api.log${NC}"
                    TTS_STARTED=1
                fi
            else
                echo -e "${RED}❌ TTS 启动失败，请查看日志: $PROJECT_DIR/tts-api.log${NC}"
                cat "$PROJECT_DIR/tts-api.log" | tail -20
                TTS_STARTED=0
            fi
        else
            echo -e "${YELLOW}⚠️  端口 5050 已被占用，跳过 TTS 服务启动${NC}"
            TTS_STARTED=0
        fi
        
        # 取消激活虚拟环境
        deactivate 2>/dev/null || true
    else
        # 虚拟环境不存在，需要检查 Python 3.11 来创建
        echo -e "${YELLOW}📦 虚拟环境不存在，检查 Python 3.11...${NC}"
        
        # 检查 Python 3.11
        PYTHON_CMD=""
        if command -v python3.11 &> /dev/null; then
            PYTHON_CMD="python3.11"
        elif command -v python3 &> /dev/null; then
            PYTHON_VERSION=$(python3 --version 2>&1 | grep -oE "3\.11" || echo "")
            if [ -n "$PYTHON_VERSION" ]; then
                PYTHON_CMD="python3"
            fi
        fi
        
        if [ -z "$PYTHON_CMD" ]; then
            echo -e "${YELLOW}⚠️  未找到 Python 3.11，跳过 TTS 服务启动${NC}"
            echo -e "   提示: 请安装 Python 3.11: https://www.python.org/downloads/"
            echo -e "   或者手动在 $TTS_API_DIR 目录下创建虚拟环境: python3.11 -m venv $VENV_DIR"
            TTS_STARTED=0
        else
            echo -e "${GREEN}✓${NC} 找到 Python: $PYTHON_CMD"
            echo -e "${YELLOW}📦 创建 TTS 虚拟环境: $VENV_DIR...${NC}"
            $PYTHON_CMD -m venv "$VENV_DIR"
            if [ $? -ne 0 ]; then
                echo -e "${RED}❌ 虚拟环境创建失败${NC}"
                TTS_STARTED=0
            else
                echo -e "${GREEN}✓${NC} 虚拟环境创建成功: $VENV_DIR"
                # 重新激活虚拟环境并安装依赖
                source "$VENV_DIR/bin/activate"
                echo -e "${YELLOW}📦 安装 TTS 依赖...${NC}"
                if [ -f "requirements.txt" ]; then
                    pip install -r requirements.txt
                else
                    pip install fastapi uvicorn[standard] python-multipart python-dotenv pydantic pydantic-settings
                fi
                
                # 创建必要的目录
                mkdir -p models temp static
                
                # 检查 .env 文件
                if [ ! -f ".env" ]; then
                    if [ -f ".env.example" ]; then
                        cp ".env.example" ".env"
                    else
                        cat > ".env" << EOF
# TTS API 环境配置文件
API_KEY=your_api_key_here
EOF
                    fi
                fi
                
                # 设置环境变量
                export PYTHONPATH="$TTS_API_DIR"
                
                # 设置模型目录
                if [ -z "$MODELS_DIR" ]; then
                    export MODELS_DIR="$TTS_API_DIR/models"
                fi
                
                # 检查端口并启动服务
                if [ $PORT_5050_OK -eq 1 ]; then
                    echo -e "${BLUE}🚀 启动 TTS 服务...${NC}"
                    uvicorn app.main:app --host 0.0.0.0 --port 5050 > "$PROJECT_DIR/tts-api.log" 2>&1 &
                    TTS_PID=$!
                    sleep 3
                    if kill -0 $TTS_PID 2>/dev/null; then
                        if curl -s http://localhost:5050/docs > /dev/null 2>&1; then
                            echo -e "${GREEN}✓${NC} TTS 服务启动成功 (PID: $TTS_PID)"
                            echo -e "   TTS API地址: ${BLUE}http://localhost:5050${NC}"
                            echo -e "   API文档: ${BLUE}http://localhost:5050/docs${NC}"
                            echo -e "   API测试: ${BLUE}http://localhost:5050/test${NC}"
                            TTS_STARTED=1
                        else
                            echo -e "${YELLOW}⚠️  TTS 进程已启动，但API未响应${NC}"
                            TTS_STARTED=1
                        fi
                    else
                        echo -e "${RED}❌ TTS 启动失败，请查看日志: $PROJECT_DIR/tts-api.log${NC}"
                        TTS_STARTED=0
                    fi
                else
                    echo -e "${YELLOW}⚠️  端口 5050 已被占用，跳过 TTS 服务启动${NC}"
                    TTS_STARTED=0
                fi
                
                deactivate 2>/dev/null || true
            fi
        fi
    fi
    
    # 返回项目根目录
    cd "$PROJECT_DIR"
else
    echo -e "${YELLOW}ℹ️  未找到 TTS API 目录，跳过 TTS 服务启动${NC}"
    TTS_STARTED=0
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
if [ "${TTS_STARTED:-0}" -eq 1 ]; then
    echo -e "  TTS API: ${BLUE}http://localhost:5050${NC}"
    echo -e "  TTS 文档: ${BLUE}http://localhost:5050/docs${NC}"
fi
echo ""
if [ "$LOCAL_IP" != "localhost" ] && [ -n "$LOCAL_IP" ]; then
    echo -e "${YELLOW}局域网访问：${NC}"
    echo -e "  前端: ${GREEN}http://${LOCAL_IP}:1280${NC}"
    echo -e "  后端: ${GREEN}http://${LOCAL_IP}:1281${NC}"
    echo -e "  OPDS: ${GREEN}http://${LOCAL_IP}:1281/opds/${NC}"
    if [ "${TTS_STARTED:-0}" -eq 1 ]; then
        echo -e "  TTS API: ${GREEN}http://${LOCAL_IP}:5050${NC}"
    fi
    echo ""
    echo -e "${YELLOW}💡 提示: 确保防火墙允许端口 1280、1281"
    if [ "${TTS_STARTED:-0}" -eq 1 ]; then
        echo -e "💡 提示: 确保防火墙允许端口 5050 (TTS)${NC}"
    else
        echo -e "${NC}"
    fi
    echo ""
fi
echo -e "日志文件:"
echo -e "  后端: ${YELLOW}$PROJECT_DIR/backend.log${NC}"
echo -e "  前端: ${YELLOW}$PROJECT_DIR/frontend.log${NC}"
if [ "${TTS_STARTED:-0}" -eq 1 ]; then
    echo -e "  TTS API: ${YELLOW}$PROJECT_DIR/tts-api.log${NC}"
fi
echo ""
echo -e "${YELLOW}按 Ctrl+C 停止服务${NC}"
echo ""

# 保持脚本运行
wait

