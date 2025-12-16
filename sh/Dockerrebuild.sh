#!/bin/bash

# ReadKnows (读士私人书库) 重新构建镜像脚本
# 用于修改代码后快速重新构建和部署

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
}

# 检查Docker服务是否运行
check_docker_service() {
    if ! docker info &> /dev/null; then
        print_error "Docker 服务未运行，请启动 Docker 服务"
        exit 1
    fi
}

# 获取项目根目录
get_project_root() {
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    echo "$SCRIPT_DIR"
}

# 检查容器是否运行
check_containers() {
    if docker ps | grep -q "readknows-backend\|readknows-frontend"; then
        return 0
    else
        return 1
    fi
}

# 停止容器
stop_containers() {
    print_info "停止现有容器..."
    $COMPOSE_CMD down
    print_success "容器已停止"
}

# 构建后端镜像
build_backend() {
    print_header "构建后端镜像"
    
    PROJECT_ROOT=$(get_project_root)
    BACKEND_DIR="$PROJECT_ROOT/backend"
    
    if [ ! -f "$BACKEND_DIR/Dockerfile" ]; then
        print_error "未找到后端 Dockerfile: $BACKEND_DIR/Dockerfile"
        exit 1
    fi
    
    print_info "后端构建上下文: $BACKEND_DIR"
    
    # 使用 docker-compose 构建（推荐，因为会使用缓存）
    if [ "$USE_COMPOSE" = true ]; then
        print_info "使用 docker-compose 构建后端..."
        $COMPOSE_CMD build backend
        
        if [ $? -eq 0 ]; then
            print_success "后端镜像构建成功"
        else
            print_error "后端镜像构建失败"
            exit 1
        fi
    else
        # 直接使用 docker build
        print_info "使用 docker build 构建后端..."
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
    fi
}

# 构建前端镜像
build_frontend() {
    print_header "构建前端镜像"
    
    PROJECT_ROOT=$(get_project_root)
    FRONTEND_DIR="$PROJECT_ROOT/frontend"
    
    if [ ! -f "$FRONTEND_DIR/Dockerfile" ]; then
        print_error "未找到前端 Dockerfile: $FRONTEND_DIR/Dockerfile"
        exit 1
    fi
    
    print_info "前端构建上下文: $FRONTEND_DIR"
    
    # 使用 docker-compose 构建（推荐，因为会使用缓存）
    if [ "$USE_COMPOSE" = true ]; then
        print_info "使用 docker-compose 构建前端..."
        $COMPOSE_CMD build frontend
        
        if [ $? -eq 0 ]; then
            print_success "前端镜像构建成功"
        else
            print_error "前端镜像构建失败"
            exit 1
        fi
    else
        # 直接使用 docker build
        print_info "使用 docker build 构建前端..."
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
    fi
}

# 启动容器
start_containers() {
    print_header "启动容器"
    
    if [ "$USE_COMPOSE" = true ]; then
        print_info "使用 docker-compose 启动服务..."
        $COMPOSE_CMD up -d
        
        if [ $? -eq 0 ]; then
            print_success "服务启动成功"
        else
            print_error "服务启动失败"
            exit 1
        fi
    else
        print_warning "未使用 docker-compose，请手动启动容器"
        print_info "可以使用: docker-compose up -d"
    fi
}

# 显示服务状态
show_status() {
    print_header "服务状态"
    
    echo ""
    if [ "$USE_COMPOSE" = true ]; then
        print_info "容器状态:"
        $COMPOSE_CMD ps
        
        echo ""
        print_info "服务地址:"
        echo "  前端: http://localhost:1280"
        echo "  后端API: http://localhost:1281"
        
        echo ""
        print_info "查看日志:"
        echo "  所有日志: $COMPOSE_CMD logs -f"
        echo "  后端日志: $COMPOSE_CMD logs -f backend"
        echo "  前端日志: $COMPOSE_CMD logs -f frontend"
    else
        print_info "容器状态:"
        docker ps | grep readknows || print_warning "未发现运行中的容器"
    fi
}

# 清理旧镜像（可选）
cleanup_old_images() {
    if [ "$CLEANUP" = true ]; then
        print_info "清理未使用的镜像..."
        docker image prune -f
        print_success "清理完成"
    fi
}

# 主函数
main() {
    print_header "ReadKnows (读士私人书库) 重新构建脚本"
    
    # 解析参数
    BUILD_BACKEND=false
    BUILD_FRONTEND=false
    RESTART=false
    USE_COMPOSE=true
    CLEANUP=false
    NO_CACHE=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --backend|-b)
                BUILD_BACKEND=true
                shift
                ;;
            --frontend|-f)
                BUILD_FRONTEND=true
                shift
                ;;
            --all|-a)
                BUILD_BACKEND=true
                BUILD_FRONTEND=true
                shift
                ;;
            --restart|-r)
                RESTART=true
                shift
                ;;
            --no-compose)
                USE_COMPOSE=false
                shift
                ;;
            --cleanup|-c)
                CLEANUP=true
                shift
                ;;
            --no-cache)
                NO_CACHE=true
                shift
                ;;
            --help|-h)
                echo "用法: $0 [选项]"
                echo ""
                echo "选项:"
                echo "  -b, --backend      只构建后端"
                echo "  -f, --frontend     只构建前端"
                echo "  -a, --all          构建所有（后端+前端）"
                echo "  -r, --restart      构建后重启容器"
                echo "  --no-compose       不使用 docker-compose（直接使用 docker build）"
                echo "  -c, --cleanup      构建后清理未使用的镜像"
                echo "  --no-cache         不使用缓存构建（完全重新构建）"
                echo "  -h, --help         显示帮助信息"
                echo ""
                echo "示例:"
                echo "  $0 -f -r           # 构建前端并重启"
                echo "  $0 -b              # 只构建后端"
                echo "  $0 -a -r           # 构建所有并重启"
                exit 0
                ;;
            *)
                print_error "未知选项: $1"
                echo "使用 --help 查看帮助信息"
                exit 1
                ;;
        esac
    done
    
    # 如果没有指定构建目标，显示交互式菜单
    if [ "$BUILD_BACKEND" = false ] && [ "$BUILD_FRONTEND" = false ]; then
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
                BUILD_BACKEND=true
                ;;
            2)
                BUILD_FRONTEND=true
                ;;
            3)
                BUILD_BACKEND=true
                BUILD_FRONTEND=true
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
        
        # 询问是否重启
        if check_containers; then
            echo ""
            read -p "构建后是否重启容器? (y/n): " restart_choice
            if [ "$restart_choice" = "y" ] || [ "$restart_choice" = "Y" ]; then
                RESTART=true
            fi
        fi
    fi
    
    # 检查依赖
    check_docker
    check_docker_compose
    check_docker_service
    
    # 如果使用 docker-compose 且需要无缓存构建
    if [ "$USE_COMPOSE" = true ] && [ "$NO_CACHE" = true ]; then
        COMPOSE_CMD="$COMPOSE_CMD --no-cache"
    fi
    
    # 如果选择重启，先停止容器
    if [ "$RESTART" = true ] && check_containers; then
        stop_containers
    fi
    
    # 构建镜像
    if [ "$BUILD_BACKEND" = true ]; then
        build_backend
    fi
    
    if [ "$BUILD_FRONTEND" = true ]; then
        build_frontend
    fi
    
    # 清理旧镜像
    cleanup_old_images
    
    # 如果选择重启，启动容器
    if [ "$RESTART" = true ]; then
        start_containers
        
        # 等待服务启动
        print_info "等待服务启动..."
        sleep 5
    fi
    
    # 显示状态
    show_status
    
    print_header "构建完成"
    print_success "重新构建完成！"
    
    if [ "$RESTART" = false ] && check_containers; then
        echo ""
        print_info "提示: 容器正在运行，需要手动重启以应用新镜像"
        print_info "运行: $COMPOSE_CMD restart 或 $COMPOSE_CMD up -d"
    fi
}

# 执行主函数
main "$@"

