#!/bin/bash

# Docker 启动前检查脚本
# 自动创建所有必要的目录

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# 读取环境变量
READKNOWS_DATA_DIR="${READKNOWS_DATA_DIR:-/volume5/docker/ReadKnows}"

print_info "检查并创建必要的目录..."

# 需要创建的目录列表
DIRS=(
    "$READKNOWS_DATA_DIR/data"
    "$READKNOWS_DATA_DIR/data/books"
    "$READKNOWS_DATA_DIR/data/covers"
    "$READKNOWS_DATA_DIR/data/fonts"
    "$READKNOWS_DATA_DIR/data/import"
    "$READKNOWS_DATA_DIR/data/messages"
    "$READKNOWS_DATA_DIR/data/cache/ocr"
    "$READKNOWS_DATA_DIR/data/cache/tts"
    "$READKNOWS_DATA_DIR/cache/calibre"
)

# 创建目录
CREATED_COUNT=0
EXISTING_COUNT=0
ERROR_COUNT=0

for dir in "${DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        if mkdir -p "$dir" 2>/dev/null; then
            print_success "创建目录: $dir"
            CREATED_COUNT=$((CREATED_COUNT + 1))
        else
            print_error "创建失败: $dir (可能需要权限)"
            ERROR_COUNT=$((ERROR_COUNT + 1))
        fi
    else
        print_info "目录已存在: $dir"
        EXISTING_COUNT=$((EXISTING_COUNT + 1))
    fi
done

echo ""
print_info "目录检查完成:"
echo "  创建: $CREATED_COUNT 个"
echo "  已存在: $EXISTING_COUNT 个"
if [ $ERROR_COUNT -gt 0 ]; then
    echo "  失败: $ERROR_COUNT 个"
    print_warning "部分目录创建失败，请检查权限"
    exit 1
fi

print_success "所有目录已就绪！"
