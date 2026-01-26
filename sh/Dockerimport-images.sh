#!/bin/bash

# ReadKnows (读士私人书库) Docker 镜像导入脚本
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
    
    # 获取脚本所在目录（install.sh 所在目录）
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
    
    # 优先在项目根目录下的 docker-images 目录查找
    IMAGE_DIR="$PROJECT_ROOT/docker-images"
    
    # 如果指定了参数，使用参数作为目录
    if [ -n "$1" ]; then
        IMAGE_DIR="$1"
    # 如果项目目录不存在，尝试当前目录
    elif [ ! -d "$IMAGE_DIR" ]; then
        IMAGE_DIR="./docker-images"
    fi
    
    if [ ! -d "$IMAGE_DIR" ]; then
        print_error "未找到镜像目录: $IMAGE_DIR"
        print_info "请确保镜像文件在以下位置之一:"
        echo "  1. $PROJECT_ROOT/docker-images/ (项目根目录)"
        echo "  2. ./docker-images/ (当前目录)"
        echo "  3. 或使用参数指定: ./sh/Dockerimport-images.sh <镜像目录路径>"
        exit 1
    fi
    
    # 查找所有镜像文件（包括 ttbye/* 和外部服务镜像）
    IMAGE_FILES=$(find "$IMAGE_DIR" -name "*.tar.gz" -type f 2>/dev/null | sort || true)
    
    if [ -z "$IMAGE_FILES" ]; then
        print_error "未找到任何镜像文件 (*.tar.gz)"
        print_info "请确保镜像文件在目录: $IMAGE_DIR"
        exit 1
    fi
    
    print_success "找到以下镜像文件:"
    echo "$IMAGE_FILES" | while read -r file; do
        if [ -f "$file" ]; then
            SIZE=$(du -h "$file" | cut -f1)
            echo "  - $(basename "$file") ($SIZE)"
        fi
    done
    echo ""
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
        print_warning "可用磁盘空间可能不足（需要约3GB），但将继续导入"
    else
        print_success "磁盘空间充足"
    fi
}

# 导入镜像
import_images() {
    print_header "导入镜像"
    
    IMPORTED_COUNT=0
    FAILED_COUNT=0
    
    # 导入所有镜像文件（使用 for 循环避免子shell问题）
    for image_file in $IMAGE_FILES; do
        if [ -z "$image_file" ] || [ ! -f "$image_file" ]; then
            continue
        fi
        
        IMAGE_NAME=$(basename "$image_file")
        print_info "正在导入镜像: $IMAGE_NAME"
        print_info "这可能需要几分钟时间，请耐心等待..."
        
        if gunzip -c "$image_file" | docker load; then
            print_success "镜像导入成功: $IMAGE_NAME"
            IMPORTED_COUNT=$((IMPORTED_COUNT + 1))
        else
            print_error "镜像导入失败: $IMAGE_NAME"
            FAILED_COUNT=$((FAILED_COUNT + 1))
        fi
        echo ""
    done
    
    if [ $FAILED_COUNT -gt 0 ]; then
        print_warning "部分镜像导入失败（$FAILED_COUNT 个）"
    fi
    
    if [ $IMPORTED_COUNT -eq 0 ]; then
        print_error "所有镜像导入失败"
        exit 1
    fi
}

# 验证镜像
verify_images() {
    print_header "验证镜像"
    
    echo ""
    print_info "已导入的镜像:"
    TTBYE_IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^ttbye/" || true)
    DOUBAN_IMAGE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^ghcr.io/cxfksword/douban-api-rs" || true)
    
    if [ -n "$TTBYE_IMAGES" ]; then
        echo ""
        print_info "ttbye/* 镜像:"
        docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | grep -E "^ttbye/|^REPOSITORY" || true
    fi
    
    if [ -n "$DOUBAN_IMAGE" ]; then
        echo ""
        print_info "外部服务镜像:"
        docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | grep -E "^ghcr.io/cxfksword/douban-api-rs|^REPOSITORY" || true
    fi
    
    if [ -z "$TTBYE_IMAGES" ] && [ -z "$DOUBAN_IMAGE" ]; then
        print_warning "未找到相关镜像"
    fi
}

# 主函数
main() {
    print_header "ReadKnows (读士私人书库) Docker 镜像导入脚本"
    
    # 检查Docker
    check_docker
    check_docker_service
    
    # 查找镜像文件
    find_image_files "$1"
    
    # 检查磁盘空间
    check_disk_space
    
    # 显示准备导入的镜像
    echo ""
    print_info "准备导入以下镜像文件:"
    echo "$IMAGE_FILES" | while read -r file; do
        if [ -f "$file" ]; then
            SIZE=$(du -h "$file" | cut -f1)
            echo "  - $(basename "$file") ($SIZE)"
        fi
    done
    echo ""
    
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

