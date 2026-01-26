#!/bin/bash

# ReadKnows (读士私人书库) Docker 镜像导出脚本
# 用于导出构建好的镜像，方便迁移到其他服务器

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

# 检查镜像是否存在
check_images() {
    print_info "检查需要导出的镜像..."
    
    # 查找所有 ttbye/* 镜像
    TTBYE_IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^ttbye/" || true)
    
    # 查找 douban-api-rs 镜像
    DOUBAN_IMAGE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^ghcr.io/cxfksword/douban-api-rs" || true)
    
    # 检查是否有镜像需要导出
    if [ -z "$TTBYE_IMAGES" ] && [ -z "$DOUBAN_IMAGE" ]; then
        print_error "未找到任何需要导出的镜像"
        echo ""
        print_info "请先构建或拉取镜像，可以使用以下方法之一:"
        echo ""
        echo "方法一：使用构建脚本构建 ttbye/* 镜像（推荐）"
        echo "  ./sh/DockerbuildImages.sh"
        echo ""
        echo "方法二：使用 docker-compose 构建"
        echo "  cd sh"
        echo "  docker compose build"
        echo ""
        echo "方法三：使用 install.sh 安装（会自动构建）"
        echo "  ./install.sh"
        echo ""
        echo "方法四：拉取 douban-api-rs 镜像"
        echo "  docker pull ghcr.io/cxfksword/douban-api-rs"
        echo "  或运行: docker compose pull douban-rs-api"
        echo ""
        read -p "是否现在构建/拉取镜像？(y/n，默认: n): " build_choice
        build_choice=${build_choice:-n}
        if [ "$build_choice" = "y" ] || [ "$build_choice" = "Y" ]; then
            print_info "开始构建/拉取镜像..."
            
            # 获取脚本所在目录
            SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
            PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
            BUILD_SCRIPT="$SCRIPT_DIR/DockerbuildImages.sh"
            
            # 构建 ttbye/* 镜像
            if [ -z "$TTBYE_IMAGES" ]; then
                if [ -f "$BUILD_SCRIPT" ]; then
                    print_info "使用构建脚本: $BUILD_SCRIPT"
                    bash "$BUILD_SCRIPT"
                elif [ -f "$PROJECT_ROOT/sh/DockerbuildImages.sh" ]; then
                    print_info "使用构建脚本: $PROJECT_ROOT/sh/DockerbuildImages.sh"
                    bash "$PROJECT_ROOT/sh/DockerbuildImages.sh"
                else
                    print_info "未找到构建脚本，使用 docker-compose 构建..."
                    cd "$SCRIPT_DIR" 2>/dev/null || cd . 2>/dev/null
                    if command -v docker-compose &> /dev/null; then
                        docker-compose -f docker-compose.yml build
                    elif docker compose version &> /dev/null 2>&1; then
                        docker compose -f docker-compose.yml build
                    else
                        print_error "未找到 docker-compose，请手动构建镜像"
                        exit 1
                    fi
                fi
            fi
            
            # 拉取 douban-api-rs 镜像
            if [ -z "$DOUBAN_IMAGE" ]; then
                print_info "拉取 douban-api-rs 镜像..."
                docker pull ghcr.io/cxfksword/douban-api-rs || print_warning "拉取 douban-api-rs 镜像失败，将跳过此镜像"
            fi
            
            # 重新检查镜像
            print_info "重新检查镜像..."
            TTBYE_IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^ttbye/" || true)
            DOUBAN_IMAGE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^ghcr.io/cxfksword/douban-api-rs" || true)
            if [ -z "$TTBYE_IMAGES" ] && [ -z "$DOUBAN_IMAGE" ]; then
                print_error "构建/拉取后仍未找到镜像，请检查日志"
                exit 1
            fi
        else
            print_info "已取消，请先构建/拉取镜像后再运行导出脚本"
            exit 0
        fi
    fi
    
    # 显示找到的镜像
    echo ""
    if [ -n "$TTBYE_IMAGES" ]; then
        print_success "找到以下 ttbye/* 镜像:"
        echo "$TTBYE_IMAGES" | while read -r image; do
            if [ -n "$image" ]; then
                SIZE=$(docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}" | grep "^$image" | awk '{print $2}')
                echo "  - $image ($SIZE)"
            fi
        done
    fi
    
    if [ -n "$DOUBAN_IMAGE" ]; then
        print_success "找到以下外部服务镜像:"
        echo "$DOUBAN_IMAGE" | while read -r image; do
            if [ -n "$image" ]; then
                SIZE=$(docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}" | grep "^$image" | awk '{print $2}')
                echo "  - $image ($SIZE)"
            fi
        done
    fi
    echo ""
}

# 显示镜像信息
show_images() {
    print_header "镜像信息"
    
    echo ""
    print_info "当前镜像列表:"
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
    
    echo ""
    print_info "镜像存储位置:"
    print_info "Docker镜像默认存储在: $(docker info 2>/dev/null | grep 'Docker Root Dir' | awk '{print $4}' || echo '/var/lib/docker')"
}

# 导出镜像
export_images() {
    print_header "导出镜像"
    
    # 获取脚本所在目录（install.sh 所在目录）
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
    
    # 创建导出目录（项目根目录下的 docker-images）
    EXPORT_DIR="$PROJECT_ROOT/docker-images"
    mkdir -p "$EXPORT_DIR"
    
    print_info "导出目录: $EXPORT_DIR"
    
    # 获取所有需要导出的镜像
    TTBYE_IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^ttbye/" || true)
    DOUBAN_IMAGE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^ghcr.io/cxfksword/douban-api-rs" || true)
    
    if [ -z "$TTBYE_IMAGES" ] && [ -z "$DOUBAN_IMAGE" ]; then
        print_error "未找到任何需要导出的镜像"
        exit 1
    fi
    
    EXPORTED_COUNT=0
    FAILED_COUNT=0
    
    # 导出 ttbye/* 镜像
    for image in $TTBYE_IMAGES; do
        if [ -z "$image" ]; then
            continue
        fi
        
        # 生成文件名：ttbye/readknows-backend:latest -> readknows-backend-latest.tar.gz
        IMAGE_NAME=$(echo "$image" | sed 's|ttbye/||' | sed 's|:|_|g')
        EXPORT_FILE="$EXPORT_DIR/${IMAGE_NAME}.tar.gz"
        
        print_info "正在导出镜像: $image"
        
        if docker save "$image" | gzip > "$EXPORT_FILE"; then
            FILE_SIZE=$(du -h "$EXPORT_FILE" | cut -f1)
            print_success "镜像导出成功: $(basename "$EXPORT_FILE") ($FILE_SIZE)"
            EXPORTED_COUNT=$((EXPORTED_COUNT + 1))
        else
            print_error "镜像导出失败: $image"
            FAILED_COUNT=$((FAILED_COUNT + 1))
            # 删除可能的部分文件
            rm -f "$EXPORT_FILE" 2>/dev/null || true
        fi
    done
    
    # 导出 douban-api-rs 镜像
    if [ -n "$DOUBAN_IMAGE" ]; then
        for image in $DOUBAN_IMAGE; do
            if [ -z "$image" ]; then
                continue
            fi
            
            # 生成文件名：ghcr.io/cxfksword/douban-api-rs:latest -> douban-api-rs-latest.tar.gz
            IMAGE_NAME=$(echo "$image" | sed 's|ghcr.io/cxfksword/||' | sed 's|:|_|g')
            EXPORT_FILE="$EXPORT_DIR/${IMAGE_NAME}.tar.gz"
            
            print_info "正在导出外部服务镜像: $image"
            
            if docker save "$image" | gzip > "$EXPORT_FILE"; then
                FILE_SIZE=$(du -h "$EXPORT_FILE" | cut -f1)
                print_success "镜像导出成功: $(basename "$EXPORT_FILE") ($FILE_SIZE)"
                EXPORTED_COUNT=$((EXPORTED_COUNT + 1))
            else
                print_error "镜像导出失败: $image"
                FAILED_COUNT=$((FAILED_COUNT + 1))
                # 删除可能的部分文件
                rm -f "$EXPORT_FILE" 2>/dev/null || true
            fi
        done
    fi
    
    if [ $FAILED_COUNT -gt 0 ]; then
        print_error "部分镜像导出失败（$FAILED_COUNT 个）"
    fi
    
    if [ $EXPORTED_COUNT -eq 0 ]; then
        print_error "所有镜像导出失败"
        exit 1
    fi
    
    # 创建导入说明文件
    cat > "$EXPORT_DIR/README.md" << EOF
# ReadKnows (读士私人书库) Docker 镜像导入说明

## 文件说明

本目录包含以下 Docker 镜像文件：
EOF
    
    # 列出所有导出的镜像文件
    for image in $TTBYE_IMAGES; do
        if [ -z "$image" ]; then
            continue
        fi
        IMAGE_NAME=$(echo "$image" | sed 's|ttbye/||' | sed 's|:|_|g')
        EXPORT_FILE="$EXPORT_DIR/${IMAGE_NAME}.tar.gz"
        if [ -f "$EXPORT_FILE" ]; then
            echo "- \`${IMAGE_NAME}.tar.gz\` - $image" >> "$EXPORT_DIR/README.md"
        fi
    done
    
    # 列出 douban-api-rs 镜像
    if [ -n "$DOUBAN_IMAGE" ]; then
        for image in $DOUBAN_IMAGE; do
            if [ -z "$image" ]; then
                continue
            fi
            IMAGE_NAME=$(echo "$image" | sed 's|ghcr.io/cxfksword/||' | sed 's|:|_|g')
            EXPORT_FILE="$EXPORT_DIR/${IMAGE_NAME}.tar.gz"
            if [ -f "$EXPORT_FILE" ]; then
                echo "- \`${IMAGE_NAME}.tar.gz\` - $image (外部服务镜像)" >> "$EXPORT_DIR/README.md"
            fi
        done
    fi
    
    cat >> "$EXPORT_DIR/README.md" << 'EOF'

## 导入方法

### 方法一：使用导入脚本（推荐）

1. 将整个 `docker-images` 目录复制到目标服务器
2. 在目标服务器上运行：
   ```bash
   ./sh/Dockerimport-images.sh
   ```
   或通过 install.sh：
   ```bash
   ./install.sh
   # 选择选项 2: 导入 Images 镜像
   ```

### 方法二：手动导入

1. 将镜像文件复制到目标服务器
2. 在目标服务器上执行：
   ```bash
   # 导入所有镜像
   for file in docker-images/*.tar.gz; do
     echo "导入: $file"
     gunzip -c "$file" | docker load
   done
   ```

3. 验证镜像：
   ```bash
   docker images | grep ttbye/
   ```

## 安装部署

导入镜像后，在目标服务器上运行：
```bash
./install.sh
```

或者使用 docker-compose：
```bash
cd sh
docker compose up -d
```

## 关于 Calibre

**注意：** Calibre 不是独立的 Docker 镜像，而是安装在后端容器内的软件。

- Calibre 会在后端容器启动后自动安装（通过 Dockerfile 或安装脚本）
- 如果需要在目标服务器上安装 Calibre，请运行：
  ```bash
  ./sh/install-calibre.sh
  ```
- 或者确保后端容器已启动，Calibre 会在首次使用时自动安装

## 注意事项

1. 确保目标服务器已安装 Docker 和 Docker Compose
2. 确保目标服务器有足够的磁盘空间（建议至少 5GB）
3. 导入镜像后，需要确保 docker-compose.yml 和 .env 文件配置正确
4. douban-api-rs 镜像已包含在导出中，导入后可直接使用
EOF
    
    print_success "导入说明文件已创建: $EXPORT_DIR/README.md"
    
    # 显示导出结果
    print_header "导出完成"
    echo ""
    print_info "导出的文件:"
    ls -lh "$EXPORT_DIR"/*.tar.gz 2>/dev/null | while read -r line; do
        echo "  $line"
    done || print_warning "未找到导出的文件"
    
    echo ""
    print_info "总大小:"
    TOTAL_SIZE=$(du -sh "$EXPORT_DIR" | cut -f1)
    echo "  $TOTAL_SIZE"
    
    echo ""
    print_success "共导出 $EXPORTED_COUNT 个镜像到: $EXPORT_DIR"
    if [ $FAILED_COUNT -gt 0 ]; then
        print_warning "有 $FAILED_COUNT 个镜像导出失败"
    fi
    echo ""
    print_info "下一步:"
    echo "  1. 将 $EXPORT_DIR 目录复制到目标服务器"
    echo "  2. 在目标服务器上运行: ./sh/Dockerimport-images.sh"
    echo "  或通过 install.sh: ./install.sh (选择选项 2)"
    echo "  或手动导入: gunzip -c <镜像文件> | docker load"
}

# 主函数
main() {
    print_header "ReadKnows (读士私人书库) Docker 镜像导出脚本"
    
    # 检查Docker
    check_docker
    
    # 检查镜像
    check_images
    
    # 显示镜像信息
    show_images
    
    # 导出镜像
    export_images
}

# 执行主函数
main

