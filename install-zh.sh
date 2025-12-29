#!/bin/bash

# ReadKnows (读士私人书库) 一键安装部署脚本
# 用于安装和部署 ReadKnows Docker 容器

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

# 检查Docker是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "未找到 Docker，请先安装 Docker"
        echo ""
        print_info "安装Docker的方法:"
        echo "  Ubuntu/Debian: curl -fsSL https://get.docker.com | sh"
        echo "  或访问: https://docs.docker.com/get-docker/"
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
        echo "  访问: https://docs.docker.com/compose/install/"
        exit 1
    fi
}

# 检查Docker服务是否运行
check_docker_service() {
    if ! docker info &> /dev/null; then
        print_error "Docker 服务未运行，请启动 Docker 服务"
        echo ""
        print_info "启动Docker服务的方法:"
        echo "  Linux: sudo systemctl start docker"
        echo "  macOS: 打开 Docker Desktop"
        exit 1
    fi
    print_success "Docker 服务正在运行"
}

# 检查Docker镜像源配置
check_docker_registry() {
    print_info "检查 Docker 镜像源配置..."
    
    # 获取镜像源配置
    REGISTRY_INFO=$(docker info 2>/dev/null | grep -A 10 "Registry Mirrors" || echo "")
    
    if [ -z "$REGISTRY_INFO" ] || echo "$REGISTRY_INFO" | grep -q "hub-mirror.c.163.com"; then
        # 测试镜像源连通性
        if echo "$REGISTRY_INFO" | grep -q "hub-mirror.c.163.com"; then
            print_warning "检测到可能无法访问的镜像源: hub-mirror.c.163.com"
            echo ""
            print_info "如果构建失败，请运行修复脚本："
            echo "  ./fix-docker-registry.sh"
            echo ""
            print_info "或者手动修复："
            echo "  1. 打开 Docker Desktop"
            echo "  2. 设置 → Docker Engine"
            echo "  3. 删除或替换无法访问的镜像源"
            echo "  4. 点击 'Apply & Restart'"
            echo ""
            read -p "是否继续安装? (Y/n，默认: Y): " continue_with_registry
            continue_with_registry=${continue_with_registry:-y}
            if [ "$continue_with_registry" != "y" ] && [ "$continue_with_registry" != "Y" ]; then
                print_info "已取消安装，请先修复镜像源配置"
                exit 0
            fi
        fi
    else
        print_success "Docker 镜像源配置正常"
    fi
}

# 获取项目根目录
get_project_root() {
    # 获取脚本所在目录
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    # 如果脚本在 sh/ 目录下，返回上一级目录（项目根目录）
    if [ "$(basename "$SCRIPT_DIR")" = "sh" ]; then
        echo "$(dirname "$SCRIPT_DIR")"
    # 如果脚本在 tts-service 目录下，返回上一级目录（项目根目录）
    elif [ "$(basename "$SCRIPT_DIR")" = "tts-service" ]; then
        echo "$(dirname "$SCRIPT_DIR")"
    # 否则返回脚本所在目录
    else
        echo "$SCRIPT_DIR"
    fi
}

# 检测操作系统平台
detect_platform() {
    local platform=""
    local uname_s=$(uname -s)
    
    # 检测 macOS
    if [ "$uname_s" = "Darwin" ]; then
        platform="macos"
    # 检测 Windows (WSL 或 Git Bash)
    elif [ -n "$WSL_DISTRO_NAME" ] || [ -n "$WSLENV" ] || \
         echo "$uname_s" | grep -qE "^MINGW(64|32)_NT" || \
         echo "$uname_s" | grep -qE "^MSYS_NT" || \
         echo "$uname_s" | grep -qE "^CYGWIN_NT"; then
        platform="windows"
    # 检测 Linux/群晖（群晖也使用 Linux 配置）
    elif [ "$uname_s" = "Linux" ]; then
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
    
    # 方法3: 检查是否在Docker容器中且可能是NAS环境
    if [ -f "/.dockerenv" ]; then
        # 检查网络接口（群晖Docker通常有特定配置）
        if [ -f "/proc/net/route" ] && grep -q "172\.17\|172\.18" /proc/net/route 2>/dev/null; then
            return 0
        fi
    fi
    
    return 1
}

# 全局变量：docker-compose文件路径
COMPOSE_FILE_PATH=""

# 手动选择docker-compose文件
manual_select_compose_file() {
    PROJECT_ROOT=$(get_project_root)
    
    print_info "请选择部署环境:"
    echo "  1) 标准环境 (sh/docker-compose.yml) - 通用配置"
    echo "  2) macOS 环境 (sh/docker-compose-MACOS.yml)"
    echo "  3) Windows 环境 (sh/docker-compose-WINDOWS.yml)"
    echo "  4) Linux 环境 (sh/docker-compose-Linux.yml)"
    echo "  5) 群晖/Synology 环境 (sh/docker-compose-Synology.yml)"
    echo ""
    read -p "请输入选项 (1-5，默认: 1): " env_choice
    env_choice=${env_choice:-1}
    
    case $env_choice in
        2)
            if [ -f "$PROJECT_ROOT/sh/docker-compose-MACOS.yml" ]; then
                COMPOSE_FILE_PATH="$PROJECT_ROOT/sh/docker-compose-MACOS.yml"
                print_success "使用 macOS 配置: sh/docker-compose-MACOS.yml"
                return 0
            else
                print_warning "未找到 sh/docker-compose-MACOS.yml，使用默认配置"
            fi
            ;;
        3)
            if [ -f "$PROJECT_ROOT/sh/docker-compose-WINDOWS.yml" ]; then
                COMPOSE_FILE_PATH="$PROJECT_ROOT/sh/docker-compose-WINDOWS.yml"
                print_success "使用 Windows 配置: sh/docker-compose-WINDOWS.yml"
                return 0
            else
                print_warning "未找到 sh/docker-compose-WINDOWS.yml，使用默认配置"
            fi
            ;;
        4)
            if [ -f "$PROJECT_ROOT/sh/docker-compose-Linux.yml" ]; then
                COMPOSE_FILE_PATH="$PROJECT_ROOT/sh/docker-compose-Linux.yml"
                print_success "使用 Linux 配置: sh/docker-compose-Linux.yml"
                return 0
            else
                print_warning "未找到 sh/docker-compose-Linux.yml，使用默认配置"
            fi
            ;;
        5)
            if [ -f "$PROJECT_ROOT/sh/docker-compose-Synology.yml" ]; then
                COMPOSE_FILE_PATH="$PROJECT_ROOT/sh/docker-compose-Synology.yml"
                print_success "使用群晖/Synology 配置: sh/docker-compose-Synology.yml"
                return 0
            else
                print_warning "未找到 sh/docker-compose-Synology.yml，使用默认配置"
            fi
            ;;
        1|*)
            ;;
    esac
    
    # 默认使用 docker-compose.yml
    if [ -f "$PROJECT_ROOT/sh/docker-compose.yml" ]; then
        COMPOSE_FILE_PATH="$PROJECT_ROOT/sh/docker-compose.yml"
        print_success "使用标准配置: sh/docker-compose.yml"
        return 0
    else
        print_error "未找到 sh/docker-compose.yml 文件"
        exit 1
    fi
}

# 选择docker-compose文件
select_compose_file() {
    PROJECT_ROOT=$(get_project_root)
    
    # 如果环境变量指定了COMPOSE_FILE，使用它
    if [ -n "$COMPOSE_FILE" ]; then
        # 如果路径以 sh/ 开头，直接使用；否则尝试在 sh/ 目录下查找
        if [ -f "$PROJECT_ROOT/$COMPOSE_FILE" ]; then
            COMPOSE_FILE_PATH="$PROJECT_ROOT/$COMPOSE_FILE"
            print_info "使用环境变量指定的配置文件: $COMPOSE_FILE"
            return 0
        elif [ -f "$PROJECT_ROOT/sh/$COMPOSE_FILE" ]; then
            COMPOSE_FILE_PATH="$PROJECT_ROOT/sh/$COMPOSE_FILE"
            print_info "使用环境变量指定的配置文件: sh/$COMPOSE_FILE"
            return 0
        else
            print_warning "环境变量指定的配置文件不存在: $COMPOSE_FILE，将进行自动选择"
        fi
    fi
    
    # 检测平台
    PLATFORM=$(detect_platform)
    print_info "检测到平台: $PLATFORM"
    
    # 根据平台选择对应的 docker-compose 文件
    AUTO_SELECTED_FILE=""
    AUTO_SELECTED_NAME=""
    
    case $PLATFORM in
        macos)
            if [ -f "$PROJECT_ROOT/sh/docker-compose-MACOS.yml" ]; then
                AUTO_SELECTED_FILE="$PROJECT_ROOT/sh/docker-compose-MACOS.yml"
                AUTO_SELECTED_NAME="sh/docker-compose-MACOS.yml"
            fi
            ;;
        windows)
            if [ -f "$PROJECT_ROOT/sh/docker-compose-WINDOWS.yml" ]; then
                AUTO_SELECTED_FILE="$PROJECT_ROOT/sh/docker-compose-WINDOWS.yml"
                AUTO_SELECTED_NAME="sh/docker-compose-WINDOWS.yml"
            fi
            ;;
        linux)
            # Linux 平台（包括群晖），优先使用 Linux 配置，其次使用 Synology 配置，最后使用默认配置
            if [ -f "$PROJECT_ROOT/sh/docker-compose-Linux.yml" ]; then
                AUTO_SELECTED_FILE="$PROJECT_ROOT/sh/docker-compose-Linux.yml"
                AUTO_SELECTED_NAME="sh/docker-compose-Linux.yml"
            elif [ -f "$PROJECT_ROOT/sh/docker-compose-Synology.yml" ]; then
                AUTO_SELECTED_FILE="$PROJECT_ROOT/sh/docker-compose-Synology.yml"
                AUTO_SELECTED_NAME="sh/docker-compose-Synology.yml"
            elif [ -f "$PROJECT_ROOT/sh/docker-compose.yml" ]; then
                AUTO_SELECTED_FILE="$PROJECT_ROOT/sh/docker-compose.yml"
                AUTO_SELECTED_NAME="sh/docker-compose.yml (标准配置)"
            fi
            ;;
        unknown)
            # 未知平台，使用默认配置
            if [ -f "$PROJECT_ROOT/sh/docker-compose.yml" ]; then
                AUTO_SELECTED_FILE="$PROJECT_ROOT/sh/docker-compose.yml"
                AUTO_SELECTED_NAME="sh/docker-compose.yml (标准配置)"
            fi
            ;;
    esac
    # if [-n "$Auto-test-c"]
    # 如果自动选择成功，询问用户是否确认
    if [ -n "$AUTO_SELECTED_FILE" ] && [ -f "$AUTO_SELECTED_FILE" ]; then
        print_success "已自动选择配置文件: $AUTO_SELECTED_NAME"
        echo ""
        read -p "是否使用此配置? (Y/n，默认: Y): " confirm_choice
        confirm_choice=${confirm_choice:-y}
        
        if [ "$confirm_choice" = "y" ] || [ "$confirm_choice" = "Y" ]; then
            COMPOSE_FILE_PATH="$AUTO_SELECTED_FILE"
            print_success "确认使用: $AUTO_SELECTED_NAME"
        return 0
    else
            print_info "取消自动选择，请手动选择配置"
            echo ""
            manual_select_compose_file
            return $?
        fi
    else
        # 如果自动选择失败，直接询问用户
        print_warning "无法自动选择配置文件，请手动选择"
        echo ""
        manual_select_compose_file
        return $?
    fi
}

# 检查必要的文件
check_files() {
    PROJECT_ROOT=$(get_project_root)
    
    # 选择docker-compose文件
    select_compose_file
    
    # 更新COMPOSE_CMD以包含-f参数
    if [ -n "$COMPOSE_FILE_PATH" ]; then
        COMPOSE_CMD="$COMPOSE_CMD -f $COMPOSE_FILE_PATH"
        print_info "Docker Compose 命令: $COMPOSE_CMD"
    fi
    
    if [ ! -f "$PROJECT_ROOT/backend/Dockerfile" ]; then
        print_warning "未找到后端 Dockerfile，将使用 docker-compose 构建"
    fi
    
    if [ ! -f "$PROJECT_ROOT/frontend/Dockerfile" ]; then
        print_warning "未找到前端 Dockerfile，将使用 docker-compose 构建"
    fi
    
    print_success "必要文件检查完成"
}

# 创建.env文件
create_env_file() {
    PROJECT_ROOT=$(get_project_root)
    ENV_FILE="$PROJECT_ROOT/.env"
    
    if [ -f "$ENV_FILE" ]; then
        print_info ".env 文件已存在，跳过创建"
        return
    fi
    
    print_info "创建 .env 配置文件..."
    
    # 生成随机JWT密钥
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
    
    cat > "$ENV_FILE" << EOF
# JWT配置
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

# 豆瓣API配置（可选）
DOUBAN_API_BASE=

# AI配置（可选）
AI_PROVIDER=ollama
AI_API_URL=http://frontend:1280/ollama-proxy
AI_API_KEY=
AI_MODEL=llama2

# Ollama服务器地址（用于nginx代理）
# 如果ollama在宿主机上，使用: http://host.docker.internal:11434
# 如果ollama在局域网其他机器上，使用: http://192.168.1.100:11434
OLLAMA_URL=http://host.docker.internal:11434

# TTS配置（可选）
# Qwen3-TTS API密钥（如果需要使用Qwen3-TTS，需要配置此密钥）
# 获取方式：访问 https://dashscope.console.aliyun.com/ 申请API密钥
QWEN3_TTS_API_KEY=
QWEN3_TTS_API_URL=https://dashscope.aliyuncs.com/api/v1/services/audio/tts
EOF
    
    print_success ".env 文件已创建: $ENV_FILE"
    print_warning "请根据需要编辑 .env 文件中的配置"
}

# 创建必要的目录
create_directories() {
    PROJECT_ROOT=$(get_project_root)
    
    print_info "创建必要的目录..."
    
    # 根据选择的compose文件判断是否是NAS环境
    if echo "$COMPOSE_FILE_PATH" | grep -qiE "(NAS|Synology|Linux)"; then
        # NAS环境的默认路径
        DEFAULT_DATA_DIR="/volume5/docker/ReadKnows"
        if [ -d "$DEFAULT_DATA_DIR" ]; then
            print_info "使用NAS默认数据目录: $DEFAULT_DATA_DIR"
        else
            print_warning "NAS默认数据目录不存在: $DEFAULT_DATA_DIR"
            print_info "请确保在 docker-compose-NAS.yml 中配置了正确的卷路径"
        fi
    else
        # 标准环境的默认路径
        DEFAULT_DATA_DIR="$PROJECT_ROOT/data"
        if [ ! -d "$DEFAULT_DATA_DIR" ]; then
            mkdir -p "$DEFAULT_DATA_DIR/ReadKnows/data"
            mkdir -p "$DEFAULT_DATA_DIR/ReadKnows/books"
            mkdir -p "$DEFAULT_DATA_DIR/ReadKnows/covers"
            mkdir -p "$DEFAULT_DATA_DIR/ReadKnows/fonts"
            mkdir -p "$DEFAULT_DATA_DIR/ReadKnows/import"
            print_info "已创建本地数据目录: $DEFAULT_DATA_DIR"
        else
            print_info "数据目录已存在: $DEFAULT_DATA_DIR"
        fi
        print_warning "如需使用其他路径，请修改 docker-compose.yml 中的 volumes 配置"
    fi
}

# 检查端口占用
check_ports() {
    print_info "检查端口占用..."
    
    check_port() {
        local port=$1
        local name=$2
        
        if command -v lsof &> /dev/null; then
            if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
                print_warning "端口 $port ($name) 已被占用"
                return 1
            else
                print_success "端口 $port ($name) 可用"
                return 0
            fi
        elif command -v netstat &> /dev/null; then
            if netstat -tuln 2>/dev/null | grep -q ":$port "; then
                print_warning "端口 $port ($name) 已被占用"
                return 1
            else
                print_success "端口 $port ($name) 可用"
                return 0
            fi
        else
            print_warning "未找到端口检查工具，跳过检查"
            return 0
        fi
    }
    
    PORT_1280_OK=0
    PORT_1281_OK=0
    
    check_port 1280 "前端" && PORT_1280_OK=1
    check_port 1281 "后端" && PORT_1281_OK=1
    
    if [ $PORT_1280_OK -eq 0 ] || [ $PORT_1281_OK -eq 0 ]; then
        print_warning "部分端口已被占用，但将继续安装"
        echo ""
        read -p "是否继续? (Y/n，默认: Y): " continue_install
        continue_install=${continue_install:-y}
        if [ "$continue_install" != "y" ] && [ "$continue_install" != "Y" ]; then
            print_info "已取消安装"
            exit 0
        fi
    fi
}

# 停止现有容器
stop_existing_containers() {
    print_info "检查现有容器..."
    
    if $COMPOSE_CMD ps -q | grep -q .; then
        print_warning "发现正在运行的容器"
        echo ""
        read -p "是否停止并删除现有容器? (Y/n，默认: Y): " remove_existing
        remove_existing=${remove_existing:-y}
        if [ "$remove_existing" = "y" ] || [ "$remove_existing" = "Y" ]; then
            print_info "停止并删除现有容器..."
            $COMPOSE_CMD down
            print_success "现有容器已停止并删除"
        fi
    else
        print_success "未发现正在运行的容器"
    fi
}

# 检查镜像是否存在
check_images_exist() {
    BACKEND_EXISTS=false
    FRONTEND_EXISTS=false
    
    # 从 docker-compose 文件中读取镜像名称
    if [ -f "$COMPOSE_FILE_PATH" ]; then
        # 提取 backend 服务的镜像名称（查找 backend: 部分下的 image:）
        BACKEND_IMAGE=$(awk '/backend:/,/^[[:space:]]*[a-zA-Z]/ {if (/image:/) {gsub(/^[[:space:]]*image:[[:space:]]*/, ""); gsub(/["'\'']/, ""); print; exit}}' "$COMPOSE_FILE_PATH")
        # 提取 frontend 服务的镜像名称（查找 frontend: 部分下的 image:）
        FRONTEND_IMAGE=$(awk '/frontend:/,/^[[:space:]]*[a-zA-Z]/ {if (/image:/) {gsub(/^[[:space:]]*image:[[:space:]]*/, ""); gsub(/["'\'']/, ""); print; exit}}' "$COMPOSE_FILE_PATH")
        
        # 如果提取失败，使用默认值
        if [ -z "$BACKEND_IMAGE" ]; then
            BACKEND_IMAGE="ttbye/readknows-backend:latest"
        fi
        if [ -z "$FRONTEND_IMAGE" ]; then
            FRONTEND_IMAGE="ttbye/readknows-frontend:latest"
        fi
    else
        # 如果 compose 文件不存在，使用默认值
        BACKEND_IMAGE="ttbye/readknows-backend:latest"
        FRONTEND_IMAGE="ttbye/readknows-frontend:latest"
    fi
    
    # 检查镜像是否存在（docker images 输出格式：REPOSITORY TAG）
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${BACKEND_IMAGE}$"; then
        BACKEND_EXISTS=true
        print_success "找到后端镜像: $BACKEND_IMAGE"
    else
        print_warning "未找到后端镜像: $BACKEND_IMAGE"
    fi
    
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${FRONTEND_IMAGE}$"; then
        FRONTEND_EXISTS=true
        print_success "找到前端镜像: $FRONTEND_IMAGE"
    else
        print_warning "未找到前端镜像: $FRONTEND_IMAGE"
    fi
    
    if [ "$BACKEND_EXISTS" = true ] && [ "$FRONTEND_EXISTS" = true ]; then
        return 0  # 镜像都存在
    else
        return 1  # 镜像不存在
    fi
}

# 预拉取基础镜像
pre_pull_images() {
    print_info "预拉取基础镜像以加快构建速度..."
    
    # 拉取后端基础镜像
    print_info "正在拉取 node:20-slim..."
    docker pull node:20-slim > /dev/null 2>&1 || print_warning "拉取 node:20-slim 失败，将在构建时自动下载"
    
    # 拉取前端基础镜像
    print_info "正在拉取 node:20-alpine..."
    docker pull node:20-alpine > /dev/null 2>&1 || print_warning "拉取 node:20-alpine 失败，将在构建时自动下载"
    
    print_info "正在拉取 nginx:alpine..."
    docker pull nginx:alpine > /dev/null 2>&1 || print_warning "拉取 nginx:alpine 失败，将在构建时自动下载"
    
    print_success "基础镜像预拉取完成"
}

# 构建并启动服务
build_and_start() {
    print_header "构建并启动服务"
    
    PROJECT_ROOT=$(get_project_root)
    # docker-compose 文件在 sh/ 目录下，构建上下文路径是相对于 sh/ 目录的
    # 所以需要在 sh/ 目录下执行 docker compose 命令
    COMPOSE_DIR=""
    if [ -n "$COMPOSE_FILE_PATH" ]; then
        COMPOSE_DIR="$(dirname "$COMPOSE_FILE_PATH")"
    else
        COMPOSE_DIR="$PROJECT_ROOT/sh"
    fi
    
    # 切换到 docker-compose 文件所在目录
    cd "$COMPOSE_DIR"
    
    # 检查镜像是否存在
    print_info "检查镜像是否存在..."
    if check_images_exist; then
        print_info "检测到镜像已存在，跳过构建步骤"
        print_info "直接启动服务..."
        $COMPOSE_CMD up -d
    else
        print_info "未找到镜像，将构建镜像..."
        echo ""
        print_warning "构建过程可能需要 5-15 分钟，具体取决于网络速度和系统性能"
        print_info "构建步骤包括："
        echo "  1. 下载基础镜像（node, nginx）"
        echo "  2. 安装依赖包"
        echo "  3. 编译前端代码"
        echo "  4. 编译后端代码"
        echo "  5. 安装 Calibre（后端）"
        echo ""
        read -p "是否先预拉取基础镜像以加快构建? (Y/n，默认: Y): " pre_pull
        pre_pull=${pre_pull:-y}
        if [ "$pre_pull" = "y" ] || [ "$pre_pull" = "Y" ]; then
            pre_pull_images
            echo ""
        fi
        
        print_info "开始构建镜像，请耐心等待..."
        print_info "提示: 您可以按 Ctrl+C 中断构建，然后稍后重新运行此脚本继续"
        echo ""
        
        # 使用 buildx 并行构建（如果可用）
        if docker buildx version &> /dev/null 2>&1; then
            print_info "检测到 Docker Buildx，将使用并行构建..."
            $COMPOSE_CMD build --parallel
            if [ $? -eq 0 ]; then
                print_success "镜像构建完成"
                print_info "启动服务..."
                $COMPOSE_CMD up -d
            else
                print_error "镜像构建失败"
                exit 1
            fi
        else
            # 标准构建
        $COMPOSE_CMD up -d --build
        fi
    fi
    
    if [ $? -eq 0 ]; then
        print_success "服务启动成功"
    else
        print_error "服务启动失败"
        exit 1
    fi
}

# 等待服务就绪
wait_for_services() {
    print_info "等待服务启动..."
    
    local max_attempts=30
    local attempt=0
    
    # 根据compose文件判断容器名称
    if echo "$COMPOSE_FILE_PATH" | grep -qiE "(NAS|Synology|Linux)"; then
        BACKEND_CONTAINER="knowbooks-backend"
        FRONTEND_CONTAINER="knowbooks-frontend"
    else
        BACKEND_CONTAINER="readknows-backend"
        FRONTEND_CONTAINER="readknows-frontend"
    fi
    
    while [ $attempt -lt $max_attempts ]; do
        if docker ps | grep -q "$BACKEND_CONTAINER" && docker ps | grep -q "$FRONTEND_CONTAINER"; then
            # 检查健康状态（如果使用host网络模式，健康检查可能不同）
            if docker inspect "$BACKEND_CONTAINER" --format='{{.State.Health.Status}}' 2>/dev/null | grep -q "healthy"; then
                print_success "服务已就绪"
                return 0
            elif docker inspect "$BACKEND_CONTAINER" --format='{{.State.Status}}' 2>/dev/null | grep -q "running"; then
                # 如果没有健康检查，至少检查容器是否在运行
                print_success "服务已启动（容器运行中）"
                return 0
            fi
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    echo ""
    print_warning "服务启动超时，但可能仍在运行中"
}

# 显示服务状态
show_status() {
    print_header "服务状态"
    
    echo ""
    print_info "容器状态:"
    $COMPOSE_CMD ps
    
    echo ""
    print_info "服务地址:"
    echo "  前端: http://localhost:1280"
    echo "  后端API: http://localhost:1281"
    echo ""
    
    print_info "常用命令:"
    echo "  查看日志: $COMPOSE_CMD logs -f"
    echo "  查看后端日志: $COMPOSE_CMD logs -f backend"
    echo "  查看前端日志: $COMPOSE_CMD logs -f frontend"
    echo "  停止服务: $COMPOSE_CMD down"
    echo "  重启服务: $COMPOSE_CMD restart"
    echo "  查看状态: $COMPOSE_CMD ps"
}

# 检查并安装 Calibre
check_and_install_calibre() {
    print_header "检查 Calibre 安装"
    
    print_info "检查 Calibre 是否已安装..."
    
    if docker compose exec -T backend test -f /usr/local/bin/ebook-convert 2>/dev/null || \
       docker compose exec -T backend test -f /opt/calibre/calibre/ebook-convert 2>/dev/null || \
       docker compose exec -T backend test -f /opt/calibre/ebook-convert 2>/dev/null; then
        print_success "Calibre 已安装"
        docker compose exec -T backend ebook-convert --version 2>&1 | head -1 || true
    else
        print_warning "Calibre 未安装，MOBI 转 EPUB 功能将不可用"
        echo ""
        read -p "是否现在安装 Calibre? (Y/n，默认: Y): " install_calibre
        install_calibre=${install_calibre:-y}
        if [ "$install_calibre" = "y" ] || [ "$install_calibre" = "Y" ]; then
            print_info "开始安装 Calibre..."
            PROJECT_ROOT=$(get_project_root)
            SCRIPT_PATH="$PROJECT_ROOT/sh/install-calibre.sh"
            # 如果未找到脚本，尝试兼容路径
            if [ ! -f "$SCRIPT_PATH" ]; then
                ALT_PATHS=(
                    "./sh/install-calibre.sh"
                    "../sh/install-calibre.sh"
                    "$PROJECT_ROOT/install-calibre.sh"
                )
                for p in "${ALT_PATHS[@]}"; do
                    if [ -f "$p" ]; then
                        SCRIPT_PATH="$p"
                        break
                    fi
                done
                # 仍未找到，使用 find 搜索（限定深度，避免过慢）
                if [ ! -f "$SCRIPT_PATH" ]; then
                    FOUND_PATH=$(find "$PROJECT_ROOT" -maxdepth 3 -type f -name "install-calibre.sh" 2>/dev/null | head -1)
                    if [ -n "$FOUND_PATH" ]; then
                        SCRIPT_PATH="$FOUND_PATH"
                    fi
                fi
            fi

            if [ -f "$SCRIPT_PATH" ]; then
                print_info "执行 Calibre 安装脚本: $SCRIPT_PATH"
                bash "$SCRIPT_PATH"
            else
                print_warning "未找到 install-calibre.sh 脚本"
                print_info "可以稍后手动运行: sh/install-calibre.sh"
            fi
        else
            print_info "跳过 Calibre 安装"
            print_info "您可以稍后运行: sh/install-calibre.sh"
        fi
    fi
    echo ""
}

# 初始化管理员账户
init_admin() {
    print_header "初始化管理员账户"
    
    echo ""
    read -p "是否现在初始化管理员账户? (Y/n，默认: Y): " init_admin_choice
    init_admin_choice=${init_admin_choice:-y}
    
    if [ "$init_admin_choice" = "y" ] || [ "$init_admin_choice" = "Y" ]; then
        print_info "正在初始化管理员账户..."
        
        if $COMPOSE_CMD exec -T backend node scripts/initAdmin.js 2>/dev/null; then
            print_success "管理员账户初始化成功"
        else
            print_warning "管理员账户初始化失败，可能服务尚未完全启动"
            print_info "您可以稍后手动运行: $COMPOSE_CMD exec backend node scripts/initAdmin.js"
        fi
    else
        print_info "跳过管理员账户初始化"
        print_info "您可以稍后运行: $COMPOSE_CMD exec backend node scripts/initAdmin.js"
    fi
}

# 本地开发运行
start_dev() {
    print_header "本地开发运行"
    
    PROJECT_ROOT=$(get_project_root)
    START_SCRIPT="$PROJECT_ROOT/sh/start.sh"
    
    # 如果未找到脚本，尝试在兼容路径搜索
    if [ ! -f "$START_SCRIPT" ]; then
        ALT_PATHS=(
            "./sh/start.sh"
            "../sh/start.sh"
            "$PROJECT_ROOT/start.sh"
        )
        for p in "${ALT_PATHS[@]}"; do
            if [ -f "$p" ]; then
                START_SCRIPT="$p"
                break
            fi
        done
    fi
    
    if [ ! -f "$START_SCRIPT" ]; then
        print_error "未找到启动脚本: start.sh"
        print_info "尝试路径: $PROJECT_ROOT/sh/start.sh 及兼容路径"
        echo ""
        read -p "按回车键返回主菜单..."
        return
    fi
    
    print_info "执行启动脚本: $START_SCRIPT"
    echo ""
    print_warning "这将启动本地开发环境（前端、后端、TTS API）"
    print_info "按 Ctrl+C 可以停止服务"
    echo ""
    read -p "按回车键开始启动..."
    
    bash "$START_SCRIPT"
    
    echo ""
    read -p "按回车键返回..."
}

# 导出镜像子菜单
show_export_images_menu() {
    while true; do
        print_header "Docker 镜像导出"
        echo ""
        print_info "请选择要导出的镜像:"
        echo "  1) 导出前端镜像"
        echo "  2) 导出后端镜像"
        echo "  3) 导出 TTS API 服务镜像"
        echo "  4) 导出 TTS API Lite 服务镜像"
        echo "  5) 导出全部镜像"
        echo "  0) 返回主菜单"
        echo ""
        read -p "请输入选项 (0-5): " export_choice
        
        case $export_choice in
            1)
                export_single_image "frontend"
                ;;
            2)
                export_single_image "backend"
                ;;
            3)
                export_single_image "tts-api"
                ;;
            4)
                export_single_image "tts-api-lite"
                ;;
            5)
                export_images
                ;;
            0)
                return
                ;;
            *)
                print_warning "无效选项，请重新选择"
                sleep 1
                ;;
        esac
    done
}

# 导出单个镜像
export_single_image() {
    local image_type=$1
    PROJECT_ROOT=$(get_project_root)
    EXPORT_DIR="$PROJECT_ROOT/docker-images"
    mkdir -p "$EXPORT_DIR"
    
    print_header "导出 ${image_type} 镜像"
    
    # 确定镜像名称
    case $image_type in
        frontend)
            IMAGE_NAME="ttbye/readknows-frontend:latest"
            EXPORT_FILE="$EXPORT_DIR/readknows-frontend-latest.tar.gz"
            ;;
        backend)
            IMAGE_NAME="ttbye/readknows-backend:latest"
            EXPORT_FILE="$EXPORT_DIR/readknows-backend-latest.tar.gz"
            ;;
        tts-api)
            IMAGE_NAME="ttbye/tts-api:latest"
            EXPORT_FILE="$EXPORT_DIR/tts-api-latest.tar.gz"
            ;;
        tts-api-lite)
            IMAGE_NAME="ttbye/tts-api-lite:latest"
            EXPORT_FILE="$EXPORT_DIR/tts-api-lite-latest.tar.gz"
            ;;
        *)
            print_error "未知的镜像类型: $image_type"
            echo ""
            read -p "按回车键返回..."
            return
            ;;
    esac
    
    # 检查镜像是否存在
    if ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${IMAGE_NAME}$"; then
        print_error "镜像不存在: $IMAGE_NAME"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    print_info "正在导出镜像: $IMAGE_NAME"
    
    if docker save "$IMAGE_NAME" | gzip > "$EXPORT_FILE"; then
        FILE_SIZE=$(du -h "$EXPORT_FILE" | cut -f1)
        print_success "镜像导出成功: $(basename "$EXPORT_FILE") ($FILE_SIZE)"
    else
        print_error "镜像导出失败"
        rm -f "$EXPORT_FILE" 2>/dev/null || true
    fi
    
    echo ""
    read -p "按回车键返回..."
}

# 导入镜像子菜单
show_import_images_menu() {
    while true; do
        print_header "Docker 镜像导入"
        echo ""
        print_info "请选择要导入的镜像:"
        echo "  1) 导入前端镜像"
        echo "  2) 导入后端镜像"
        echo "  3) 导入 TTS API 服务镜像"
        echo "  4) 导入 TTS API Lite 服务镜像"
        echo "  5) 导入全部镜像"
        echo "  0) 返回主菜单"
        echo ""
        read -p "请输入选项 (0-5): " import_choice
        
        case $import_choice in
            1)
                import_single_image "frontend"
                ;;
            2)
                import_single_image "backend"
                ;;
            3)
                import_single_image "tts-api"
                ;;
            4)
                import_single_image "tts-api-lite"
                ;;
            5)
                import_images
                ;;
            0)
                return
                ;;
            *)
                print_warning "无效选项，请重新选择"
                sleep 1
                ;;
        esac
    done
}

# 导入单个镜像
import_single_image() {
    local image_type=$1
    PROJECT_ROOT=$(get_project_root)
    IMAGE_DIR="$PROJECT_ROOT/docker-images"
    
    print_header "导入 ${image_type} 镜像"
    
    # 确定镜像文件名
    case $image_type in
        frontend)
            IMAGE_FILE="$IMAGE_DIR/readknows-frontend-latest.tar.gz"
            ;;
        backend)
            IMAGE_FILE="$IMAGE_DIR/readknows-backend-latest.tar.gz"
            ;;
        tts-api)
            IMAGE_FILE="$IMAGE_DIR/tts-api-latest.tar.gz"
            ;;
        tts-api-lite)
            IMAGE_FILE="$IMAGE_DIR/tts-api-lite-latest.tar.gz"
            ;;
        *)
            print_error "未知的镜像类型: $image_type"
            echo ""
            read -p "按回车键返回..."
            return
            ;;
    esac
    
    if [ ! -f "$IMAGE_FILE" ]; then
        print_error "镜像文件不存在: $IMAGE_FILE"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    print_info "正在导入镜像: $(basename "$IMAGE_FILE")"
    print_info "这可能需要几分钟时间，请耐心等待..."
    
    if gunzip -c "$IMAGE_FILE" | docker load; then
        print_success "镜像导入成功"
    else
        print_error "镜像导入失败"
    fi
    
    echo ""
    read -p "按回车键返回..."
}

# 删除镜像子菜单
show_delete_images_menu() {
    while true; do
        print_header "删除 Docker 镜像"
        echo ""
        print_info "请选择要删除的镜像:"
        echo "  1) 删除前端镜像"
        echo "  2) 删除后端镜像"
        echo "  3) 删除 TTS API 服务镜像"
        echo "  4) 删除 TTS API Lite 服务镜像"
        echo "  5) 删除全部镜像"
        echo "  0) 返回主菜单"
        echo ""
        read -p "请输入选项 (0-5): " delete_choice
        
        case $delete_choice in
            1)
                delete_single_image "frontend"
                ;;
            2)
                delete_single_image "backend"
                ;;
            3)
                delete_single_image "tts-api"
                ;;
            4)
                delete_single_image "tts-api-lite"
                ;;
            5)
                delete_all_images
                ;;
            0)
                return
                ;;
            *)
                print_warning "无效选项，请重新选择"
                sleep 1
                ;;
        esac
    done
}

# 删除单个镜像
delete_single_image() {
    local image_type=$1
    
    print_header "删除 ${image_type} 镜像"
    
    # 确定镜像名称
    case $image_type in
        frontend)
            IMAGE_NAME="ttbye/readknows-frontend:latest"
            CONTAINER_NAME="readknows-frontend"
            ;;
        backend)
            IMAGE_NAME="ttbye/readknows-backend:latest"
            CONTAINER_NAME="readknows-backend"
            ;;
        tts-api)
            IMAGE_NAME="ttbye/tts-api:latest"
            CONTAINER_NAME="readknow-tts-api"
            ;;
        tts-api-lite)
            IMAGE_NAME="ttbye/tts-api-lite:latest"
            CONTAINER_NAME="readknow-tts-api-lite"
            ;;
        *)
            print_error "未知的镜像类型: $image_type"
            echo ""
            read -p "按回车键返回..."
            return
            ;;
    esac
    
    # 检查镜像是否存在
    if ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${IMAGE_NAME}$"; then
        print_warning "镜像不存在: $IMAGE_NAME"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    # 检查容器
    if docker ps -a --format "{{.Names}}" | grep -qE "^${CONTAINER_NAME}$"; then
        print_warning "发现相关容器: $CONTAINER_NAME"
        read -p "是否先删除容器? (Y/n，默认: Y): " delete_container
        delete_container=${delete_container:-y}
        if [ "$delete_container" = "y" ] || [ "$delete_container" = "Y" ]; then
            docker stop "$CONTAINER_NAME" 2>/dev/null || true
            docker rm "$CONTAINER_NAME" 2>/dev/null || true
            print_success "容器已删除"
        fi
    fi
    
    echo ""
    print_warning "此操作将永久删除镜像: $IMAGE_NAME"
    read -p "确认删除? (y/N，默认: N): " confirm_delete
    confirm_delete=${confirm_delete:-n}
    
    if [ "$confirm_delete" != "y" ] && [ "$confirm_delete" != "Y" ]; then
        print_info "已取消删除"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    if docker rmi "$IMAGE_NAME" 2>/dev/null; then
        print_success "镜像删除成功"
    else
        print_warning "普通删除失败，尝试强制删除..."
        if docker rmi -f "$IMAGE_NAME" 2>/dev/null; then
            print_success "镜像强制删除成功"
        else
            print_error "镜像删除失败"
        fi
    fi
    
    echo ""
    read -p "按回车键返回..."
}

# 删除全部镜像
delete_all_images() {
    print_header "删除全部 Docker 镜像"
    
    BACKEND_IMAGE="ttbye/readknows-backend:latest"
    FRONTEND_IMAGE="ttbye/readknows-frontend:latest"
    TTS_IMAGE="ttbye/tts-api:latest"
    TTS_LITE_IMAGE="ttbye/tts-api-lite:latest"
    
    echo ""
    print_info "将删除以下镜像:"
    
    IMAGES_TO_DELETE=()
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${BACKEND_IMAGE}$"; then
        echo "  - $BACKEND_IMAGE"
        IMAGES_TO_DELETE+=("$BACKEND_IMAGE")
    fi
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${FRONTEND_IMAGE}$"; then
        echo "  - $FRONTEND_IMAGE"
        IMAGES_TO_DELETE+=("$FRONTEND_IMAGE")
    fi
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${TTS_IMAGE}$"; then
        echo "  - $TTS_IMAGE"
        IMAGES_TO_DELETE+=("$TTS_IMAGE")
    fi
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${TTS_LITE_IMAGE}$"; then
        echo "  - $TTS_LITE_IMAGE"
        IMAGES_TO_DELETE+=("$TTS_LITE_IMAGE")
    fi
    
    if [ ${#IMAGES_TO_DELETE[@]} -eq 0 ]; then
        print_warning "未找到任何镜像"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    echo ""
    print_warning "此操作将永久删除上述所有 Docker 镜像，无法恢复！"
    print_warning "如果容器正在运行，将自动停止并删除容器。"
    echo ""
    read -p "确认删除? (y/N，默认: N): " confirm_delete
    confirm_delete=${confirm_delete:-n}
    
    if [ "$confirm_delete" != "y" ] && [ "$confirm_delete" != "Y" ]; then
        print_info "已取消删除"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    # 删除相关容器
    CONTAINERS=("readknows-backend" "readknows-frontend" "readknow-tts-api" "readknow-tts-api-lite")
    for container in "${CONTAINERS[@]}"; do
        if docker ps -a --format "{{.Names}}" | grep -qE "^${container}$"; then
            print_info "停止并删除容器: $container"
            docker stop "$container" 2>/dev/null || true
            docker rm "$container" 2>/dev/null || true
        fi
    done
    
    sleep 1
    
    # 删除镜像
    DELETED_COUNT=0
    for image in "${IMAGES_TO_DELETE[@]}"; do
        print_info "正在删除镜像: $image"
        if docker rmi "$image" 2>/dev/null || docker rmi -f "$image" 2>/dev/null; then
            print_success "镜像删除成功: $image"
            DELETED_COUNT=$((DELETED_COUNT + 1))
        else
            print_warning "镜像删除失败: $image"
        fi
    done
    
    echo ""
    if [ $DELETED_COUNT -gt 0 ]; then
        print_success "删除完成！共删除 $DELETED_COUNT 个镜像"
    else
        print_warning "未删除任何镜像"
    fi
    
    echo ""
    read -p "按回车键返回..."
}

# 其他功能子菜单
show_other_menu() {
    while true; do
        print_header "其他功能"
        echo ""
        print_info "请选择功能:"
        echo "  1) 安装 Calibre"
        echo "  2) 下载 CosyVoice 模型"
        echo "  3) 下载 IndexTTS2 模型"
        echo "  4) 管理员账号初始化（用户名：books，密码：books）"
        echo "  5) 删除已导出的镜像文件 (docker-images 目录)"
        echo "  6) 删除 TTS-API-Lite 服务"
        echo "  0) 返回主菜单"
        echo ""
        read -p "请输入选项 (0-6): " other_choice
        
        case $other_choice in
            1)
                install_calibre_standalone
                ;;
            2)
                download_cosyvoice_model
                ;;
            3)
                download_indextts2_model
                ;;
            4)
                init_admin_with_defaults
                ;;
            5)
                delete_exported_images
                ;;
            6)
                remove_tts_api_lite
                ;;
            0)
                return
                ;;
            *)
                print_warning "无效选项，请重新选择"
                sleep 1
                ;;
        esac
    done
}

# 下载 CosyVoice 模型
download_cosyvoice_model() {
    print_header "下载 CosyVoice 模型"
    
    PROJECT_ROOT=$(get_project_root)
    TTS_API_DIR="$PROJECT_ROOT/tts-api"
    
    if [ ! -d "$TTS_API_DIR" ]; then
        print_error "未找到 TTS API 目录: $TTS_API_DIR"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    DOWNLOAD_SCRIPT="$TTS_API_DIR/scripts/download-cosyvoice.py"
    
    if [ ! -f "$DOWNLOAD_SCRIPT" ]; then
        print_error "未找到下载脚本: $DOWNLOAD_SCRIPT"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    PLATFORM=$(detect_platform)
    TTS_PATHS=$(get_tts_api_paths "$PLATFORM")
    MODELS_DIR="${TTS_PATHS%%|*}"
    
    print_info "模型目录: $MODELS_DIR/cosyvoice"
    echo ""
    
    cd "$TTS_API_DIR"
    if python3 "$DOWNLOAD_SCRIPT" "$MODELS_DIR/cosyvoice"; then
        print_success "CosyVoice 模型下载完成"
    else
        print_error "CosyVoice 模型下载失败"
    fi
    
    echo ""
    read -p "按回车键返回..."
}

# 下载 IndexTTS2 模型
download_indextts2_model() {
    print_header "下载 IndexTTS2 模型"
    
    PROJECT_ROOT=$(get_project_root)
    TTS_API_DIR="$PROJECT_ROOT/tts-api"
    
    if [ ! -d "$TTS_API_DIR" ]; then
        print_error "未找到 TTS API 目录: $TTS_API_DIR"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    DOWNLOAD_SCRIPT="$TTS_API_DIR/scripts/download-indextts2.py"
    
    if [ ! -f "$DOWNLOAD_SCRIPT" ]; then
        print_error "未找到下载脚本: $DOWNLOAD_SCRIPT"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    PLATFORM=$(detect_platform)
    TTS_PATHS=$(get_tts_api_paths "$PLATFORM")
    MODELS_DIR="${TTS_PATHS%%|*}"
    
    print_info "模型目录: $MODELS_DIR/indextts2"
    echo ""
    
    cd "$TTS_API_DIR"
    if python3 "$DOWNLOAD_SCRIPT" "$MODELS_DIR/indextts2"; then
        print_success "IndexTTS2 模型下载完成"
    else
        print_error "IndexTTS2 模型下载失败"
    fi
    
    echo ""
    read -p "按回车键返回..."
}

# 使用默认值初始化管理员
init_admin_with_defaults() {
    print_header "管理员账号初始化"
    
    PROJECT_ROOT=$(get_project_root)
    SCRIPT_PATH="$PROJECT_ROOT/sh/init-admin.sh"
    
    if [ ! -f "$SCRIPT_PATH" ]; then
        print_error "未找到脚本: $SCRIPT_PATH"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    print_info "将使用默认值初始化管理员账号"
    print_info "用户名: books"
    print_info "密码: books"
    echo ""
    read -p "确认初始化? (Y/n，默认: Y): " confirm
    confirm=${confirm:-y}
    
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "已取消"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    # 检查后端容器是否运行
    if ! docker ps --format "{{.Names}}" | grep -qE "^(readknows-backend|knowbooks-backend)$"; then
        print_error "后端容器未运行，请先启动后端服务"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    # 获取容器名称
    BACKEND_CONTAINER=$(docker ps --format "{{.Names}}" | grep -E "^(readknows-backend|knowbooks-backend)$" | head -1)
    
    print_info "正在初始化管理员账户..."
    
    # 执行初始化（使用默认值：books/books）
    if docker exec "$BACKEND_CONTAINER" node scripts/initAdmin.js books admin@readknows.local books 2>&1; then
        print_success "管理员账户初始化成功！"
        echo ""
        print_info "账户信息："
        echo "  用户名: books"
        echo "  邮箱: admin@readknows.local"
        echo "  密码: books"
        echo ""
        print_warning "请妥善保管密码，首次登录后请及时修改！"
    else
        print_error "管理员账户初始化失败"
        print_info "请检查后端容器是否正常运行"
    fi
    
    echo ""
    read -p "按回车键返回..."
}

# 显示主菜单
show_main_menu() {
    while true; do
        print_header "ReadKnows (读士私人书库) 安装工具"
        echo ""
        print_info "请选择功能:"
        echo "  1) 安装系统（前、后端）"
        echo "  2) 安装服务（TTS-API）"
        echo "  3) 安装服务（TTS-API-Lite）"
        echo "  4) 开发运行（执行: sh/start.sh）"
        echo "  5) Docker镜像导出"
        echo "  6) Docker镜像导入"
        echo "  7) 删除Docker镜像"
        echo "  8) 其他功能"
        echo "  9) 退出"
        echo ""
        read -p "请输入选项 (1-9，默认: 1): " menu_choice
        menu_choice=${menu_choice:-1}
        
        case $menu_choice in
            1)
                # 安装系统（前、后端）
                run_installation
                break
                ;;
            2)
                # 安装服务（TTS-API）
                install_tts_service
                ;;
            3)
                # 安装服务（TTS-API-Lite）
                install_tts_api_lite
                ;;
            4)
                # 开发运行
                start_dev
                ;;
            5)
                # Docker镜像导出
                show_export_images_menu
                ;;
            6)
                # Docker镜像导入
                show_import_images_menu
                ;;
            7)
                # 删除Docker镜像
                show_delete_images_menu
                ;;
            8)
                # 其他功能
                show_other_menu
                ;;
            9)
                print_info "已退出"
                exit 0
                ;;
            *)
                print_warning "无效选项，请重新选择"
                sleep 1
                ;;
        esac
    done
}

# 导入镜像
import_images() {
    PROJECT_ROOT=$(get_project_root)
    SCRIPT_PATH="$PROJECT_ROOT/sh/Dockerimport-images.sh"
    
    # 如果未找到脚本，尝试在兼容路径搜索
    if [ ! -f "$SCRIPT_PATH" ]; then
        ALT_PATHS=(
            "./sh/Dockerimport-images.sh"
            "../sh/Dockerimport-images.sh"
            "$(dirname "$PROJECT_ROOT")/sh/Dockerimport-images.sh"
        )
        for p in "${ALT_PATHS[@]}"; do
            if [ -f "$p" ]; then
                SCRIPT_PATH="$p"
                break
            fi
        done
        # 仍未找到，使用 find 搜索（限定深度，避免过慢）
        if [ ! -f "$SCRIPT_PATH" ]; then
            FOUND_PATH=$(find "$(dirname "$PROJECT_ROOT")" -maxdepth 3 -type f -name "Dockerimport-images.sh" 2>/dev/null | head -1)
            if [ -n "$FOUND_PATH" ]; then
                SCRIPT_PATH="$FOUND_PATH"
            fi
        fi
    fi
    
    if [ -f "$SCRIPT_PATH" ]; then
        print_info "执行镜像导入脚本: $SCRIPT_PATH"
        bash "$SCRIPT_PATH"
        print_success "镜像导入完成"
    else
        print_error "未找到脚本: Dockerimport-images.sh"
        print_info "尝试路径: $PROJECT_ROOT/sh/Dockerimport-images.sh 及兼容路径"
        print_info "请确认脚本已复制到项目根目录的 sh/ 目录后重试。"
    fi
    echo ""
    read -p "按回车键返回..."
}

# 导出镜像
export_images() {
    PROJECT_ROOT=$(get_project_root)
    SCRIPT_PATH="$PROJECT_ROOT/sh/Dockerexport-images.sh"
    
    # 如果未找到脚本，尝试在兼容路径搜索
    if [ ! -f "$SCRIPT_PATH" ]; then
        ALT_PATHS=(
            "./sh/Dockerexport-images.sh"
            "../sh/Dockerexport-images.sh"
            "$(dirname "$PROJECT_ROOT")/sh/Dockerexport-images.sh"
        )
        for p in "${ALT_PATHS[@]}"; do
            if [ -f "$p" ]; then
                SCRIPT_PATH="$p"
                break
            fi
        done
        # 仍未找到，使用 find 搜索（限定深度，避免过慢）
        if [ ! -f "$SCRIPT_PATH" ]; then
            FOUND_PATH=$(find "$(dirname "$PROJECT_ROOT")" -maxdepth 3 -type f -name "Dockerexport-images.sh" 2>/dev/null | head -1)
            if [ -n "$FOUND_PATH" ]; then
                SCRIPT_PATH="$FOUND_PATH"
            fi
        fi
    fi
    
    if [ -f "$SCRIPT_PATH" ]; then
        print_info "执行镜像导出脚本: $SCRIPT_PATH"
        bash "$SCRIPT_PATH"
        print_success "镜像导出完成"
    else
        print_error "未找到脚本: Dockerexport-images.sh"
        print_info "尝试路径: $PROJECT_ROOT/sh/Dockerexport-images.sh 及兼容路径"
        print_info "请确认脚本已复制到项目根目录的 sh/ 目录后重试。"
    fi
    echo ""
    read -p "按回车键返回..."
}

# 独立安装 Calibre
install_calibre_standalone() {
    PROJECT_ROOT=$(get_project_root)
    SCRIPT_PATH="$PROJECT_ROOT/sh/install-calibre.sh"
    
    # 如果未找到脚本，尝试在兼容路径搜索
    if [ ! -f "$SCRIPT_PATH" ]; then
        ALT_PATHS=(
            "./sh/install-calibre.sh"
            "../sh/install-calibre.sh"
            "$PROJECT_ROOT/install-calibre.sh" # 兼容旧位置
        )
        for p in "${ALT_PATHS[@]}"; do
            if [ -f "$p" ]; then
                SCRIPT_PATH="$p"
                break
            fi
        done
        # 仍未找到，使用 find 进行搜索（限定深度，避免过慢）
        if [ ! -f "$SCRIPT_PATH" ]; then
            FOUND_PATH=$(find "$PROJECT_ROOT" -maxdepth 3 -type f -name "install-calibre.sh" 2>/dev/null | head -1)
            if [ -n "$FOUND_PATH" ]; then
                SCRIPT_PATH="$FOUND_PATH"
            fi
        fi
    fi

    if [ -f "$SCRIPT_PATH" ]; then
        print_info "执行 Calibre 安装脚本: $SCRIPT_PATH"
        bash "$SCRIPT_PATH"
        print_success "Calibre 安装完成"
    else
        print_error "未找到 install-calibre.sh 脚本 (尝试路径: $PROJECT_ROOT/sh/install-calibre.sh 及兼容路径)"
        print_info "请确认脚本已复制到项目根目录的 sh/ 目录后重试。"
    fi
    echo ""
    read -p "按回车键返回..."
}

# 独立初始化管理员
init_admin_standalone() {
    PROJECT_ROOT=$(get_project_root)
    SCRIPT_PATH="$PROJECT_ROOT/sh/init-admin.sh"
    
    if [ -f "$SCRIPT_PATH" ]; then
        print_info "执行管理员初始化脚本..."
        bash "$SCRIPT_PATH"
        print_success "管理员初始化完成"
    else
        print_error "未找到脚本: $SCRIPT_PATH"
    fi
    echo ""
    read -p "按回车键返回..."
}

# 获取 TTS API 模型和临时目录路径（根据平台）
get_tts_api_paths() {
    local platform=$1
    local models_dir=""
    local temp_dir=""
    
    case $platform in
        macos)
            models_dir="/Users/ttbye/ReadKnows/tts/models"
            temp_dir="/Users/ttbye/ReadKnows/tts/temp"
            ;;
        linux)
            models_dir="/volume5/docker/ReadKnows/tts-models"
            temp_dir="/volume5/docker/ReadKnows/tts-temp"
            ;;
        windows)
            models_dir="D:\\Docker\\ReadKnows\\tts-models"
            temp_dir="D:\\Docker\\ReadKnows\\tts-temp"
            ;;
        *)
            # 默认使用项目目录下的相对路径
            PROJECT_ROOT=$(get_project_root)
            models_dir="$PROJECT_ROOT/tts-api/models"
            temp_dir="$PROJECT_ROOT/tts-api/temp"
            ;;
    esac
    
    echo "$models_dir|$temp_dir"
}

# 安装 TTS API 服务
install_tts_service() {
    print_header "安装 TTS API 服务"
    
    PROJECT_ROOT=$(get_project_root)
    TTS_API_DIR="$PROJECT_ROOT/tts-api"
    
    if [ ! -d "$TTS_API_DIR" ]; then
        print_error "未找到 TTS API 目录: $TTS_API_DIR"
        echo ""
        read -p "按回车键返回主菜单..."
        return
    fi
    
    # 检测平台
    PLATFORM=$(detect_platform)
    
    # 如果平台检测失败，尝试手动检测
    if [ "$PLATFORM" = "unknown" ]; then
        print_warning "自动平台检测失败，尝试手动检测..."
        UNAME_S=$(uname -s)
        if [ "$UNAME_S" = "Darwin" ]; then
            PLATFORM="macos"
        elif [ "$UNAME_S" = "Linux" ]; then
            PLATFORM="linux"
        elif [ -n "$WSL_DISTRO_NAME" ] || [ -n "$WSLENV" ] || echo "$UNAME_S" | grep -qE "^MINGW(64|32)_NT" || echo "$UNAME_S" | grep -qE "^MSYS_NT" || echo "$UNAME_S" | grep -qE "^CYGWIN_NT"; then
            PLATFORM="windows"
        else
            print_warning "无法自动检测平台，请手动选择"
            echo ""
            echo "  1) Linux"
            echo "  2) macOS"
            echo "  3) Windows"
            echo "  4) Synology NAS"
            echo ""
            read -p "请选择平台 (1-4，默认: 1): " platform_choice
            platform_choice=${platform_choice:-1}
            case $platform_choice in
                1) PLATFORM="linux" ;;
                2) PLATFORM="macos" ;;
                3) PLATFORM="windows" ;;
                4) PLATFORM="synology" ;;
                *) PLATFORM="linux" ;;
            esac
        fi
    fi
    
    print_info "检测到平台: $PLATFORM"
    
    # 获取 TTS API 路径
    TTS_PATHS=$(get_tts_api_paths "$PLATFORM")
    TTS_MODELS_DIR="${TTS_PATHS%%|*}"
    TTS_TEMP_DIR="${TTS_PATHS#*|}"
    
    print_info "TTS 模型目录: $TTS_MODELS_DIR"
    print_info "TTS 临时目录: $TTS_TEMP_DIR"
    
    # 创建目录
    mkdir -p "$TTS_MODELS_DIR" "$TTS_TEMP_DIR"
    
    # 检查 Docker 是否运行
    if ! docker info &> /dev/null; then
        print_error "Docker 服务未运行，请启动 Docker 服务"
        echo ""
        read -p "按回车键返回主菜单..."
        return
    fi
    
    # 检查端口占用
    if command -v lsof &> /dev/null; then
        if lsof -Pi :5050 -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_warning "端口 5050 已被占用"
            read -p "是否继续? (Y/n，默认: Y): " continue_install
            continue_install=${continue_install:-y}
            if [ "$continue_install" != "y" ] && [ "$continue_install" != "Y" ]; then
                print_info "已取消安装"
                echo ""
                read -p "按回车键返回主菜单..."
                return
            fi
        fi
    fi
    
    # 检查是否已有 TTS API 容器
    if docker ps -a --format "{{.Names}}" | grep -qE "^readknow-tts-api$"; then
        print_warning "发现已存在的 TTS API 容器"
        read -p "是否停止并删除现有容器? (Y/n，默认: Y): " remove_existing
        remove_existing=${remove_existing:-y}
        if [ "$remove_existing" = "y" ] || [ "$remove_existing" = "Y" ]; then
            print_info "停止并删除现有容器..."
            docker stop readknow-tts-api 2>/dev/null || true
            docker rm readknow-tts-api 2>/dev/null || true
            print_success "现有容器已删除"
        fi
    fi
    
    # 选择 docker-compose 文件（从 sh 目录查找）
    SH_DIR="$PROJECT_ROOT/sh"
    TTS_COMPOSE_FILE=""
    case $PLATFORM in
        macos)
            if [ -f "$SH_DIR/docker-compose-TTS-MACOS.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-MACOS.yml"
            elif [ -f "$SH_DIR/docker-compose-TTS-macos.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-macos.yml"
            fi
            ;;
        linux)
            if [ -f "$SH_DIR/docker-compose-TTS-Linux.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-Linux.yml"
            elif [ -f "$SH_DIR/docker-compose-TTS-linux.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-linux.yml"
            fi
            ;;
        windows)
            if [ -f "$SH_DIR/docker-compose-TTS-WINDOWS.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-WINDOWS.yml"
            elif [ -f "$SH_DIR/docker-compose-TTS-windows.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-windows.yml"
            fi
            ;;
        synology)
            if [ -f "$SH_DIR/docker-compose-TTS-Synology.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-Synology.yml"
            elif [ -f "$SH_DIR/docker-compose-TTS-synology.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-synology.yml"
            fi
            ;;
    esac
    
    # 如果没有找到平台特定的文件，尝试查找通用文件
    if [ -z "$TTS_COMPOSE_FILE" ]; then
        # 尝试查找通用 TTS compose 文件
        if [ -f "$SH_DIR/docker-compose-TTS.yml" ]; then
            TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS.yml"
        elif [ -f "$TTS_API_DIR/docker-compose.yml" ]; then
            TTS_COMPOSE_FILE="$TTS_API_DIR/docker-compose.yml"
        else
            print_error "未找到 TTS API docker-compose 文件"
            print_info "请确认以下文件之一存在："
            echo "  - $SH_DIR/docker-compose-TTS-Linux.yml"
            echo "  - $SH_DIR/docker-compose-TTS-MACOS.yml"
            echo "  - $SH_DIR/docker-compose-TTS-WINDOWS.yml"
            echo "  - $SH_DIR/docker-compose-TTS-Synology.yml"
            echo ""
            read -p "按回车键返回主菜单..."
            return
        fi
    fi
    
    print_info "使用配置文件: $TTS_COMPOSE_FILE"
    
    # 切换到 sh 目录（docker-compose 文件所在目录）
    cd "$SH_DIR"
    
    # 检查镜像是否已存在（加快安装速度）
    TTS_IMAGE="ttbye/tts-api:latest"
    COMPOSE_FILE_NAME=$(basename "$TTS_COMPOSE_FILE")
    
    # 确保 COMPOSE_CMD 已设置
    if [ -z "$COMPOSE_CMD" ]; then
        if command -v docker-compose &> /dev/null; then
            COMPOSE_CMD="docker-compose"
        elif docker compose version &> /dev/null 2>&1; then
            COMPOSE_CMD="docker compose"
        else
            print_error "未找到 Docker Compose"
            echo ""
            read -p "按回车键返回主菜单..."
            return
        fi
    fi
    
    # 构建 docker compose 命令数组（处理空格问题）
    if [ "$COMPOSE_CMD" = "docker-compose" ]; then
        COMPOSE_ARGS=("docker-compose" "-f" "$COMPOSE_FILE_NAME")
    else
        COMPOSE_ARGS=("docker" "compose" "-f" "$COMPOSE_FILE_NAME")
    fi
    
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -qE "^${TTS_IMAGE}$"; then
        print_info "检测到 TTS API 镜像已存在，跳过构建"
        print_info "直接启动服务..."
        "${COMPOSE_ARGS[@]}" up -d
    else
        print_info "开始构建 TTS API 镜像..."
        print_warning "构建过程可能需要 5-15 分钟，具体取决于网络速度"
        print_info "构建步骤包括："
        echo "  1. 下载基础镜像（python:3.11-slim）"
        echo "  2. 安装系统依赖（FFmpeg、Git、Git LFS）"
        echo "  3. 安装 Python 依赖包"
        echo "  4. 复制源代码"
        echo ""
        
        # 预拉取基础镜像以加快构建
        read -p "是否先预拉取基础镜像以加快构建? (Y/n，默认: Y): " pre_pull
        pre_pull=${pre_pull:-y}
        if [ "$pre_pull" = "y" ] || [ "$pre_pull" = "Y" ]; then
            print_info "正在预拉取基础镜像..."
            docker pull python:3.11-slim > /dev/null 2>&1 || print_warning "拉取 python:3.11-slim 失败，将在构建时自动下载"
            print_success "基础镜像预拉取完成"
            echo ""
        fi
        
        print_info "开始构建镜像，请耐心等待..."
        print_info "提示: 您可以按 Ctrl+C 中断构建，然后稍后重新运行此脚本继续"
        echo ""
        
        # 使用 buildx 并行构建（如果可用）
        if docker buildx version &> /dev/null 2>&1; then
            print_info "检测到 Docker Buildx，将使用并行构建..."
            "${COMPOSE_ARGS[@]}" build
        else
            "${COMPOSE_ARGS[@]}" build
        fi
        
        if [ $? -eq 0 ]; then
            print_success "镜像构建完成"
            print_info "启动服务..."
            "${COMPOSE_ARGS[@]}" up -d
        else
            print_error "镜像构建失败"
            echo ""
            read -p "按回车键返回主菜单..."
            return
        fi
    fi
    
    if [ $? -eq 0 ]; then
        print_success "TTS API 服务启动成功"
        echo ""
        print_info "等待服务就绪..."
        sleep 5
        
        # 测试服务健康状态
        max_attempts=15
        attempt=0
        while [ $attempt -lt $max_attempts ]; do
            if curl -f http://localhost:5050/health &> /dev/null 2>&1; then
                print_success "TTS API 服务已就绪"
                echo ""
                print_info "服务信息:"
                echo "  服务地址: http://localhost:5050"
                echo "  健康检查: http://localhost:5050/health"
                echo "  模型列表: http://localhost:5050/api/tts/models"
                echo "  语音列表: http://localhost:5050/api/tts/voices"
                echo "  测试页面: http://localhost:5050/test"
                echo ""
                print_info "常用命令:"
                echo "  查看日志: docker logs -f readknow-tts-api"
                echo "  停止服务: docker stop readknow-tts-api"
                echo "  重启服务: docker restart readknow-tts-api"
                echo "  删除服务: 运行 install.sh，选择选项 7: 删除 TTS API 服务"
                echo ""
                print_warning "请在系统设置中配置 TTS 服务器地址和端口"
                break
            fi
            attempt=$((attempt + 1))
            echo -n "."
            sleep 2
        done
        
        if [ $attempt -ge $max_attempts ]; then
            print_warning "服务启动超时，但可能仍在运行中"
            print_info "请检查日志: docker logs readknow-tts-api"
        fi
    else
        print_error "TTS API 服务启动失败"
    fi
    
    echo ""
    read -p "按回车键返回..."
}

# 删除 TTS API 服务
remove_tts_api() {
    print_header "删除 TTS API 服务"
    
    # 检查 Docker 是否运行
    if ! docker info &> /dev/null; then
        print_error "Docker 服务未运行"
        echo ""
        read -p "按回车键返回主菜单..."
        return
    fi
    
    # 检查容器是否存在
    if ! docker ps -a --format "{{.Names}}" | grep -qE "^readknow-tts-api$"; then
        print_warning "未找到 TTS API 容器"
        echo ""
        read -p "按回车键返回主菜单..."
        return
    fi
    
    # 检查容器状态
    CONTAINER_STATUS=$(docker ps --format "{{.Names}}" | grep -qE "^readknow-tts-api$" && echo "running" || echo "stopped")
    
    echo ""
    print_info "容器状态: $CONTAINER_STATUS"
    print_warning "此操作将停止并删除 TTS API 容器，但不会删除模型文件"
    echo ""
    read -p "确认删除? (y/N，默认: N): " confirm_delete
    confirm_delete=${confirm_delete:-n}
    
    if [ "$confirm_delete" != "y" ] && [ "$confirm_delete" != "Y" ]; then
        print_info "已取消删除"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    # 停止容器
    if [ "$CONTAINER_STATUS" = "running" ]; then
        print_info "正在停止容器..."
        docker stop readknow-tts-api 2>/dev/null || true
        sleep 2
    fi
    
    # 删除容器
    print_info "正在删除容器..."
    if docker rm readknow-tts-api 2>/dev/null; then
        print_success "容器已删除"
    else
        print_error "容器删除失败，尝试强制删除..."
        docker rm -f readknow-tts-api 2>/dev/null || true
        if docker ps -a --format "{{.Names}}" | grep -qE "^readknow-tts-api$"; then
            print_error "容器删除失败"
        else
            print_success "容器已强制删除"
                fi
            fi
            
    # 询问是否删除镜像
    echo ""
    read -p "是否同时删除 TTS API 镜像? (y/N，默认: N): " delete_image
    delete_image=${delete_image:-n}
    
    if [ "$delete_image" = "y" ] || [ "$delete_image" = "Y" ]; then
        TTS_IMAGE="ttbye/tts-api:latest"
        if docker images --format "{{.Repository}}:{{.Tag}}" | grep -qE "^${TTS_IMAGE}$"; then
            print_info "正在删除镜像: $TTS_IMAGE"
            if docker rmi "$TTS_IMAGE" 2>/dev/null; then
                print_success "镜像已删除"
            else
                print_warning "镜像删除失败（可能被其他容器使用）"
            fi
        else
            print_info "镜像不存在，跳过删除"
        fi
    fi
    
    echo ""
    print_success "TTS API 服务删除完成"
    echo ""
    read -p "按回车键返回..."
    }
    
# 安装 TTS-API-Lite 服务
install_tts_api_lite() {
    print_header "安装 TTS-API-Lite 服务"
    
    PROJECT_ROOT=$(get_project_root)
    TTS_API_LITE_DIR="$PROJECT_ROOT/TTS-API-Lite"
    
    if [ ! -d "$TTS_API_LITE_DIR" ]; then
        print_error "未找到 TTS-API-Lite 目录: $TTS_API_LITE_DIR"
        echo ""
        read -p "按回车键返回主菜单..."
        return
    fi
    
    # 检测平台
    PLATFORM=$(detect_platform)
    
    # 如果平台检测失败，尝试手动检测
    if [ "$PLATFORM" = "unknown" ]; then
        print_warning "自动平台检测失败，尝试手动检测..."
        UNAME_S=$(uname -s)
        if [ "$UNAME_S" = "Darwin" ]; then
            PLATFORM="macos"
        elif [ "$UNAME_S" = "Linux" ]; then
            PLATFORM="linux"
        elif [ -n "$WSL_DISTRO_NAME" ] || [ -n "$WSLENV" ] || echo "$UNAME_S" | grep -qE "^MINGW(64|32)_NT" || echo "$UNAME_S" | grep -qE "^MSYS_NT" || echo "$UNAME_S" | grep -qE "^CYGWIN_NT"; then
            PLATFORM="windows"
        else
            print_warning "无法自动检测平台，请手动选择"
            echo ""
            echo "  1) Linux"
            echo "  2) macOS"
            echo "  3) Windows"
            echo "  4) Synology NAS"
            echo ""
            read -p "请选择平台 (1-4，默认: 1): " platform_choice
            platform_choice=${platform_choice:-1}
            case $platform_choice in
                1) PLATFORM="linux" ;;
                2) PLATFORM="macos" ;;
                3) PLATFORM="windows" ;;
                4) PLATFORM="synology" ;;
                *) PLATFORM="linux" ;;
            esac
        fi
    fi
    
    print_info "检测到平台: $PLATFORM"
    
    # 检查 Docker 是否运行
    if ! docker info &> /dev/null; then
        print_error "Docker 服务未运行，请启动 Docker 服务"
        echo ""
        read -p "按回车键返回主菜单..."
        return
    fi
    
    # 检查端口占用（Lite 使用 5051）
    if command -v lsof &> /dev/null; then
        if lsof -Pi :5051 -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_warning "端口 5051 已被占用"
            read -p "是否继续? (Y/n，默认: Y): " continue_install
            continue_install=${continue_install:-y}
            if [ "$continue_install" != "y" ] && [ "$continue_install" != "Y" ]; then
                print_info "已取消安装"
        echo ""
                read -p "按回车键返回主菜单..."
                return
            fi
        fi
    fi
    
    # 检查是否已有 TTS-API-Lite 容器
    if docker ps -a --format "{{.Names}}" | grep -qE "^readknow-tts-api-lite$"; then
        print_warning "发现已存在的 TTS-API-Lite 容器"
        read -p "是否停止并删除现有容器? (Y/n，默认: Y): " remove_existing
        remove_existing=${remove_existing:-y}
        if [ "$remove_existing" = "y" ] || [ "$remove_existing" = "Y" ]; then
            print_info "停止并删除现有容器..."
            docker stop readknow-tts-api-lite 2>/dev/null || true
            docker rm readknow-tts-api-lite 2>/dev/null || true
            print_success "现有容器已删除"
        fi
    fi
    
    # 选择 docker-compose 文件（从 sh 目录查找）
    SH_DIR="$PROJECT_ROOT/sh"
    TTS_LITE_COMPOSE_FILE=""
    case $PLATFORM in
        macos)
            if [ -f "$SH_DIR/docker-compose-TTS-Lite-MACOS.yml" ]; then
                TTS_LITE_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-Lite-MACOS.yml"
            fi
            ;;
        linux)
            if [ -f "$SH_DIR/docker-compose-TTS-Lite-Linux.yml" ]; then
                TTS_LITE_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-Lite-Linux.yml"
            fi
            ;;
        windows)
            if [ -f "$SH_DIR/docker-compose-TTS-Lite-WINDOWS.yml" ]; then
                TTS_LITE_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-Lite-WINDOWS.yml"
            fi
            ;;
        synology)
            if [ -f "$SH_DIR/docker-compose-TTS-Lite-Synology.yml" ]; then
                TTS_LITE_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-Lite-Synology.yml"
            fi
            ;;
    esac
    
    if [ -z "$TTS_LITE_COMPOSE_FILE" ]; then
        print_error "未找到 TTS-API-Lite docker-compose 文件"
        print_info "请确认以下文件之一存在："
        echo "  - $SH_DIR/docker-compose-TTS-Lite-Linux.yml"
        echo "  - $SH_DIR/docker-compose-TTS-Lite-MACOS.yml"
        echo "  - $SH_DIR/docker-compose-TTS-Lite-WINDOWS.yml"
        echo "  - $SH_DIR/docker-compose-TTS-Lite-Synology.yml"
    echo ""
        read -p "按回车键返回主菜单..."
        return
    fi
    
    print_info "使用配置文件: $TTS_LITE_COMPOSE_FILE"
    
    # 切换到 sh 目录
    cd "$SH_DIR"
    
    # 检查镜像是否已存在
    TTS_LITE_IMAGE="ttbye/tts-api-lite:latest"
    COMPOSE_FILE_NAME=$(basename "$TTS_LITE_COMPOSE_FILE")
    
    # 确保 COMPOSE_CMD 已设置
    if [ -z "$COMPOSE_CMD" ]; then
        if command -v docker-compose &> /dev/null; then
            COMPOSE_CMD="docker-compose"
        elif docker compose version &> /dev/null 2>&1; then
            COMPOSE_CMD="docker compose"
        else
            print_error "未找到 Docker Compose"
    echo ""
            read -p "按回车键返回主菜单..."
            return
        fi
    fi
    
    # 构建 docker compose 命令数组
    if [ "$COMPOSE_CMD" = "docker-compose" ]; then
        COMPOSE_ARGS=("docker-compose" "-f" "$COMPOSE_FILE_NAME")
    else
        COMPOSE_ARGS=("docker" "compose" "-f" "$COMPOSE_FILE_NAME")
    fi
    
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -qE "^${TTS_LITE_IMAGE}$"; then
        print_info "检测到 TTS-API-Lite 镜像已存在，跳过构建"
        print_info "直接启动服务..."
        "${COMPOSE_ARGS[@]}" up -d
    else
        print_info "开始构建 TTS-API-Lite 镜像..."
        print_info "轻量级版本构建速度较快，通常只需 2-5 分钟"
        print_info "构建步骤包括："
        echo "  1. 下载基础镜像（python:3.11-slim）"
        echo "  2. 安装系统依赖（FFmpeg）"
        echo "  3. 安装 Python 依赖包（仅在线 TTS）"
        echo "  4. 复制源代码"
        echo ""
        
        # 预拉取基础镜像
        read -p "是否先预拉取基础镜像以加快构建? (Y/n，默认: Y): " pre_pull
        pre_pull=${pre_pull:-y}
        if [ "$pre_pull" = "y" ] || [ "$pre_pull" = "Y" ]; then
            print_info "正在预拉取基础镜像..."
            docker pull python:3.11-slim > /dev/null 2>&1 || print_warning "拉取 python:3.11-slim 失败，将在构建时自动下载"
            print_success "基础镜像预拉取完成"
            echo ""
        fi
        
        print_info "开始构建镜像，请耐心等待..."
        echo ""
        
        # 使用 buildx 并行构建（如果可用）
        if docker buildx version &> /dev/null 2>&1; then
            print_info "检测到 Docker Buildx，将使用并行构建..."
            "${COMPOSE_ARGS[@]}" build
        else
            "${COMPOSE_ARGS[@]}" build
        fi
        
        if [ $? -eq 0 ]; then
            print_success "镜像构建完成"
            print_info "启动服务..."
            "${COMPOSE_ARGS[@]}" up -d
        else
            print_error "镜像构建失败"
            echo ""
            read -p "按回车键返回主菜单..."
            return
        fi
    fi
    
    if [ $? -eq 0 ]; then
        print_success "TTS-API-Lite 服务启动成功"
        echo ""
        print_info "等待服务就绪..."
        sleep 5
        
        # 测试服务健康状态
        max_attempts=15
        attempt=0
        while [ $attempt -lt $max_attempts ]; do
            if curl -f http://localhost:5051/health &> /dev/null 2>&1; then
                print_success "TTS-API-Lite 服务已就绪"
                echo ""
                print_info "服务信息:"
                echo "  服务地址: http://localhost:5051"
                echo "  健康检查: http://localhost:5051/health"
                echo "  模型列表: http://localhost:5051/api/tts/models"
                echo "  语音列表: http://localhost:5051/api/tts/voices"
                echo "  测试页面: http://localhost:5051/test"
                echo ""
                print_info "常用命令:"
                echo "  查看日志: docker logs -f readknow-tts-api-lite"
                echo "  停止服务: docker stop readknow-tts-api-lite"
                echo "  重启服务: docker restart readknow-tts-api-lite"
                echo "  删除服务: 运行 install.sh，选择选项 8 → 删除 TTS-API-Lite 服务"
                echo ""
                print_warning "注意: TTS-API-Lite 使用端口 5051（与完整版 TTS-API 的 5050 不同）"
                print_warning "请在系统设置中配置 TTS 服务器地址和端口为 5051"
                break
            fi
            attempt=$((attempt + 1))
            echo -n "."
            sleep 2
        done
        
        if [ $attempt -ge $max_attempts ]; then
            print_warning "服务启动超时，但可能仍在运行中"
            print_info "请检查日志: docker logs readknow-tts-api-lite"
        fi
    else
        print_error "TTS-API-Lite 服务启动失败"
    fi
    
    echo ""
    read -p "按回车键返回..."
}

# 删除 TTS-API-Lite 服务
remove_tts_api_lite() {
    print_header "删除 TTS-API-Lite 服务"
    
    # 检查 Docker 是否运行
    if ! docker info &> /dev/null; then
        print_error "Docker 服务未运行"
        echo ""
        read -p "按回车键返回主菜单..."
        return
    fi
    
    # 检查容器是否存在
    if ! docker ps -a --format "{{.Names}}" | grep -qE "^readknow-tts-api-lite$"; then
        print_warning "未找到 TTS-API-Lite 容器"
        echo ""
        read -p "按回车键返回主菜单..."
        return
    fi
    
    # 检查容器状态
    CONTAINER_STATUS=$(docker ps --format "{{.Names}}" | grep -qE "^readknow-tts-api-lite$" && echo "running" || echo "stopped")
    
    echo ""
    print_info "容器状态: $CONTAINER_STATUS"
    print_warning "此操作将停止并删除 TTS-API-Lite 容器"
        echo ""
    read -p "确认删除? (y/N，默认: N): " confirm_delete
    confirm_delete=${confirm_delete:-n}
    
    if [ "$confirm_delete" != "y" ] && [ "$confirm_delete" != "Y" ]; then
        print_info "已取消删除"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    # 停止容器
    if [ "$CONTAINER_STATUS" = "running" ]; then
        print_info "正在停止容器..."
        docker stop readknow-tts-api-lite 2>/dev/null || true
        sleep 2
    fi
    
    # 删除容器
    print_info "正在删除容器..."
    if docker rm readknow-tts-api-lite 2>/dev/null; then
        print_success "容器已删除"
    else
        print_error "容器删除失败，尝试强制删除..."
        docker rm -f readknow-tts-api-lite 2>/dev/null || true
        if docker ps -a --format "{{.Names}}" | grep -qE "^readknow-tts-api-lite$"; then
            print_error "容器删除失败"
        else
            print_success "容器已强制删除"
        fi
    fi
    
    # 询问是否删除镜像
        echo ""
    read -p "是否同时删除 TTS-API-Lite 镜像? (y/N，默认: N): " delete_image
    delete_image=${delete_image:-n}
    
    if [ "$delete_image" = "y" ] || [ "$delete_image" = "Y" ]; then
        TTS_LITE_IMAGE="ttbye/tts-api-lite:latest"
        if docker images --format "{{.Repository}}:{{.Tag}}" | grep -qE "^${TTS_LITE_IMAGE}$"; then
            print_info "正在删除镜像: $TTS_LITE_IMAGE"
            if docker rmi "$TTS_LITE_IMAGE" 2>/dev/null; then
                print_success "镜像已删除"
            else
                print_warning "镜像删除失败（可能被其他容器使用）"
            fi
        else
            print_info "镜像不存在，跳过删除"
        fi
    fi
    
    echo ""
    print_success "TTS-API-Lite 服务删除完成"
    echo ""
    read -p "按回车键返回..."
}

# 下载 TTS 模型（已废弃，保留兼容性）
download_tts_models() {
    print_header "下载 TTS 模型"
    
    print_warning "此功能已废弃"
    print_info "TTS API 服务会在首次启动时自动下载所需模型"
    print_info "如果需要手动管理模型，请直接操作模型目录"
    
    PROJECT_ROOT=$(get_project_root)
    PLATFORM=$(detect_platform)
    TTS_PATHS=$(get_tts_api_paths "$PLATFORM")
    MODELS_DIR="${TTS_PATHS%%|*}"
    
    print_info "模型目录: $MODELS_DIR"
    print_info "请将模型文件放置到以下目录："
    echo "  - IndexTTS2: $MODELS_DIR/indextts2/"
    echo "  - CosyVoice: $MODELS_DIR/cosyvoice/"
    echo "  - MultiTTS: $MODELS_DIR/multitts/"
    
    echo ""
    read -p "按回车键返回..."
}

# 删除已导出的镜像文件
delete_exported_images() {
    PROJECT_ROOT=$(get_project_root)
    IMAGE_DIR="$PROJECT_ROOT/docker-images"
    
    print_header "删除已导出的镜像文件"
    
    if [ ! -d "$IMAGE_DIR" ]; then
        print_warning "镜像目录不存在: $IMAGE_DIR"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    # 查找镜像文件
    IMAGE_FILES=$(find "$IMAGE_DIR" -name "*.tar.gz" -type f 2>/dev/null)
    
    if [ -z "$IMAGE_FILES" ]; then
        print_info "未找到镜像文件"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    echo ""
    print_info "找到以下镜像文件:"
    echo "$IMAGE_FILES" | while read -r file; do
        if [ -f "$file" ]; then
            SIZE=$(du -h "$file" | cut -f1)
            echo "  - $file ($SIZE)"
        fi
    done
    
    echo ""
    print_warning "此操作将永久删除上述镜像文件，无法恢复！"
    read -p "确认删除? (y/N，默认: N): " confirm_delete
    confirm_delete=${confirm_delete:-n}
    
    if [ "$confirm_delete" != "y" ] && [ "$confirm_delete" != "Y" ]; then
        print_info "已取消删除"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    # 删除文件
    DELETED_COUNT=0
    TOTAL_SIZE=0
    
    while IFS= read -r file; do
        if [ -f "$file" ]; then
            SIZE=$(du -k "$file" 2>/dev/null | cut -f1 || echo "0")
            if rm -f "$file" 2>/dev/null; then
                DELETED_COUNT=$((DELETED_COUNT + 1))
                TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
                print_success "已删除: $(basename "$file")"
            else
                print_error "删除失败: $(basename "$file")"
            fi
        fi
    done <<< "$IMAGE_FILES"
    
    # 尝试删除 README.md（如果存在）
    if [ -f "$IMAGE_DIR/README.md" ]; then
        rm -f "$IMAGE_DIR/README.md" 2>/dev/null
    fi
    
    # 如果目录为空，询问是否删除目录
    if [ -d "$IMAGE_DIR" ] && [ -z "$(ls -A "$IMAGE_DIR" 2>/dev/null)" ]; then
        read -p "目录已为空，是否删除目录? (y/N，默认: N): " delete_dir
        delete_dir=${delete_dir:-n}
        if [ "$delete_dir" = "y" ] || [ "$delete_dir" = "Y" ]; then
            rmdir "$IMAGE_DIR" 2>/dev/null && print_success "已删除空目录: $IMAGE_DIR"
        fi
    fi
    
    echo ""
    if [ $DELETED_COUNT -gt 0 ]; then
        TOTAL_SIZE_MB=$((TOTAL_SIZE / 1024))
        print_success "删除完成！共删除 $DELETED_COUNT 个文件，释放空间约 ${TOTAL_SIZE_MB}MB"
    else
        print_warning "未删除任何文件"
    fi
    
    echo ""
    read -p "按回车键返回..."
}

# 删除 Docker 中的镜像
delete_docker_images() {
    print_header "删除 Docker 中的镜像"
    
    PROJECT_ROOT=$(get_project_root)
    
    # 如果没有选择 compose 文件，尝试自动选择
    if [ -z "$COMPOSE_FILE_PATH" ]; then
        # 尝试查找 compose 文件
        COMPOSE_FILES=(
            "$PROJECT_ROOT/sh/docker-compose.yml"
            "$PROJECT_ROOT/sh/docker-compose-Linux.yml"
            "$PROJECT_ROOT/sh/docker-compose-Synology.yml"
            "$PROJECT_ROOT/sh/docker-compose-MACOS.yml"
            "$PROJECT_ROOT/sh/docker-compose-WINDOWS.yml"
        )
        
        for file in "${COMPOSE_FILES[@]}"; do
            if [ -f "$file" ]; then
                COMPOSE_FILE_PATH="$file"
                break
            fi
        done
    fi
    
    # 从 docker-compose 文件中读取镜像名称
    BACKEND_IMAGE=""
    FRONTEND_IMAGE=""
    
    if [ -n "$COMPOSE_FILE_PATH" ] && [ -f "$COMPOSE_FILE_PATH" ]; then
        BACKEND_IMAGE=$(awk '/backend:/,/^[[:space:]]*[a-zA-Z]/ {if (/image:/) {gsub(/^[[:space:]]*image:[[:space:]]*/, ""); gsub(/["'\'']/, ""); print; exit}}' "$COMPOSE_FILE_PATH")
        FRONTEND_IMAGE=$(awk '/frontend:/,/^[[:space:]]*[a-zA-Z]/ {if (/image:/) {gsub(/^[[:space:]]*image:[[:space:]]*/, ""); gsub(/["'\'']/, ""); print; exit}}' "$COMPOSE_FILE_PATH")
    fi
    
    # 如果提取失败，使用默认值
    if [ -z "$BACKEND_IMAGE" ]; then
        BACKEND_IMAGE="ttbye/readknows-backend:latest"
    fi
    if [ -z "$FRONTEND_IMAGE" ]; then
        FRONTEND_IMAGE="ttbye/readknows-frontend:latest"
    fi
    
    echo ""
    print_info "将删除以下镜像:"
    
    # 检查后端镜像
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${BACKEND_IMAGE}$"; then
        BACKEND_SIZE=$(docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}" | grep "^${BACKEND_IMAGE}" | awk '{print $2}')
        echo "  - $BACKEND_IMAGE ($BACKEND_SIZE)"
        BACKEND_EXISTS=true
    else
        echo "  - $BACKEND_IMAGE (未找到)"
        BACKEND_EXISTS=false
    fi
    
    # 检查前端镜像
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${FRONTEND_IMAGE}$"; then
        FRONTEND_SIZE=$(docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}" | grep "^${FRONTEND_IMAGE}" | awk '{print $2}')
        echo "  - $FRONTEND_IMAGE ($FRONTEND_SIZE)"
        FRONTEND_EXISTS=true
    else
        echo "  - $FRONTEND_IMAGE (未找到)"
        FRONTEND_EXISTS=false
    fi
    
    if [ "$BACKEND_EXISTS" = false ] && [ "$FRONTEND_EXISTS" = false ]; then
        print_warning "未找到任何镜像"
        echo ""
        read -p "按回车键返回主菜单..."
        return
    fi
    
    echo ""
    print_warning "此操作将永久删除上述 Docker 镜像，无法恢复！"
    print_warning "如果容器正在运行，将自动停止并删除容器。"
    echo ""
    read -p "确认删除? (y/N，默认: N): " confirm_delete
    confirm_delete=${confirm_delete:-n}
    
    if [ "$confirm_delete" != "y" ] && [ "$confirm_delete" != "Y" ]; then
        print_info "已取消删除"
        echo ""
        read -p "按回车键返回..."
        return
    fi
    
    # 检查并删除相关容器（包括运行中和已停止的）
    if echo "$COMPOSE_FILE_PATH" | grep -qiE "(NAS|Synology|Linux)"; then
        BACKEND_CONTAINER="knowbooks-backend"
        FRONTEND_CONTAINER="knowbooks-frontend"
    else
        BACKEND_CONTAINER="readknows-backend"
        FRONTEND_CONTAINER="readknows-frontend"
    fi
    
    # 检查所有容器（包括运行中和已停止的）
    CONTAINERS_TO_DELETE=()
    
    # 检查后端容器
    if docker ps -a --format "{{.Names}}" | grep -qE "^${BACKEND_CONTAINER}$"; then
        CONTAINER_STATUS=$(docker ps --format "{{.Names}}" | grep -qE "^${BACKEND_CONTAINER}$" && echo "running" || echo "stopped")
        CONTAINERS_TO_DELETE+=("$BACKEND_CONTAINER:$CONTAINER_STATUS")
    fi
    
    # 检查前端容器
    if docker ps -a --format "{{.Names}}" | grep -qE "^${FRONTEND_CONTAINER}$"; then
        CONTAINER_STATUS=$(docker ps --format "{{.Names}}" | grep -qE "^${FRONTEND_CONTAINER}$" && echo "running" || echo "stopped")
        CONTAINERS_TO_DELETE+=("$FRONTEND_CONTAINER:$CONTAINER_STATUS")
    fi
    
    # 如果有容器，先删除容器
    if [ ${#CONTAINERS_TO_DELETE[@]} -gt 0 ]; then
        print_info "检测到相关容器，将先删除容器..."
        
        # 尝试使用 docker compose 删除（如果可用）
        if [ -n "$COMPOSE_FILE_PATH" ]; then
            COMPOSE_DIR="$(dirname "$COMPOSE_FILE_PATH")"
            OLD_DIR=$(pwd)
            cd "$COMPOSE_DIR"
            
            # 停止并删除容器
            print_info "使用 docker compose 停止并删除容器..."
            $COMPOSE_CMD down --remove-orphans 2>/dev/null || true
            cd "$OLD_DIR"
        fi
        
        # 手动删除容器（作为备用方案）
        for container_info in "${CONTAINERS_TO_DELETE[@]}"; do
            CONTAINER_NAME="${container_info%%:*}"
            CONTAINER_STATUS="${container_info##*:}"
            
            if [ "$CONTAINER_STATUS" = "running" ]; then
                print_info "停止容器: $CONTAINER_NAME"
                docker stop "$CONTAINER_NAME" 2>/dev/null || true
            fi
            
            print_info "删除容器: $CONTAINER_NAME"
            docker rm "$CONTAINER_NAME" 2>/dev/null || true
            
            if docker ps -a --format "{{.Names}}" | grep -qE "^${CONTAINER_NAME}$"; then
                print_warning "容器 $CONTAINER_NAME 删除失败，尝试强制删除..."
                docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
            else
                print_success "容器 $CONTAINER_NAME 已删除"
            fi
        done
    fi
    
    # 等待一下，确保容器完全删除
    sleep 1
    
    # 删除镜像
    DELETED_COUNT=0
    
    if [ "$BACKEND_EXISTS" = true ]; then
        print_info "正在删除后端镜像: $BACKEND_IMAGE"
        
        # 先尝试普通删除
        if docker rmi "$BACKEND_IMAGE" 2>/dev/null; then
            print_success "后端镜像删除成功"
            DELETED_COUNT=$((DELETED_COUNT + 1))
        else
            # 如果失败，尝试强制删除
            print_warning "普通删除失败，尝试强制删除..."
            if docker rmi -f "$BACKEND_IMAGE" 2>/dev/null; then
                print_success "后端镜像强制删除成功"
                DELETED_COUNT=$((DELETED_COUNT + 1))
            else
                print_error "后端镜像删除失败"
                print_info "可能的原因："
                echo "  1. 镜像被其他容器使用"
                echo "  2. 镜像被其他标签引用"
                echo "  3. 权限不足"
                echo ""
                print_info "可以尝试手动删除："
                echo "  docker rmi -f $BACKEND_IMAGE"
            fi
        fi
    fi
    
    if [ "$FRONTEND_EXISTS" = true ]; then
        print_info "正在删除前端镜像: $FRONTEND_IMAGE"
        
        # 先尝试普通删除
        if docker rmi "$FRONTEND_IMAGE" 2>/dev/null; then
            print_success "前端镜像删除成功"
            DELETED_COUNT=$((DELETED_COUNT + 1))
        else
            # 如果失败，尝试强制删除
            print_warning "普通删除失败，尝试强制删除..."
            if docker rmi -f "$FRONTEND_IMAGE" 2>/dev/null; then
                print_success "前端镜像强制删除成功"
                DELETED_COUNT=$((DELETED_COUNT + 1))
            else
                print_error "前端镜像删除失败"
                print_info "可能的原因："
                echo "  1. 镜像被其他容器使用"
                echo "  2. 镜像被其他标签引用"
                echo "  3. 权限不足"
                echo ""
                print_info "可以尝试手动删除："
                echo "  docker rmi -f $FRONTEND_IMAGE"
            fi
        fi
    fi
    
    echo ""
    if [ $DELETED_COUNT -gt 0 ]; then
        print_success "删除完成！共删除 $DELETED_COUNT 个镜像"
        print_info "现在可以重新运行安装脚本进行完整打包"
    else
        print_warning "未删除任何镜像"
    fi
    
    echo ""
    read -p "按回车键返回..."
}

# 执行安装流程
run_installation() {
    print_header "ReadKnows (读士私人书库) 一键安装部署脚本"
    
    # 检查依赖
    check_docker
    check_docker_compose
    check_docker_service
    check_docker_registry
    
    # 检查文件
    check_files
    
    # 创建.env文件
    create_env_file
    
    # 创建目录
    create_directories
    
    # 检查端口
    check_ports
    
    # 停止现有容器
    stop_existing_containers
    
    # 构建并启动
    build_and_start
    
    # 等待服务
    wait_for_services
    
    # 显示状态
    show_status
    
    # 检查并安装 Calibre（如果需要）
    check_and_install_calibre
    
    # 初始化管理员
    init_admin
    
    print_header "安装完成"
    print_success "ReadKnows (读士私人书库) 已成功安装并启动！"
    echo ""
    print_info "访问地址:"
    echo "  🌐 前端: http://localhost:1280"
    echo "  🔌 后端API: http://localhost:1281"
    echo ""
    print_info "下一步:"
    echo "  1. 打开浏览器访问 http://localhost:1280"
    echo "  2. 使用初始化时创建的管理员账户登录"
    echo "  3. 开始使用 ReadKnows (读士私人书库)！"
    echo ""
}

# 主函数
main() {
    show_main_menu
}

# 执行主函数
main

