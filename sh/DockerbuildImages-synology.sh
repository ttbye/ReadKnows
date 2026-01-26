#!/bin/bash

# ReadKnows (读士私人书库) Docker 镜像构建脚本（群晖 NAS 专用）
# 用于构建适合群晖 NAS 的 Docker 镜像
# 支持 x86_64 和 arm64 架构

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
        exit 1
    fi
    print_success "Docker 已安装: $(docker --version)"
}

# 检查Docker服务是否正常运行
check_docker_service() {
    print_info "检查 Docker 服务状态..."
    
    # 检查并切换到正确的 Docker 上下文（macOS Docker Desktop）
    if docker context ls 2>/dev/null | grep -q "desktop-linux"; then
        current_context=$(docker context show 2>/dev/null || echo "")
        if [ "$current_context" != "desktop-linux" ]; then
            print_info "切换到 Docker Desktop 上下文..."
            docker context use desktop-linux 2>/dev/null || true
        fi
    fi
    
    local max_attempts=10
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker info &> /dev/null; then
            print_success "Docker 服务正常运行"
            return 0
        fi
        
        attempt=$((attempt + 1))
        if [ $attempt -lt $max_attempts ]; then
            print_info "等待 Docker 服务启动... ($attempt/$max_attempts)"
            sleep 2
        fi
    done
    
    print_error "Docker 服务未运行或无法连接"
    echo ""
    print_warning "可能的解决方案："
    echo "  1. 重启 Docker Desktop:"
    echo "     osascript -e 'quit app \"Docker\"' && sleep 3 && open -a Docker"
    echo ""
    echo "  2. 手动切换 Docker 上下文:"
    echo "     docker context use desktop-linux"
    echo ""
    echo "  3. 检查 Docker Desktop 是否完全启动（等待 Docker 图标不再闪烁）"
    echo ""
    read -p "是否现在尝试重启 Docker Desktop? (y/n): " restart_docker
    if [ "$restart_docker" = "y" ] || [ "$restart_docker" = "Y" ]; then
        print_info "正在重启 Docker Desktop..."
        osascript -e 'quit app "Docker"' 2>/dev/null || killall Docker 2>/dev/null || true
        sleep 5
        open -a Docker 2>/dev/null || print_warning "请手动启动 Docker Desktop"
        print_info "等待 Docker Desktop 启动..."
        sleep 10
        
        # 再次尝试切换上下文
        docker context use desktop-linux 2>/dev/null || true
        
        # 再次检查
        if docker info &> /dev/null; then
            print_success "Docker 服务已恢复"
            return 0
        else
            print_error "Docker 服务仍未恢复，请手动检查 Docker Desktop 状态"
            exit 1
        fi
    else
        exit 1
    fi
}

# 检查Docker Buildx是否可用（用于多平台构建）
check_buildx() {
    if ! docker buildx version &> /dev/null; then
        print_warning "Docker Buildx 未安装，将使用标准构建"
        return 1
    fi
    
    # 测试 Buildx 是否可用
    if ! docker buildx ls &> /dev/null; then
        print_warning "Docker Buildx 不可用，将使用标准构建"
        return 1
    fi
    
    print_success "Docker Buildx 已安装"
    
    # 检查是否有构建器实例
    if ! docker buildx ls 2>/dev/null | grep -q "readknows-builder"; then
        print_info "创建 Buildx 构建器实例..."
        if docker buildx create --name readknows-builder --use 2>/dev/null; then
            print_success "Buildx 构建器创建成功"
        else
            print_warning "无法创建 Buildx 构建器，将使用默认构建器"
            docker buildx use default 2>/dev/null || true
        fi
    else
        print_info "使用现有 Buildx 构建器: readknows-builder"
        docker buildx use readknows-builder 2>/dev/null || docker buildx use default 2>/dev/null || true
    fi
    return 0
}

# 检测群晖 NAS 架构
detect_synology_arch() {
    print_info "检测群晖 NAS 架构..."
    echo ""
    print_info "请选择您的群晖 NAS 架构:"
    echo "  1) x86_64 (Intel/AMD 处理器) - 大多数群晖型号"
    echo "  2) arm64 (ARM 处理器) - 部分较新的群晖型号"
    echo "  3) 自动检测（需要连接到 NAS）"
    echo ""
    read -p "请输入选项 (1-3): " arch_choice
    
    case $arch_choice in
        1)
            PLATFORM="linux/amd64"
            ARCH_NAME="x86_64"
            ;;
        2)
            PLATFORM="linux/arm64"
            ARCH_NAME="arm64"
            ;;
        3)
            print_info "自动检测需要 SSH 连接到 NAS，请输入 NAS 信息:"
            read -p "NAS IP 地址: " nas_ip
            read -p "SSH 用户名 (默认: admin): " nas_user
            nas_user=${nas_user:-admin}
            
            # 尝试检测架构
            if command -v ssh &> /dev/null; then
                detected_arch=$(ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$nas_user@$nas_ip" "uname -m" 2>/dev/null || echo "")
                if [ "$detected_arch" = "x86_64" ]; then
                    PLATFORM="linux/amd64"
                    ARCH_NAME="x86_64"
                    print_success "检测到架构: $ARCH_NAME"
                elif [ "$detected_arch" = "aarch64" ] || [ "$detected_arch" = "arm64" ]; then
                    PLATFORM="linux/arm64"
                    ARCH_NAME="arm64"
                    print_success "检测到架构: $ARCH_NAME"
                else
                    print_warning "无法自动检测架构，默认使用 x86_64"
                    PLATFORM="linux/amd64"
                    ARCH_NAME="x86_64"
                fi
            else
                print_warning "未找到 SSH 客户端，默认使用 x86_64"
                PLATFORM="linux/amd64"
                ARCH_NAME="x86_64"
            fi
            ;;
        *)
            print_warning "无效选项，默认使用 x86_64"
            PLATFORM="linux/amd64"
            ARCH_NAME="x86_64"
            ;;
    esac
    
    print_info "选择的平台: $PLATFORM ($ARCH_NAME)"
}

# 获取项目根目录
get_project_root() {
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    echo "$SCRIPT_DIR"
}

# 构建后端镜像
build_backend() {
    print_header "构建后端镜像 (平台: $PLATFORM)"
    
    BACKEND_DIR="$PROJECT_ROOT/backend"
    
    if [ ! -f "$BACKEND_DIR/Dockerfile" ]; then
        print_error "未找到后端 Dockerfile: $BACKEND_DIR/Dockerfile"
        exit 1
    fi
    
    print_info "后端构建上下文: $PROJECT_ROOT (项目根目录，用于读取 package.json)"
    print_info "目标平台: $PLATFORM"
    
    # 检查是否使用 buildx
    BUILD_SUCCESS=false
    if [ "$USE_BUILDX" = true ]; then
        print_info "尝试使用 Docker Buildx 构建多平台镜像（构建上下文: $PROJECT_ROOT）..."
        if docker buildx build \
            --platform "$PLATFORM" \
            --tag ttbye/readknows-backend:latest \
            --tag "ttbye/readknows-backend:latest-$ARCH_NAME" \
            --load \
            -f "$BACKEND_DIR/Dockerfile.debian" \
            "$PROJECT_ROOT" 2>&1; then
            BUILD_SUCCESS=true
        else
            print_warning "Buildx 构建失败，回退到标准 Docker 构建..."
            USE_BUILDX=false
        fi
    fi
    
    # 如果 Buildx 失败或未启用，使用标准构建
    if [ "$BUILD_SUCCESS" = false ]; then
        print_info "使用标准 Docker 构建（构建上下文: $PROJECT_ROOT）..."
        docker build \
            --platform "$PLATFORM" \
            -t ttbye/readknows-backend:latest \
            -f "$BACKEND_DIR/Dockerfile.debian" \
            "$PROJECT_ROOT"
        
        if [ $? -eq 0 ]; then
            BUILD_SUCCESS=true
        fi
    fi
    
    if [ "$BUILD_SUCCESS" = true ]; then
        print_success "后端镜像构建成功: ttbye/readknows-backend:latest"
    else
        print_error "后端镜像构建失败"
        exit 1
    fi
}

# 构建前端镜像
build_frontend() {
    print_header "构建前端镜像 (平台: $PLATFORM)"
    
    FRONTEND_DIR="$PROJECT_ROOT/frontend"
    
    if [ ! -f "$FRONTEND_DIR/Dockerfile" ]; then
        print_error "未找到前端 Dockerfile: $FRONTEND_DIR/Dockerfile"
        exit 1
    fi
    
    print_info "前端构建上下文: $FRONTEND_DIR"
    print_info "目标平台: $PLATFORM"
    
    # 检查是否使用 buildx
    BUILD_SUCCESS=false
    if [ "$USE_BUILDX" = true ]; then
        print_info "尝试使用 Docker Buildx 构建多平台镜像（构建上下文: $PROJECT_ROOT）..."
        if docker buildx build \
            --platform "$PLATFORM" \
            --tag ttbye/readknows-frontend:latest \
            --tag "ttbye/readknows-frontend:latest-$ARCH_NAME" \
            --load \
            -f "$FRONTEND_DIR/Dockerfile" \
            "$PROJECT_ROOT" 2>&1; then
            BUILD_SUCCESS=true
        else
            print_warning "Buildx 构建失败，回退到标准 Docker 构建..."
            USE_BUILDX=false
        fi
    fi
    
    # 如果 Buildx 失败或未启用，使用标准构建
    if [ "$BUILD_SUCCESS" = false ]; then
        print_info "使用标准 Docker 构建（构建上下文: $PROJECT_ROOT）..."
        docker build \
            --platform "$PLATFORM" \
            -t ttbye/readknows-frontend:latest \
            -f "$FRONTEND_DIR/Dockerfile" \
            "$PROJECT_ROOT"
        
        if [ $? -eq 0 ]; then
            BUILD_SUCCESS=true
        fi
    fi
    
    if [ "$BUILD_SUCCESS" = true ]; then
        print_success "前端镜像构建成功: ttbye/readknows-frontend:latest"
    else
        print_error "前端镜像构建失败"
        exit 1
    fi
}

# 显示镜像信息
show_images() {
    print_header "镜像信息"
    
    echo ""
    print_info "已构建的镜像:"
    docker images | grep -E "ttbye/readknows-(backend|frontend)" || print_warning "未找到相关镜像"
    
    echo ""
    print_info "镜像详细信息:"
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | grep readknows || true
    
    echo ""
    print_info "镜像架构信息:"
    docker inspect ttbye/readknows-backend:latest --format '后端镜像架构: {{.Architecture}}' 2>/dev/null || echo "无法获取后端镜像架构"
    docker inspect ttbye/readknows-frontend:latest --format '前端镜像架构: {{.Architecture}}' 2>/dev/null || echo "无法获取前端镜像架构"
}

# 显示导出说明
show_export_info() {
    print_header "导出镜像说明"
    
    echo ""
    print_info "构建完成后，可以使用以下命令导出镜像:"
    echo ""
    echo "  导出后端镜像:"
    echo "    docker save ttbye/readknows-backend:latest | gzip > readknows-backend-latest.tar.gz"
    echo ""
    echo "  导出前端镜像:"
    echo "    docker save ttbye/readknows-frontend:latest | gzip > readknows-frontend-latest.tar.gz"
    echo ""
    print_info "或者使用导出脚本:"
    echo "    ./Dockerexport-images.sh"
    echo ""
    print_info "在群晖 NAS 上导入镜像:"
    echo "    1. 将导出的 .tar.gz 文件上传到 NAS"
    echo "    2. 在 NAS 的 Docker 界面中，选择 '镜像' -> '新增' -> '从文件添加'"
    echo "    3. 选择上传的镜像文件进行导入"
    echo ""
    print_info "或者使用 SSH 命令导入:"
    echo "    gunzip -c readknows-backend-latest.tar.gz | docker load"
    echo "    gunzip -c readknows-frontend-latest.tar.gz | docker load"
}

# 主函数
main() {
    print_header "ReadKnows (读士私人书库) Docker 镜像构建脚本（群晖 NAS 专用）"
    
    # 检查依赖
    check_docker
    check_docker_service
    
    # 检查并设置 buildx
    USE_BUILDX=false
    if check_buildx; then
        USE_BUILDX=true
    fi
    
    # 获取项目根目录
    PROJECT_ROOT=$(get_project_root)
    print_info "项目根目录: $PROJECT_ROOT"
    
    # 检测架构
    detect_synology_arch
    
    # 询问构建选项
    echo ""
    print_info "请选择构建选项:"
    echo "  1) 构建后端镜像"
    echo "  2) 构建前端镜像"
    echo "  3) 构建所有镜像（后端 + 前端）"
    echo "  4) 取消"
    echo ""
    read -p "请输入选项 (1-4): " choice
    
    case $choice in
        1)
            build_backend
            ;;
        2)
            build_frontend
            ;;
        3)
            build_backend
            build_frontend
            ;;
        4)
            print_info "已取消构建"
            exit 0
            ;;
        *)
            print_error "无效选项，已取消"
            exit 1
            ;;
    esac
    
    # 显示镜像信息
    show_images
    
    # 显示导出说明
    show_export_info
    
    print_header "构建完成"
    print_success "所有镜像构建完成！"
    echo ""
    print_info "下一步操作:"
    echo "  1. 使用 ./Dockerexport-images.sh 导出镜像"
    echo "  2. 将导出的镜像文件上传到群晖 NAS"
    echo "  3. 在 NAS 的 Docker 界面中导入镜像"
    echo "  4. 配置并启动容器"
    echo ""
}

# 执行主函数
main
