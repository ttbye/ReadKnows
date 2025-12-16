#!/bin/bash

# Docker 镜像源修复脚本
# 用于修复无法访问的 Docker 镜像源配置

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

print_header "Docker 镜像源修复工具"

# 检测操作系统
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    DAEMON_JSON_PATH="$HOME/.docker/daemon.json"
    print_info "检测到 macOS 系统"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    DAEMON_JSON_PATH="/etc/docker/daemon.json"
    print_info "检测到 Linux 系统"
else
    print_error "不支持的操作系统: $OSTYPE"
    exit 1
fi

# 显示当前配置
print_info "当前 Docker 镜像源配置："
docker info 2>/dev/null | grep -A 10 "Registry Mirrors" || print_warning "无法获取镜像源信息"

echo ""

# 测试镜像源连通性
test_registry() {
    local registry=$1
    print_info "测试镜像源: $registry"
    
    if curl -s --max-time 5 "$registry" > /dev/null 2>&1; then
        print_success "$registry 可访问"
        return 0
    else
        print_warning "$registry 无法访问"
        return 1
    fi
}

# 检查镜像源
print_header "检查镜像源连通性"

REGISTRIES=(
    "https://hub-mirror.c.163.com"
    "https://docker.mirrors.ustc.edu.cn"
    "https://registry.docker-cn.com"
    "https://mirror.ccs.tencentyun.com"
    "https://docker.mirrors.tuna.tsinghua.edu.cn"
)

WORKING_REGISTRIES=()
FAILED_REGISTRIES=()

for registry in "${REGISTRIES[@]}"; do
    if test_registry "$registry"; then
        WORKING_REGISTRIES+=("$registry")
    else
        FAILED_REGISTRIES+=("$registry")
    fi
done

echo ""

# 提供修复选项
print_header "修复选项"

if [ ${#WORKING_REGISTRIES[@]} -eq 0 ]; then
    print_warning "所有测试的镜像源都无法访问"
    echo ""
    echo "选项："
    echo "  1) 使用 Docker Hub 官方源（推荐，但可能较慢）"
    echo "  2) 手动配置镜像源"
    echo "  3) 取消"
    echo ""
    read -p "请选择 (1-3): " choice
    
    case $choice in
        1)
            NEW_REGISTRIES=()
            ;;
        2)
            echo ""
            print_info "请手动编辑 Docker Desktop 设置："
            echo "  1. 打开 Docker Desktop"
            echo "  2. 点击设置图标（齿轮）"
            echo "  3. 选择 'Docker Engine'"
            echo "  4. 编辑 'registry-mirrors' 配置"
            echo "  5. 点击 'Apply & Restart'"
            exit 0
            ;;
        3)
            print_info "已取消"
            exit 0
            ;;
        *)
            print_error "无效选项"
            exit 1
            ;;
    esac
else
    print_success "找到 ${#WORKING_REGISTRIES[@]} 个可用的镜像源"
    echo ""
    echo "选项："
    echo "  1) 使用可用的镜像源（推荐）"
    echo "  2) 使用 Docker Hub 官方源"
    echo "  3) 手动配置"
    echo "  4) 取消"
    echo ""
    read -p "请选择 (1-4): " choice
    
    case $choice in
        1)
            NEW_REGISTRIES=("${WORKING_REGISTRIES[@]}")
            ;;
        2)
            NEW_REGISTRIES=()
            ;;
        3)
            echo ""
            print_info "请手动编辑 Docker Desktop 设置："
            echo "  1. 打开 Docker Desktop"
            echo "  2. 点击设置图标（齿轮）"
            echo "  3. 选择 'Docker Engine'"
            echo "  4. 编辑 'registry-mirrors' 配置"
            echo "  5. 点击 'Apply & Restart'"
            exit 0
            ;;
        4)
            print_info "已取消"
            exit 0
            ;;
        *)
            print_error "无效选项"
            exit 1
            ;;
    esac
fi

# 在 macOS 上，需要通过 Docker Desktop GUI 修改
if [ "$OS" = "macos" ]; then
    print_header "macOS 配置说明"
    print_warning "在 macOS 上，需要通过 Docker Desktop 图形界面修改配置"
    echo ""
    print_info "请按以下步骤操作："
    echo "  1. 打开 Docker Desktop"
    echo "  2. 点击右上角的设置图标（齿轮 ⚙️）"
    echo "  3. 在左侧菜单选择 'Docker Engine'"
    echo "  4. 找到 'registry-mirrors' 配置项"
    echo "  5. 将配置修改为："
    echo ""
    echo -e "${CYAN}{${NC}"
    if [ ${#NEW_REGISTRIES[@]} -eq 0 ]; then
        echo -e "${CYAN}  \"registry-mirrors\": []${NC}"
    else
        echo -e "${CYAN}  \"registry-mirrors\": [${NC}"
        for i in "${!NEW_REGISTRIES[@]}"; do
            if [ $i -eq $((${#NEW_REGISTRIES[@]} - 1)) ]; then
                echo -e "${CYAN}    \"${NEW_REGISTRIES[$i]}\"${NC}"
            else
                echo -e "${CYAN}    \"${NEW_REGISTRIES[$i]}\",${NC}"
            fi
        done
        echo -e "${CYAN}  ]${NC}"
    fi
    echo -e "${CYAN}}${NC}"
    echo ""
    echo "  6. 点击 'Apply & Restart' 按钮"
    echo "  7. 等待 Docker 重启完成"
    echo ""
    read -p "配置完成后按 Enter 继续..."
    
    # 验证配置
    print_info "验证新配置..."
    sleep 2
    docker info 2>/dev/null | grep -A 10 "Registry Mirrors" || print_warning "无法获取镜像源信息"
    
elif [ "$OS" = "linux" ]; then
    # Linux 上可以直接修改配置文件
    print_header "更新配置文件"
    
    if [ ! -f "$DAEMON_JSON_PATH" ]; then
        print_info "创建新的配置文件: $DAEMON_JSON_PATH"
        sudo mkdir -p "$(dirname "$DAEMON_JSON_PATH")"
    else
        print_info "备份现有配置: ${DAEMON_JSON_PATH}.bak"
        sudo cp "$DAEMON_JSON_PATH" "${DAEMON_JSON_PATH}.bak"
    fi
    
    # 创建新的配置
    if [ ${#NEW_REGISTRIES[@]} -eq 0 ]; then
        NEW_CONFIG='{"registry-mirrors": []}'
    else
        REGISTRY_LIST=""
        for i in "${!NEW_REGISTRIES[@]}"; do
            if [ $i -gt 0 ]; then
                REGISTRY_LIST="${REGISTRY_LIST},"
            fi
            REGISTRY_LIST="${REGISTRY_LIST}\"${NEW_REGISTRIES[$i]}\""
        done
        NEW_CONFIG="{\"registry-mirrors\": [${REGISTRY_LIST}]}"
    fi
    
    echo "$NEW_CONFIG" | sudo tee "$DAEMON_JSON_PATH" > /dev/null
    print_success "配置文件已更新"
    
    # 重启 Docker
    print_info "重启 Docker 服务..."
    if command -v systemctl &> /dev/null; then
        sudo systemctl restart docker
        print_success "Docker 服务已重启"
    else
        print_warning "请手动重启 Docker 服务"
    fi
fi

print_header "修复完成"
print_success "Docker 镜像源配置已更新"
echo ""
print_info "现在可以重新运行安装脚本："
echo "  ./install.sh"
echo ""
print_info "或者直接构建："
echo "  docker compose build --no-cache"
echo "  docker compose up -d"
echo ""

