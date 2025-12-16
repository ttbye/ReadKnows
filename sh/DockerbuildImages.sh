#!/bin/bash

# ReadKnows (读士私人书库) Docker 镜像构建脚本
# 用于构建前端和后端的Docker镜像

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# 检查Docker是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "未找到 Docker，请先安装 Docker"
        exit 1
    fi
    print_success "Docker 已安装"
}

# 检查Docker Compose是否安装
check_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    elif docker compose version &> /dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    else
        print_error "未找到 Docker Compose，请先安装 Docker Compose"
        exit 1
    fi
    print_success "Docker Compose 已安装"
}

# 获取项目根目录
get_project_root() {
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    echo "$SCRIPT_DIR"
}

# 构建后端镜像
build_backend() {
    print_header "构建后端镜像"
    
    BACKEND_DIR="$PROJECT_ROOT/backend"
    
    if [ ! -f "$BACKEND_DIR/Dockerfile" ]; then
        print_error "未找到后端 Dockerfile: $BACKEND_DIR/Dockerfile"
        exit 1
    fi
    
    print_info "后端构建上下文: $BACKEND_DIR"
    
    # 构建镜像
    docker build \
        -t ttbye/readknows-backend:latest \
        -f "$BACKEND_DIR/Dockerfile" \
        "$BACKEND_DIR"
    
    if [ $? -eq 0 ]; then
        print_success "后端镜像构建成功: ttbye/readknows-backend:latest"
    else
        print_error "后端镜像构建失败"
        exit 1
    fi
}

# 构建前端镜像
build_frontend() {
    print_header "构建前端镜像"
    
    FRONTEND_DIR="$PROJECT_ROOT/frontend"
    
    if [ ! -f "$FRONTEND_DIR/Dockerfile" ]; then
        print_error "未找到前端 Dockerfile: $FRONTEND_DIR/Dockerfile"
        exit 1
    fi
    
    print_info "前端构建上下文: $FRONTEND_DIR"
    
    # 构建镜像
    docker build \
        -t ttbye/readknows-frontend:latest \
        -f "$FRONTEND_DIR/Dockerfile" \
        "$FRONTEND_DIR"
    
    if [ $? -eq 0 ]; then
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
    print_info "镜像大小:"
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep readknows || true
}

# 主函数
main() {
    print_header "ReadKnows (读士私人书库) Docker 镜像构建脚本"
    
    # 检查依赖
    check_docker
    check_docker_compose
    
    # 获取项目根目录
    PROJECT_ROOT=$(get_project_root)
    print_info "项目根目录: $PROJECT_ROOT"
    
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
    
    print_header "构建完成"
    print_success "所有镜像构建完成！"
    echo ""
    print_info "下一步操作:"
    echo "  1. 运行 ./install.sh 进行一键安装部署"
    echo "  2. 或使用 docker-compose up -d 启动服务"
    echo ""
}

# 执行主函数
main

