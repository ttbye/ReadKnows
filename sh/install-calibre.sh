#!/bin/bash

# Calibre 一键安装和修复脚本
# 用于在 Docker 容器中安装或修复 Calibre（MOBI 转 EPUB 工具）

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

print_header "Calibre 一键安装和修复工具"

# 确定项目根目录和缓存目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# 如果脚本在 sh/ 目录下，项目根目录应该是父目录
if [ "$(basename "$SCRIPT_DIR")" = "sh" ]; then
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
    PROJECT_ROOT="$SCRIPT_DIR"
fi
CACHE_DIR="$PROJECT_ROOT/cache/calibre"

# 查找 docker-compose 文件
find_compose_file() {
    # 优先使用环境变量
    if [ -n "$COMPOSE_FILE" ]; then
        if [ -f "$PROJECT_ROOT/$COMPOSE_FILE" ]; then
            echo "$PROJECT_ROOT/$COMPOSE_FILE"
            return 0
        elif [ -f "$PROJECT_ROOT/sh/$COMPOSE_FILE" ]; then
            echo "$PROJECT_ROOT/sh/$COMPOSE_FILE"
            return 0
        fi
    fi
    
    # 查找常见的 docker-compose 文件
    COMPOSE_FILES=(
        "$PROJECT_ROOT/sh/docker-compose.yml"
        "$PROJECT_ROOT/docker-compose.yml"
        "$PROJECT_ROOT/sh/docker-compose-Linux.yml"
        "$PROJECT_ROOT/sh/docker-compose-Synology.yml"
        "$PROJECT_ROOT/sh/docker-compose-MACOS.yml"
        "$PROJECT_ROOT/sh/docker-compose-WINDOWS.yml"
    )
    
    for file in "${COMPOSE_FILES[@]}"; do
        if [ -f "$file" ]; then
            echo "$file"
            return 0
        fi
    done
    
    return 1
}

# 检查是否在容器内运行
if [ ! -f /.dockerenv ] && [ -z "$DOCKER_CONTAINER" ]; then
    # 在宿主机上运行，需要在容器内执行
    COMPOSE_FILE_PATH=$(find_compose_file)
    
    if [ -z "$COMPOSE_FILE_PATH" ]; then
        print_warning "未找到 docker-compose 文件，尝试使用默认命令..."
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker compose -f $COMPOSE_FILE_PATH"
        print_info "使用 docker-compose 文件: $COMPOSE_FILE_PATH"
    fi
    
    # 检查容器是否运行
    if ! $COMPOSE_CMD ps backend 2>/dev/null | grep -q "Up"; then
        print_warning "后端容器未运行"
        print_info "尝试启动容器..."
        if $COMPOSE_CMD up -d backend 2>/dev/null; then
            print_success "容器已启动，等待容器就绪..."
            sleep 3
        else
            print_error "无法启动容器，请手动启动："
            echo "  $COMPOSE_CMD up -d"
            print_info "或者确保容器已运行后再执行此脚本"
            exit 1
        fi
    fi
    
    # 确保缓存目录存在
    mkdir -p "$CACHE_DIR"
    print_info "缓存目录（宿主机）: $CACHE_DIR"
    
    # 注意：容器内应该使用挂载路径 /app/cache/calibre
    # 不要传递宿主机路径，让容器内脚本自动检测挂载路径
    print_info "在容器内执行安装..."
    $COMPOSE_CMD exec -T backend bash < "$0"
    exit $?
fi

# 容器内：确定缓存目录路径
# 优先使用挂载的缓存目录（docker-compose.yml 中挂载的路径）
# 环境变量 HOST_CACHE_DIR 在容器内应该指向容器内的挂载路径，而不是宿主机路径
CONTAINER_CACHE_DIR="/app/cache/calibre"

# 如果环境变量设置了，但指向的是宿主机路径，则使用容器内的挂载路径
if [ -n "$HOST_CACHE_DIR" ]; then
    # 检查是否是宿主机路径（包含 /Users/ 或 /home/ 等）
    if [[ "$HOST_CACHE_DIR" == *"/Users/"* ]] || [[ "$HOST_CACHE_DIR" == *"/home/"* ]] || [[ "$HOST_CACHE_DIR" == *"/volume"* ]]; then
        # 这是宿主机路径，使用容器内的挂载路径
        HOST_CACHE_DIR="$CONTAINER_CACHE_DIR"
    fi
else
    # 尝试查找挂载的缓存目录
    CACHE_DIRS=(
        "/app/cache/calibre"
        "/cache/calibre"
        "/tmp/cache/calibre"
    )
    for dir in "${CACHE_DIRS[@]}"; do
        if [ -d "$dir" ]; then
            HOST_CACHE_DIR="$dir"
            break
        fi
    done
    # 如果都没找到，使用默认的挂载路径
    if [ -z "$HOST_CACHE_DIR" ]; then
        HOST_CACHE_DIR="$CONTAINER_CACHE_DIR"
    fi
fi

# 确保缓存目录存在（容器内的挂载路径）
mkdir -p "$HOST_CACHE_DIR" 2>/dev/null || true

# 在容器内执行
print_info "检查当前 Calibre 安装状态..."

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
    print_success "Calibre 已安装"
    print_info "路径: $CALIBRE_PATH"
    "$CALIBRE_PATH" --version 2>&1 | head -1
    echo ""
    print_info "检查符号链接..."
    
    # 确保符号链接存在
    if [ ! -f /opt/calibre/ebook-convert ] && [ -f /opt/calibre/calibre/ebook-convert ]; then
        ln -sf /opt/calibre/calibre/ebook-convert /opt/calibre/ebook-convert
        print_success "创建符号链接: /opt/calibre/ebook-convert"
    fi
    
    if [ ! -f /usr/local/bin/ebook-convert ]; then
        if [ -f /opt/calibre/calibre/ebook-convert ]; then
            ln -sf /opt/calibre/calibre/ebook-convert /usr/local/bin/ebook-convert
        elif [ -f /opt/calibre/ebook-convert ]; then
            ln -sf /opt/calibre/ebook-convert /usr/local/bin/ebook-convert
        fi
        print_success "创建符号链接: /usr/local/bin/ebook-convert"
    fi
    
    if [ ! -f /usr/local/bin/ebook-meta ]; then
        if [ -f /opt/calibre/calibre/ebook-meta ]; then
            ln -sf /opt/calibre/calibre/ebook-meta /usr/local/bin/ebook-meta
        elif [ -f /opt/calibre/ebook-meta ]; then
            ln -sf /opt/calibre/ebook-meta /usr/local/bin/ebook-meta
        fi
        print_success "创建符号链接: /usr/local/bin/ebook-meta"
    fi
    
    print_success "Calibre 已就绪，无需重新安装"
    exit 0
fi

print_warning "Calibre 未安装，开始安装..."

# 步骤 1: 安装必要的依赖
print_info "步骤 1: 安装必要的系统依赖..."
export DEBIAN_FRONTEND=noninteractive

apt-get update > /dev/null 2>&1

# 安装基础工具和依赖
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

# 步骤 2: 下载并安装 Calibre（支持本地缓存）
print_info "步骤 2: 准备 Calibre 安装脚本..."

# 容器内：使用前面确定的缓存目录路径
# HOST_CACHE_DIR 已经在前面设置为容器内的挂载路径（/app/cache/calibre）
if [ -z "$HOST_CACHE_DIR" ]; then
    # 如果环境变量未设置，使用默认的挂载路径
    HOST_CACHE_DIR="/app/cache/calibre"
fi

print_info "缓存目录: $HOST_CACHE_DIR"
# 确保缓存目录存在
mkdir -p "$HOST_CACHE_DIR" 2>/dev/null || true

# 检查目录是否可写
if [ ! -w "$HOST_CACHE_DIR" ]; then
    print_warning "缓存目录不可写: $HOST_CACHE_DIR"
    print_info "请检查 Docker volume 挂载配置和目录权限"
    print_info "docker-compose.yml 中应该包含: - ./cache/calibre:/app/cache/calibre:rw"
else
    print_success "缓存目录可写，将保存下载的文件"
fi

INSTALLER="/tmp/calibre-installer.sh"
INSTALLER_URL="https://download.calibre-ebook.com/linux-installer.sh"
INSTALLER_CACHE=""
DOWNLOAD_SUCCESS=false

# 检查本地缓存
if [ -n "$HOST_CACHE_DIR" ] && [ -d "$HOST_CACHE_DIR" ]; then
    INSTALLER_CACHE="$HOST_CACHE_DIR/linux-installer.sh"
    if [ -f "$INSTALLER_CACHE" ] && [ -s "$INSTALLER_CACHE" ]; then
        print_success "发现本地缓存的安装脚本"
        print_info "缓存位置: $INSTALLER_CACHE"
        print_info "缓存大小: $(du -h "$INSTALLER_CACHE" | cut -f1)"
        
        # 复制到容器内的临时目录
        cp "$INSTALLER_CACHE" "$INSTALLER"
        if [ -f "$INSTALLER" ] && [ -s "$INSTALLER" ]; then
            DOWNLOAD_SUCCESS=true
            print_success "使用本地缓存，跳过下载"
        fi
    fi
fi

# 如果没有缓存，下载安装脚本
if [ "$DOWNLOAD_SUCCESS" = false ]; then
    print_info "未找到本地缓存，开始下载 Calibre 安装脚本..."
    print_warning "这可能需要几分钟时间，请耐心等待..."
    
    # 尝试多种下载方式
    for method in 1 2 3 4; do
        case $method in
            1)
                print_info "尝试方法 1: 使用 wget (跳过证书验证)..."
                if wget --no-check-certificate --timeout=300 --tries=3 -O "$INSTALLER" \
                    "$INSTALLER_URL" 2>&1 | grep -q "saved"; then
                    DOWNLOAD_SUCCESS=true
                    break
                fi
                ;;
            2)
                print_info "尝试方法 2: 使用 curl (跳过证书验证)..."
                if curl -k -fsSL --connect-timeout 300 --max-time 600 -o "$INSTALLER" \
                    "$INSTALLER_URL" 2>&1; then
                    DOWNLOAD_SUCCESS=true
                    break
                fi
                ;;
            3)
                print_info "尝试方法 3: 使用 wget (正常模式)..."
                if wget --timeout=300 --tries=3 -O "$INSTALLER" \
                    "$INSTALLER_URL" 2>&1 | grep -q "saved"; then
                    DOWNLOAD_SUCCESS=true
                    break
                fi
                ;;
            4)
                print_info "尝试方法 4: 使用 curl (正常模式，更长超时)..."
                if curl -fsSL --connect-timeout 600 --max-time 1200 -o "$INSTALLER" \
                    "$INSTALLER_URL" 2>&1; then
                    if [ -f "$INSTALLER" ] && [ -s "$INSTALLER" ]; then
                        DOWNLOAD_SUCCESS=true
                        break
                    fi
                fi
                ;;
        esac
        sleep 2
    done
    
    if [ "$DOWNLOAD_SUCCESS" = false ]; then
        print_error "Calibre 安装脚本下载失败"
        print_info "可能的原因："
        echo "  1. 网络连接问题"
        echo "  2. SSL 证书问题"
        echo "  3. 防火墙阻止"
        echo "  4. 下载服务器暂时不可用"
        echo ""
        print_info "提示：如果之前成功安装过，可以检查缓存目录:"
        if [ -n "$HOST_CACHE_DIR" ]; then
            echo "  $HOST_CACHE_DIR"
        fi
        print_info "也可以尝试手动下载:"
        echo "  wget --no-check-certificate -O /tmp/calibre-installer.sh $INSTALLER_URL"
        exit 1
    fi
    
    # 保存到缓存目录（如果可用）
    if [ -n "$HOST_CACHE_DIR" ] && [ -d "$HOST_CACHE_DIR" ]; then
        mkdir -p "$HOST_CACHE_DIR" 2>/dev/null || true
        if [ -w "$HOST_CACHE_DIR" ]; then
            if cp "$INSTALLER" "$INSTALLER_CACHE" 2>/dev/null; then
                print_success "安装脚本已保存到缓存: $INSTALLER_CACHE"
                print_info "缓存大小: $(du -h "$INSTALLER_CACHE" 2>/dev/null | cut -f1 || echo '未知')"
                print_info "下次安装将自动使用缓存，无需重新下载"
            else
                print_warning "无法保存到缓存目录（复制失败），但安装可以继续"
                print_info "缓存目录: $HOST_CACHE_DIR"
                print_info "请检查目录权限和挂载配置"
            fi
        else
            print_warning "缓存目录不可写: $HOST_CACHE_DIR"
            print_info "请检查目录权限和挂载配置"
        fi
    else
        print_warning "缓存目录不可用: $HOST_CACHE_DIR"
        print_info "安装将继续，但不会缓存文件"
    fi
fi

# 验证下载的文件
if [ ! -f "$INSTALLER" ] || [ ! -s "$INSTALLER" ]; then
    print_error "安装脚本文件无效或为空"
    exit 1
fi

print_success "安装脚本准备完成 ($(du -h "$INSTALLER" | cut -f1))"

# 步骤 3: 执行安装
print_info "步骤 3: 安装 Calibre..."
chmod +x "$INSTALLER"

# 设置环境变量以跳过 SSL 验证（如果 Calibre 安装脚本支持）
export PYTHONHTTPSVERIFY=0
export CURL_CA_BUNDLE=""
export REQUESTS_CA_BUNDLE=""

# 检查是否有缓存的 calibre 二进制文件
# Calibre 安装脚本会下载一个 tarball，我们可以尝试缓存它
if [ -n "$HOST_CACHE_DIR" ] && [ -d "$HOST_CACHE_DIR" ]; then
    # 查找缓存的 tarball（calibre 安装脚本会下载类似 calibre-*.tar.xz 的文件）
    CALIBRE_TARBALL_CACHE=$(find "$HOST_CACHE_DIR" -name "calibre-*.tar.xz" -type f 2>/dev/null | head -1)
    if [ -n "$CALIBRE_TARBALL_CACHE" ] && [ -f "$CALIBRE_TARBALL_CACHE" ]; then
        print_success "发现缓存的 Calibre 二进制文件: $(basename "$CALIBRE_TARBALL_CACHE")"
        print_info "缓存大小: $(du -h "$CALIBRE_TARBALL_CACHE" | cut -f1)"
        # 复制到容器内的临时目录，供安装脚本使用
        TARBALL_NAME=$(basename "$CALIBRE_TARBALL_CACHE")
        if cp "$CALIBRE_TARBALL_CACHE" "/tmp/$TARBALL_NAME" 2>/dev/null; then
            print_success "已复制缓存文件到容器，安装将使用缓存"
            # 设置环境变量，告诉安装脚本使用本地文件
            export CALIBRE_INSTALLER_TARBALL="/tmp/$TARBALL_NAME"
        fi
    fi
fi

# 执行安装（保存完整日志）
print_info "正在执行 Calibre 安装脚本..."
if [ -n "$CALIBRE_TARBALL_CACHE" ]; then
    print_info "使用缓存的二进制文件，安装速度会更快"
else
    print_warning "首次安装会下载二进制文件（约 100-200MB），请耐心等待..."
    print_info "下载完成后会自动保存到缓存，下次安装将使用缓存"
fi

bash "$INSTALLER" install_dir=/opt/calibre > /tmp/calibre-install.log 2>&1
INSTALL_EXIT_CODE=$?

# 尝试从多个位置查找下载的 tarball 并保存到缓存
if [ -n "$HOST_CACHE_DIR" ] && [ -d "$HOST_CACHE_DIR" ]; then
    # 查找可能的 tarball 位置（calibre 安装脚本可能保存在不同位置）
    SEARCH_DIRS=(
        "/tmp"
        "/opt/calibre"
        "$HOME/.cache/calibre"
    )
    
    CALIBRE_TARBALL=""
    for search_dir in "${SEARCH_DIRS[@]}"; do
        if [ -d "$search_dir" ]; then
            CALIBRE_TARBALL=$(find "$search_dir" -maxdepth 2 -name "calibre-*.tar.xz" -type f 2>/dev/null | head -1)
            if [ -n "$CALIBRE_TARBALL" ] && [ -f "$CALIBRE_TARBALL" ]; then
                break
            fi
        fi
    done
    
    if [ -n "$CALIBRE_TARBALL" ] && [ -f "$CALIBRE_TARBALL" ]; then
        TARBALL_NAME=$(basename "$CALIBRE_TARBALL")
        # 检查缓存目录中是否已有该文件
        if [ ! -f "$HOST_CACHE_DIR/$TARBALL_NAME" ]; then
            if [ -w "$HOST_CACHE_DIR" ]; then
                if cp "$CALIBRE_TARBALL" "$HOST_CACHE_DIR/$TARBALL_NAME" 2>/dev/null; then
                    print_success "Calibre 二进制文件已保存到缓存: $HOST_CACHE_DIR/$TARBALL_NAME"
                    print_info "缓存大小: $(du -h "$HOST_CACHE_DIR/$TARBALL_NAME" 2>/dev/null | cut -f1 || echo '未知')"
                    print_info "下次安装将自动使用缓存，无需重新下载"
                else
                    print_warning "无法保存二进制文件到缓存（复制失败），但安装可以继续"
                    print_info "源文件: $CALIBRE_TARBALL"
                    print_info "目标目录: $HOST_CACHE_DIR"
                    print_info "请检查目录权限和挂载配置"
                fi
            else
                print_warning "缓存目录不可写: $HOST_CACHE_DIR"
                print_info "无法保存二进制文件到缓存，但安装可以继续"
            fi
        else
            print_info "二进制文件已在缓存中: $HOST_CACHE_DIR/$TARBALL_NAME"
            print_info "缓存大小: $(du -h "$HOST_CACHE_DIR/$TARBALL_NAME" 2>/dev/null | cut -f1 || echo '未知')"
        fi
    fi
fi

# 检查安装结果
if [ $INSTALL_EXIT_CODE -eq 0 ] || [ -f /opt/calibre/calibre/ebook-convert ] || [ -f /opt/calibre/ebook-convert ]; then
    # 检查安装结果
    if [ -f /opt/calibre/calibre/ebook-convert ]; then
        CALIBRE_INSTALL_PATH="/opt/calibre/calibre/ebook-convert"
        print_success "Calibre 安装完成（路径: /opt/calibre/calibre/ebook-convert）"
    elif [ -f /opt/calibre/ebook-convert ]; then
        CALIBRE_INSTALL_PATH="/opt/calibre/ebook-convert"
        print_success "Calibre 安装完成（路径: /opt/calibre/ebook-convert）"
    else
        print_warning "安装脚本执行完成，但未找到 ebook-convert，检查日志..."
        cat /tmp/calibre-install.log | tail -30
        print_info "尝试查找 Calibre 安装位置..."
        find /opt/calibre -name "ebook-convert" -type f 2>/dev/null | head -5 || echo "未找到"
        exit 1
    fi
else
    print_error "Calibre 安装过程出错（退出码: $INSTALL_EXIT_CODE）"
    echo ""
    print_info "安装日志（最后 30 行）:"
    cat /tmp/calibre-install.log | tail -30
    echo ""
    print_info "可能的原因："
    echo "  1. 网络连接问题（Calibre 需要下载二进制文件）"
    echo "  2. SSL 证书验证失败"
    echo "  3. 磁盘空间不足"
    echo "  4. 权限问题"
    echo ""
    print_info "建议："
    echo "  1. 检查网络连接"
    echo "  2. 检查磁盘空间: df -h"
    echo "  3. 尝试手动运行安装脚本: bash $INSTALLER install_dir=/opt/calibre"
    exit 1
fi

# 步骤 4: 创建符号链接
print_info "步骤 4: 创建符号链接..."

# 确定实际安装路径
if [ -f /opt/calibre/calibre/ebook-convert ]; then
    REAL_PATH="/opt/calibre/calibre"
elif [ -f /opt/calibre/ebook-convert ]; then
    REAL_PATH="/opt/calibre"
else
    print_error "无法找到 Calibre 安装路径"
    exit 1
fi

# 创建符号链接
if [ ! -f /opt/calibre/ebook-convert ]; then
    ln -sf "$REAL_PATH/ebook-convert" /opt/calibre/ebook-convert
    print_success "创建符号链接: /opt/calibre/ebook-convert"
fi

if [ ! -f /usr/local/bin/ebook-convert ]; then
    ln -sf "$REAL_PATH/ebook-convert" /usr/local/bin/ebook-convert
    print_success "创建符号链接: /usr/local/bin/ebook-convert"
fi

if [ ! -f /usr/local/bin/ebook-meta ]; then
    ln -sf "$REAL_PATH/ebook-meta" /usr/local/bin/ebook-meta
    print_success "创建符号链接: /usr/local/bin/ebook-meta"
fi

# 步骤 5: 验证安装
print_info "步骤 5: 验证安装..."

if [ -f /usr/local/bin/ebook-convert ] && [ -x /usr/local/bin/ebook-convert ]; then
    print_success "Calibre 安装成功！"
    echo ""
    print_info "版本信息:"
    /usr/local/bin/ebook-convert --version 2>&1 | head -1
    echo ""
    print_success "现在可以正常使用 MOBI 转 EPUB 功能了"
    
    # 清理临时文件（但保留缓存）
    rm -f "$INSTALLER" /tmp/calibre-install.log
    
    # 显示缓存信息
    if [ -n "$HOST_CACHE_DIR" ] && [ -d "$HOST_CACHE_DIR" ]; then
        CACHE_FILES=$(find "$HOST_CACHE_DIR" -type f 2>/dev/null | wc -l)
        if [ "$CACHE_FILES" -gt 0 ]; then
            print_info "缓存文件数量: $CACHE_FILES"
            print_info "缓存目录（容器内）: $HOST_CACHE_DIR"
            print_info "缓存目录（宿主机）: $PROJECT_ROOT/cache/calibre"
            print_info "下次安装将自动使用缓存，大幅缩短安装时间"
            echo ""
            print_info "缓存文件列表:"
            ls -lh "$HOST_CACHE_DIR" 2>/dev/null || echo "  无法列出缓存文件"
        else
            print_warning "缓存目录为空，未找到缓存文件"
            print_info "缓存目录: $HOST_CACHE_DIR"
            print_info "请检查 Docker volume 挂载配置"
        fi
    else
        print_warning "缓存目录不可用: $HOST_CACHE_DIR"
        print_info "请检查 docker-compose.yml 中的 volume 配置"
    fi
    
    print_header "安装完成"
    exit 0
else
    print_error "Calibre 安装验证失败"
    exit 1
fi

