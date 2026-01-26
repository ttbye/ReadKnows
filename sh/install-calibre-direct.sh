#!/bin/bash

# Calibre 直接安装脚本（适用于 Windows 环境）
# 直接在容器内执行安装命令，不传输脚本文件

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

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

print_header "Calibre 直接安装工具"

# 查找后端容器
CONTAINER_NAME=""
if docker ps --format "{{.Names}}" | grep -q "readknows-backend"; then
    CONTAINER_NAME="readknows-backend"
elif docker ps --format "{{.Names}}" | grep -qE ".*-backend"; then
    CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep -E ".*-backend" | head -1)
else
    print_error "未找到后端容器"
    print_info "请确保后端容器正在运行: docker ps"
    exit 1
fi

print_success "找到后端容器: $CONTAINER_NAME"

# 检查容器是否运行
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    print_error "容器 $CONTAINER_NAME 未运行"
    exit 1
fi

print_info "在容器 $CONTAINER_NAME 中安装 Calibre..."

# 直接在容器内执行安装命令
docker exec "$CONTAINER_NAME" bash -c '
set -e

print_info() {
    echo "ℹ️  $1"
}

print_success() {
    echo "✅ $1"
}

print_warning() {
    echo "⚠️  $1"
}

print_error() {
    echo "❌ $1"
}

# 检查是否已安装
CALIBRE_PATHS=(
    "/opt/calibre/calibre/ebook-convert"
    "/opt/calibre/ebook-convert"
    "/usr/local/bin/ebook-convert"
)

CALIBRE_FOUND=false
CALIBRE_PATH=""

for path in "${CALIBRE_PATHS[@]}"; do
    if [ -f "$path" ] && [ -x "$path" ]; then
        CALIBRE_FOUND=true
        CALIBRE_PATH="$path"
        break
    fi
done

if [ "$CALIBRE_FOUND" = true ]; then
    if "$CALIBRE_PATH" --version >/dev/null 2>&1; then
        print_success "Calibre 已安装"
        "$CALIBRE_PATH" --version 2>&1 | head -1
        exit 0
    else
        print_warning "检测到 Calibre 文件，但无法执行，将重新安装..."
        CALIBRE_FOUND=false
    fi
fi

print_warning "Calibre 未安装，开始安装..."

# 安装依赖
print_info "步骤 1: 安装系统依赖..."
export DEBIAN_FRONTEND=noninteractive

apt-get update > /dev/null 2>&1

apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    curl \
    xz-utils \
    python3 \
    xdg-utils \
    fontconfig \
    libegl1 \
    libopengl0 \
    libxcb-cursor0 \
    libgl1-mesa-glx \
    libxkbcommon0 \
    libxcb-xinerama0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libasound2 \
    libpulse0 \
    libdrm2 \
    libxss1 \
    libxext6 \
    libxrender1 \
    libxtst6 \
    libxi6 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    > /dev/null 2>&1

print_success "系统依赖安装完成"

# 下载并安装 Calibre
print_info "步骤 2: 下载 Calibre 安装脚本..."

INSTALLER="/tmp/calibre-installer.sh"
DOWNLOAD_SUCCESS=false

# 尝试下载
for method in 1 2 3; do
    case $method in
        1)
            print_info "  尝试方法 1: wget..."
            if wget --no-check-certificate -nv --timeout=300 --tries=3 -O "$INSTALLER" https://download.calibre-ebook.com/linux-installer.sh 2>&1; then
                if [ -f "$INSTALLER" ] && [ -s "$INSTALLER" ]; then
                    DOWNLOAD_SUCCESS=true
                    break
                fi
            fi;;
        2)
            print_info "  尝试方法 2: curl..."
            if curl -k -L --connect-timeout 300 --max-time 600 -o "$INSTALLER" https://download.calibre-ebook.com/linux-installer.sh 2>&1; then
                if [ -f "$INSTALLER" ] && [ -s "$INSTALLER" ]; then
                    DOWNLOAD_SUCCESS=true
                    break
                fi
            fi;;
        3)
            print_info "  尝试方法 3: wget (使用代理)..."
            if wget --no-check-certificate --timeout=300 --tries=3 -O "$INSTALLER" https://download.calibre-ebook.com/linux-installer.sh 2>&1; then
                if [ -f "$INSTALLER" ] && [ -s "$INSTALLER" ]; then
                    DOWNLOAD_SUCCESS=true
                    break
                fi
            fi;;
    esac
done

if [ "$DOWNLOAD_SUCCESS" = false ]; then
    print_error "下载 Calibre 安装脚本失败"
    print_info "请检查网络连接或手动下载: https://download.calibre-ebook.com/linux-installer.sh"
    exit 1
fi

print_success "下载完成"

# 执行安装
print_info "步骤 3: 安装 Calibre..."
print_warning "这可能需要几分钟时间，请耐心等待..."

chmod +x "$INSTALLER"

# 使用非交互式安装
if bash "$INSTALLER" install_dir=/opt/calibre > /dev/null 2>&1; then
    print_success "Calibre 安装完成"
else
    print_error "Calibre 安装失败"
    exit 1
fi

# 创建符号链接
print_info "步骤 4: 创建符号链接..."

if [ -f /opt/calibre/calibre/ebook-convert ]; then
    mkdir -p /opt/calibre
    ln -sf /opt/calibre/calibre/ebook-convert /opt/calibre/ebook-convert 2>/dev/null || true
    mkdir -p /usr/local/bin
    ln -sf /opt/calibre/calibre/ebook-convert /usr/local/bin/ebook-convert 2>/dev/null || true
    ln -sf /opt/calibre/calibre/ebook-meta /usr/local/bin/ebook-meta 2>/dev/null || true
    print_success "符号链接创建完成"
fi

# 验证安装
print_info "步骤 5: 验证安装..."

if [ -f /opt/calibre/calibre/ebook-convert ] && /opt/calibre/calibre/ebook-convert --version >/dev/null 2>&1; then
    print_success "Calibre 安装成功！"
    /opt/calibre/calibre/ebook-convert --version 2>&1 | head -1
    exit 0
else
    print_error "Calibre 安装验证失败"
    exit 1
fi
'

if [ $? -eq 0 ]; then
    print_success "Calibre 安装完成！"
else
    print_error "Calibre 安装失败"
    exit 1
fi

