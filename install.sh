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
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    echo "$SCRIPT_DIR"
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

# 显示主菜单
show_main_menu() {
    while true; do
        print_header "ReadKnows (读士私人书库) 安装工具"
        echo ""
        print_info "请选择功能:"
        echo "  1) 开始安装"
        echo "  2) 导入 Images 镜像 (执行: sh/Dockerimport-images.sh)"
        echo "  3) 导出 Images 镜像 (执行: sh/Dockerexport-images.sh)"
        echo "  4) 安装 Calibre (执行: sh/install-calibre.sh)"
        echo "  5) 初始化用户账号 (执行: sh/init-admin.sh)"
        echo "  6) 删除已导出的镜像文件 (docker-images 目录)"
        echo "  7) 删除 Docker 中的镜像 (便于重新完整打包)"
        echo "  0) 退出"
        echo ""
        read -p "请输入选项 (0-7，默认: 1): " menu_choice
        menu_choice=${menu_choice:-1}
        
        case $menu_choice in
            1)
                # 开始安装
                run_installation
                break
                ;;
            2)
                # 导入镜像
                import_images
                ;;
            3)
                # 导出镜像
                export_images
                ;;
            4)
                # 安装 Calibre
                install_calibre_standalone
                ;;
            5)
                # 初始化用户账号
                init_admin_standalone
                ;;
            6)
                # 删除已导出的镜像文件
                delete_exported_images
                ;;
            7)
                # 删除 Docker 中的镜像
                delete_docker_images
                ;;
            0)
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
    
    if [ -f "$SCRIPT_PATH" ]; then
        print_info "执行镜像导入脚本..."
        bash "$SCRIPT_PATH"
        print_success "镜像导入完成"
    else
        print_error "未找到脚本: $SCRIPT_PATH"
    fi
    echo ""
    read -p "按回车键返回主菜单..."
}

# 导出镜像
export_images() {
    PROJECT_ROOT=$(get_project_root)
    SCRIPT_PATH="$PROJECT_ROOT/sh/Dockerexport-images.sh"
    
    if [ -f "$SCRIPT_PATH" ]; then
        print_info "执行镜像导出脚本..."
        bash "$SCRIPT_PATH"
        print_success "镜像导出完成"
    else
        print_error "未找到脚本: $SCRIPT_PATH"
    fi
    echo ""
    read -p "按回车键返回主菜单..."
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
    read -p "按回车键返回主菜单..."
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
    read -p "按回车键返回主菜单..."
}

# 删除已导出的镜像文件
delete_exported_images() {
    PROJECT_ROOT=$(get_project_root)
    IMAGE_DIR="$PROJECT_ROOT/docker-images"
    
    print_header "删除已导出的镜像文件"
    
    if [ ! -d "$IMAGE_DIR" ]; then
        print_warning "镜像目录不存在: $IMAGE_DIR"
        echo ""
        read -p "按回车键返回主菜单..."
        return
    fi
    
    # 查找镜像文件
    IMAGE_FILES=$(find "$IMAGE_DIR" -name "*.tar.gz" -type f 2>/dev/null)
    
    if [ -z "$IMAGE_FILES" ]; then
        print_info "未找到镜像文件"
        echo ""
        read -p "按回车键返回主菜单..."
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
        read -p "按回车键返回主菜单..."
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
    read -p "按回车键返回主菜单..."
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
        read -p "按回车键返回主菜单..."
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
    read -p "按回车键返回主菜单..."
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

