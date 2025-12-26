#!/bin/bash

# TTS API Docker 一键安装部署脚本
# 支持全平台：macOS, Windows (WSL), Linux, 群晖 NAS

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
}

# 检测操作系统平台
detect_platform() {
    local platform=""
    
    # 检测 macOS
    if [ "$(uname -s)" = "Darwin" ]; then
        platform="macos"
    # 检测 Windows (WSL 或 Git Bash)
    elif [ -n "$WSL_DISTRO_NAME" ] || [ -n "$WSLENV" ] || [ "$(uname -s)" = "MINGW64_NT" ] || [ "$(uname -s)" = "MSYS_NT" ]; then
        platform="windows"
    # 检测 Linux/群晖（群晖也使用 Linux 配置）
    elif [ "$(uname -s)" = "Linux" ]; then
        platform="linux"
    else
        platform="unknown"
    fi
    
    echo "$platform"
}

# 检测是否在群晖/NAS环境中
detect_nas_environment() {
    # 方法1: 检查环境变量
    if [ "$SYNOLOGY" = "true" ] || [ "$SYNO" = "true" ] || [ "$NAS" = "true" ]; then
        return 0
    fi
    
    # 方法2: 检查主机名
    if command -v hostname &> /dev/null; then
        HOSTNAME=$(hostname | tr '[:upper:]' '[:lower:]')
        if echo "$HOSTNAME" | grep -qE "(synology|diskstation|ds[0-9])"; then
            return 0
        fi
    fi
    
    # 方法3: 检查系统文件
    if [ -f "/etc/synoinfo.conf" ]; then
        return 0
    fi
    
    return 1
}

# 检查Docker是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "未找到 Docker，请先安装 Docker"
        echo ""
        print_info "安装Docker的方法:"
        case $PLATFORM in
            macos)
                echo "  macOS: 下载并安装 Docker Desktop"
                echo "  访问: https://www.docker.com/products/docker-desktop"
                ;;
            windows)
                echo "  Windows: 下载并安装 Docker Desktop"
                echo "  访问: https://www.docker.com/products/docker-desktop"
                echo "  或使用 WSL 2: wsl --install"
                ;;
            linux)
                echo "  Ubuntu/Debian: curl -fsSL https://get.docker.com | sh"
                echo "  CentOS/RHEL: curl -fsSL https://get.docker.com | sh"
                echo "  或访问: https://docs.docker.com/get-docker/"
                ;;
        esac
        exit 1
    fi
    print_success "Docker 已安装: $(docker --version)"
}

# 检查Docker Compose是否安装
check_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
        print_success "Docker Compose 已安装: $(docker-compose --version)"
    elif docker compose version &> /dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
        print_success "Docker Compose 已安装: $(docker compose version)"
    else
        print_error "未找到 Docker Compose，请先安装 Docker Compose"
        echo ""
        print_info "安装Docker Compose的方法:"
        case $PLATFORM in
            macos|windows)
                echo "  Docker Desktop 已包含 Docker Compose"
                echo "  请确保 Docker Desktop 已更新到最新版本"
                ;;
            linux)
                echo "  Ubuntu/Debian: sudo apt-get install docker-compose-plugin"
                echo "  或访问: https://docs.docker.com/compose/install/"
                ;;
        esac
        exit 1
    fi
}

# 检查Docker服务是否运行
check_docker_service() {
    if ! docker info &> /dev/null; then
        print_error "Docker 服务未运行，请启动 Docker 服务"
        echo ""
        print_info "启动Docker服务的方法:"
        case $PLATFORM in
            macos|windows)
                echo "  打开 Docker Desktop 应用程序"
                ;;
            linux)
                echo "  sudo systemctl start docker"
                echo "  sudo systemctl enable docker  # 设置开机自启"
                ;;
        esac
        exit 1
    fi
    print_success "Docker 服务正在运行"
}

# 获取项目根目录
get_project_root() {
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    echo "$SCRIPT_DIR"
}

# 选择 docker-compose 文件
select_compose_file() {
    PROJECT_ROOT=$(get_project_root)
    COMPOSE_FILE=""
    COMPOSE_FILE_NAME=""
    
    # 检测 NAS 环境
    if detect_nas_environment; then
        print_info "检测到群晖 NAS 环境"
        if [ -f "$PROJECT_ROOT/docker-compose-synology.yml" ]; then
            COMPOSE_FILE="$PROJECT_ROOT/docker-compose-synology.yml"
            COMPOSE_FILE_NAME="docker-compose-synology.yml"
        fi
    fi
    
    # 根据平台选择文件
    if [ -z "$COMPOSE_FILE" ]; then
        case $PLATFORM in
            macos)
                if [ -f "$PROJECT_ROOT/docker-compose-macos.yml" ]; then
                    COMPOSE_FILE="$PROJECT_ROOT/docker-compose-macos.yml"
                    COMPOSE_FILE_NAME="docker-compose-macos.yml"
                fi
                ;;
            windows)
                if [ -f "$PROJECT_ROOT/docker-compose-windows.yml" ]; then
                    COMPOSE_FILE="$PROJECT_ROOT/docker-compose-windows.yml"
                    COMPOSE_FILE_NAME="docker-compose-windows.yml"
                fi
                ;;
            linux)
                if [ -f "$PROJECT_ROOT/docker-compose-linux.yml" ]; then
                    COMPOSE_FILE="$PROJECT_ROOT/docker-compose-linux.yml"
                    COMPOSE_FILE_NAME="docker-compose-linux.yml"
                fi
                ;;
        esac
    fi
    
    # 如果没有找到平台特定的文件，使用默认文件
    if [ -z "$COMPOSE_FILE" ]; then
        if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
            COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
            COMPOSE_FILE_NAME="docker-compose.yml"
        else
            print_error "未找到 docker-compose.yml 文件"
            exit 1
        fi
    fi
    
    print_info "使用配置文件: $COMPOSE_FILE_NAME"
}

# 创建必要的目录
create_directories() {
    PROJECT_ROOT=$(get_project_root)
    
    print_info "创建必要的目录..."
    
    # 创建模型目录
    mkdir -p "$PROJECT_ROOT/models"/{indextts2,cosyvoice,multitts}/reference_audio
    
    # 创建临时目录
    mkdir -p "$PROJECT_ROOT/temp"
    
    # 创建静态文件目录
    mkdir -p "$PROJECT_ROOT/static"
    
    print_success "目录创建完成"
}

# 创建 .env 文件
create_env_file() {
    PROJECT_ROOT=$(get_project_root)
    ENV_FILE="$PROJECT_ROOT/.env"
    
    if [ -f "$ENV_FILE" ]; then
        print_warning ".env 文件已存在"
        read -p "是否覆盖现有 .env 文件? (y/N): " overwrite
        if [[ ! $overwrite =~ ^[Yy]$ ]]; then
            print_info "跳过 .env 文件创建"
            return
        fi
    fi
    
    print_info "创建 .env 文件..."
    
    # 生成随机 API Key
    API_KEY=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)
    
    cat > "$ENV_FILE" << EOF
# TTS API Configuration
PORT=5050
API_KEY=${API_KEY}

# Model directories
MODELS_DIR=./models
TEMP_DIR=./temp

# FFmpeg binary (optional, for audio conversion)
FFMPEG_BIN=ffmpeg

# Docker environment
IS_DOCKER=true

# TTS Engine specific settings
# Qwen-TTS: API key if required
QWEN_API_KEY=

# IndexTTS2
INDEXTTS2_PATH=/app/models/indextts2/index-tts
EOF
    
    print_success ".env 文件已创建"
    print_warning "API Key: ${API_KEY}"
    print_warning "请妥善保管 API Key，不要泄露"
}

# 检查端口是否被占用
check_port() {
    local port=$1
    local service_name=$2
    
    if command -v lsof &> /dev/null; then
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_warning "端口 $port 已被占用 ($service_name)"
            read -p "是否继续? (y/N): " continue_install
            if [[ ! $continue_install =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    elif command -v netstat &> /dev/null; then
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            print_warning "端口 $port 可能已被占用 ($service_name)"
            read -p "是否继续? (y/N): " continue_install
            if [[ ! $continue_install =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    fi
}

# 构建 Docker 镜像
build_image() {
    PROJECT_ROOT=$(get_project_root)
    cd "$PROJECT_ROOT"
    
    print_info "构建 Docker 镜像..."
    
    if docker build -t readknow-tts-api:latest .; then
        print_success "Docker 镜像构建成功"
    else
        print_error "Docker 镜像构建失败"
        exit 1
    fi
}

# 启动服务
start_service() {
    PROJECT_ROOT=$(get_project_root)
    cd "$PROJECT_ROOT"
    
    print_info "启动 TTS API 服务..."
    
    # 停止现有容器（如果存在）
    if docker ps -a --format "{{.Names}}" | grep -qE "^readknow-tts-api$"; then
        print_warning "发现已存在的容器"
        read -p "是否停止并删除现有容器? (Y/n，默认: Y): " remove_existing
        remove_existing=${remove_existing:-y}
        if [ "$remove_existing" = "y" ] || [ "$remove_existing" = "Y" ]; then
            print_info "停止并删除现有容器..."
            $COMPOSE_CMD -f "$COMPOSE_FILE" down 2>/dev/null || true
            docker stop readknow-tts-api 2>/dev/null || true
            docker rm readknow-tts-api 2>/dev/null || true
            print_success "现有容器已删除"
        fi
    fi
    
    # 启动服务
    if $COMPOSE_CMD -f "$COMPOSE_FILE" up -d; then
        print_success "TTS API 服务启动成功"
    else
        print_error "TTS API 服务启动失败"
        exit 1
    fi
}

# 显示服务信息
show_service_info() {
    print_header "服务信息"
    
    print_info "服务状态:"
    docker ps --filter "name=readknow-tts-api" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    echo ""
    print_info "访问地址:"
    echo "  API 文档 (Swagger): http://localhost:5050/docs"
    echo "  API 文档 (ReDoc): http://localhost:5050/redoc"
    echo "  测试页面: http://localhost:5050/test"
    echo "  健康检查: http://localhost:5050/health"
    
    echo ""
    print_info "查看日志:"
    echo "  docker logs -f readknow-tts-api"
    
    echo ""
    print_info "停止服务:"
    echo "  docker stop readknow-tts-api"
    echo "  或: cd $(get_project_root) && $COMPOSE_CMD -f $COMPOSE_FILE_NAME down"
    
    echo ""
    print_info "重启服务:"
    echo "  docker restart readknow-tts-api"
    echo "  或: cd $(get_project_root) && $COMPOSE_CMD -f $COMPOSE_FILE_NAME restart"
}

# 主函数
main() {
    print_header "TTS API Docker 安装脚本"
    
    # 检测平台
    PLATFORM=$(detect_platform)
    print_info "检测到平台: $PLATFORM"
    
    # 检查 Docker
    print_header "检查环境"
    check_docker
    check_docker_compose
    check_docker_service
    
    # 选择 docker-compose 文件
    print_header "选择配置文件"
    select_compose_file
    
    # 检查端口
    check_port 5050 "TTS API"
    
    # 创建目录和配置文件
    print_header "创建配置"
    create_directories
    create_env_file
    
    # 构建镜像
    print_header "构建镜像"
    read -p "是否现在构建 Docker 镜像? (Y/n，默认: Y): " build_image_confirm
    build_image_confirm=${build_image_confirm:-y}
    if [ "$build_image_confirm" = "y" ] || [ "$build_image_confirm" = "Y" ]; then
        build_image
    else
        print_info "跳过镜像构建"
    fi
    
    # 启动服务
    print_header "启动服务"
    read -p "是否现在启动服务? (Y/n，默认: Y): " start_service_confirm
    start_service_confirm=${start_service_confirm:-y}
    if [ "$start_service_confirm" = "y" ] || [ "$start_service_confirm" = "Y" ]; then
        start_service
        sleep 2
        show_service_info
    else
        print_info "跳过服务启动"
        echo ""
        print_info "手动启动服务:"
        echo "  cd $(get_project_root)"
        echo "  $COMPOSE_CMD -f $COMPOSE_FILE_NAME up -d"
    fi
    
    print_header "安装完成"
}

# 运行主函数
main

