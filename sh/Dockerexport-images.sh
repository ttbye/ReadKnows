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
    print_info "检查镜像是否存在..."
    
    BACKEND_EXISTS=false
    FRONTEND_EXISTS=false
    
    if docker images | grep -q "ttbye/readknows-backend.*latest"; then
        BACKEND_EXISTS=true
        print_success "找到后端镜像: ttbye/readknows-backend:latest"
    else
        print_warning "未找到后端镜像: ttbye/readknows-backend:latest"
    fi
    
    if docker images | grep -q "ttbye/readknows-frontend.*latest"; then
        FRONTEND_EXISTS=true
        print_success "找到前端镜像: ttbye/readknows-frontend:latest"
    else
        print_warning "未找到前端镜像: ttbye/readknows-frontend:latest"
    fi
    
    if [ "$BACKEND_EXISTS" = false ] && [ "$FRONTEND_EXISTS" = false ]; then
        print_error "未找到任何镜像，请先运行 ./build-images.sh 构建镜像"
        exit 1
    fi
}

# 显示镜像信息
show_images() {
    print_header "镜像信息"
    
    echo ""
    print_info "当前镜像列表:"
    docker images | grep -E "ttbye/readknows-(backend|frontend)" || print_warning "未找到相关镜像"
    
    echo ""
    print_info "镜像大小:"
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep readknows || true
    
    echo ""
    print_info "镜像存储位置:"
    print_info "Docker镜像默认存储在: $(docker info 2>/dev/null | grep 'Docker Root Dir' | awk '{print $4}' || echo '/var/lib/docker')"
}

# 导出镜像
export_images() {
    print_header "导出镜像"
    
    # 创建导出目录
    EXPORT_DIR="./docker-images"
    mkdir -p "$EXPORT_DIR"
    
    print_info "导出目录: $(pwd)/$EXPORT_DIR"
    
    # 导出后端镜像
    if docker images | grep -q "ttbye/readknows-backend.*latest"; then
        print_info "正在导出后端镜像..."
        docker save ttbye/readknows-backend:latest | gzip > "$EXPORT_DIR/readknows-backend-latest.tar.gz"
        
        if [ $? -eq 0 ]; then
            BACKEND_SIZE=$(du -h "$EXPORT_DIR/readknows-backend-latest.tar.gz" | cut -f1)
            print_success "后端镜像导出成功: $EXPORT_DIR/readknows-backend-latest.tar.gz ($BACKEND_SIZE)"
        else
            print_error "后端镜像导出失败"
            exit 1
        fi
    fi
    
    # 导出前端镜像
    if docker images | grep -q "ttbye/readknows-frontend.*latest"; then
        print_info "正在导出前端镜像..."
        docker save ttbye/readknows-frontend:latest | gzip > "$EXPORT_DIR/readknows-frontend-latest.tar.gz"
        
        if [ $? -eq 0 ]; then
            FRONTEND_SIZE=$(du -h "$EXPORT_DIR/readknows-frontend-latest.tar.gz" | cut -f1)
            print_success "前端镜像导出成功: $EXPORT_DIR/readknows-frontend-latest.tar.gz ($FRONTEND_SIZE)"
        else
            print_error "前端镜像导出失败"
            exit 1
        fi
    fi
    
    # 创建导入说明文件
    cat > "$EXPORT_DIR/README.md" << 'EOF'
# ReadKnows (读士私人书库) Docker 镜像导入说明

## 文件说明

- `readknows-backend-latest.tar.gz` - 后端服务镜像
- `readknows-frontend-latest.tar.gz` - 前端服务镜像

## 导入方法

### 方法一：使用导入脚本（推荐）

1. 将整个 `docker-images` 目录复制到目标服务器
2. 在目标服务器上运行：
   ```bash
   ./import-images.sh
   ```

### 方法二：手动导入

1. 将镜像文件复制到目标服务器
2. 在目标服务器上执行：
   ```bash
   # 导入后端镜像
   gunzip -c readknows-backend-latest.tar.gz | docker load
   
   # 导入前端镜像
   gunzip -c readknows-frontend-latest.tar.gz | docker load
   ```

3. 验证镜像：
   ```bash
   docker images | grep readknows
   ```

## 安装部署

导入镜像后，在目标服务器上运行：
```bash
./install.sh
```

或者使用 docker-compose：
```bash
docker-compose up -d
```

## 注意事项

1. 确保目标服务器已安装 Docker 和 Docker Compose
2. 确保目标服务器有足够的磁盘空间（建议至少 5GB）
3. 导入镜像后，需要确保 docker-compose.yml 和 .env 文件配置正确
EOF
    
    print_success "导入说明文件已创建: $EXPORT_DIR/README.md"
    
    # 显示导出结果
    print_header "导出完成"
    echo ""
    print_info "导出的文件:"
    ls -lh "$EXPORT_DIR"/*.tar.gz 2>/dev/null || true
    
    echo ""
    print_info "总大小:"
    du -sh "$EXPORT_DIR" | cut -f1
    
    echo ""
    print_success "镜像已导出到: $EXPORT_DIR"
    print_info "下一步:"
    echo "  1. 将 $EXPORT_DIR 目录复制到目标服务器"
    echo "  2. 在目标服务器上运行 ./import-images.sh"
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

