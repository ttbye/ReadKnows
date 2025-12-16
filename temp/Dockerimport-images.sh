#!/bin/bash

# KnowBooks Docker 镜像导入脚本
# 用于在其他服务器上导入导出的镜像

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
    print_success "Docker 已安装"
}

# 检查Docker服务是否运行
check_docker_service() {
    if ! docker info &> /dev/null; then
        print_error "Docker 服务未运行，请启动 Docker 服务"
        exit 1
    fi
    print_success "Docker 服务正在运行"
}

# 查找镜像文件
find_image_files() {
    print_info "查找镜像文件..."
    
    # 默认在当前目录的 docker-images 目录中查找
    IMAGE_DIR="./docker-images"
    
    # 如果指定了参数，使用参数作为目录
    if [ -n "$1" ]; then
        IMAGE_DIR="$1"
    fi
    
    if [ ! -d "$IMAGE_DIR" ]; then
        print_error "未找到镜像目录: $IMAGE_DIR"
        print_info "请确保镜像文件在以下位置之一:"
        echo "  1. ./docker-images/"
        echo "  2. 或使用参数指定: ./import-images.sh <镜像目录路径>"
        exit 1
    fi
    
    BACKEND_IMAGE=""
    FRONTEND_IMAGE=""
    
    # 查找后端镜像
    if [ -f "$IMAGE_DIR/knowbooks-backend-latest.tar.gz" ]; then
        BACKEND_IMAGE="$IMAGE_DIR/knowbooks-backend-latest.tar.gz"
        print_success "找到后端镜像: $BACKEND_IMAGE"
    else
        print_warning "未找到后端镜像文件"
    fi
    
    # 查找前端镜像
    if [ -f "$IMAGE_DIR/knowbooks-frontend-latest.tar.gz" ]; then
        FRONTEND_IMAGE="$IMAGE_DIR/knowbooks-frontend-latest.tar.gz"
        print_success "找到前端镜像: $FRONTEND_IMAGE"
    else
        print_warning "未找到前端镜像文件"
    fi
    
    if [ -z "$BACKEND_IMAGE" ] && [ -z "$FRONTEND_IMAGE" ]; then
        print_error "未找到任何镜像文件"
        exit 1
    fi
}

# 检查磁盘空间
check_disk_space() {
    print_info "检查磁盘空间..."
    
    # 计算需要的空间（镜像解压后大约需要2-3GB）
    REQUIRED_SPACE=3000000  # 3GB in KB
    
    # 获取Docker数据目录的可用空间
    DOCKER_ROOT=$(docker info 2>/dev/null | grep 'Docker Root Dir' | awk '{print $4}' || echo '/var/lib/docker')
    AVAILABLE_SPACE=$(df "$DOCKER_ROOT" 2>/dev/null | tail -1 | awk '{print $4}' || echo "0")
    
    if [ "$AVAILABLE_SPACE" -lt "$REQUIRED_SPACE" ]; then
        print_warning "可用磁盘空间可能不足（需要约3GB）"
        read -p "是否继续? (y/n): " continue_import
        if [ "$continue_import" != "y" ] && [ "$continue_import" != "Y" ]; then
            print_info "已取消导入"
            exit 0
        fi
    else
        print_success "磁盘空间充足"
    fi
}

# 导入镜像
import_images() {
    print_header "导入镜像"
    
    # 导入后端镜像
    if [ -n "$BACKEND_IMAGE" ]; then
        print_info "正在导入后端镜像..."
        print_info "这可能需要几分钟时间，请耐心等待..."
        
        if gunzip -c "$BACKEND_IMAGE" | docker load; then
            print_success "后端镜像导入成功"
        else
            print_error "后端镜像导入失败"
            exit 1
        fi
    fi
    
    # 导入前端镜像
    if [ -n "$FRONTEND_IMAGE" ]; then
        print_info "正在导入前端镜像..."
        print_info "这可能需要几分钟时间，请耐心等待..."
        
        if gunzip -c "$FRONTEND_IMAGE" | docker load; then
            print_success "前端镜像导入成功"
        else
            print_error "前端镜像导入失败"
            exit 1
        fi
    fi
}

# 验证镜像
verify_images() {
    print_header "验证镜像"
    
    echo ""
    print_info "已导入的镜像:"
    docker images | grep -E "knowbooks-(backend|frontend)" || print_warning "未找到相关镜像"
    
    echo ""
    print_info "镜像信息:"
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | grep knowbooks || true
}

# 主函数
main() {
    print_header "KnowBooks Docker 镜像导入脚本"
    
    # 检查Docker
    check_docker
    check_docker_service
    
    # 查找镜像文件
    find_image_files "$1"
    
    # 检查磁盘空间
    check_disk_space
    
    # 询问是否继续
    echo ""
    print_info "准备导入以下镜像:"
    [ -n "$BACKEND_IMAGE" ] && echo "  - 后端: $BACKEND_IMAGE"
    [ -n "$FRONTEND_IMAGE" ] && echo "  - 前端: $FRONTEND_IMAGE"
    echo ""
    read -p "是否继续导入? (y/n): " continue_import
    if [ "$continue_import" != "y" ] && [ "$continue_import" != "Y" ]; then
        print_info "已取消导入"
        exit 0
    fi
    
    # 导入镜像
    import_images
    
    # 验证镜像
    verify_images
    
    print_header "导入完成"
    print_success "所有镜像已成功导入！"
    echo ""
    print_info "下一步:"
    echo "  1. 确保项目文件（docker-compose.yml等）已复制到当前目录"
    echo "  2. 运行 ./install.sh 进行安装部署"
    echo "  或使用: docker-compose up -d"
    echo ""
}

# 执行主函数
main "$@"

