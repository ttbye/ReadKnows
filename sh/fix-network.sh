#!/bin/bash

# 修复 Docker 网络配置脚本
# 用于解决 readknows-network 和 sh_readknows-network 的网络名称不一致问题

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_header "Docker 网络修复工具"

# 检查网络状态
print_info "检查现有网络..."

READKNOWS_NETWORK_EXISTS=false
SH_READKNOWS_NETWORK_EXISTS=false

if docker network ls | grep -q " readknows-network$"; then
    READKNOWS_NETWORK_EXISTS=true
    print_success "找到网络: readknows-network"
fi

if docker network ls | grep -q " sh_readknows-network$"; then
    SH_READKNOWS_NETWORK_EXISTS=true
    print_warning "找到网络: sh_readknows-network"
fi

if [ "$READKNOWS_NETWORK_EXISTS" = false ] && [ "$SH_READKNOWS_NETWORK_EXISTS" = false ]; then
    print_info "未找到任何 readknows 网络，将在启动服务时自动创建"
    exit 0
fi

# 检查是否有容器在使用 sh_readknows-network
if [ "$SH_READKNOWS_NETWORK_EXISTS" = true ]; then
    print_info "检查 sh_readknows-network 网络的使用情况..."
    CONTAINERS=$(docker network inspect sh_readknows-network --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null || echo "")
    
    if [ -n "$CONTAINERS" ]; then
        print_warning "以下容器正在使用 sh_readknows-network 网络:"
        echo "$CONTAINERS" | tr ' ' '\n' | grep -v '^$' | while read -r container; do
            echo "  - $container"
        done
        echo ""
        print_info "需要将这些容器迁移到 readknows-network 网络"
        echo ""
        read -p "是否继续迁移? (Y/n，默认: Y): " migrate_choice
        migrate_choice=${migrate_choice:-y}
        
        if [ "$migrate_choice" != "y" ] && [ "$migrate_choice" != "Y" ]; then
            print_info "已取消迁移"
            exit 0
        fi
        
        # 迁移容器
        print_info "开始迁移容器..."
        echo "$CONTAINERS" | tr ' ' '\n' | grep -v '^$' | while read -r container; do
            if [ -n "$container" ]; then
                print_info "迁移容器: $container"
                # 连接到新网络
                if docker network connect readknows-network "$container" 2>/dev/null; then
                    print_success "容器 $container 已连接到 readknows-network"
                else
                    print_warning "容器 $container 可能已经连接到 readknows-network"
                fi
                # 从旧网络断开
                if docker network disconnect sh_readknows-network "$container" 2>/dev/null; then
                    print_success "容器 $container 已从 sh_readknows-network 断开"
                fi
            fi
        done
    fi
    
    # 删除旧网络
    echo ""
    print_info "删除旧网络 sh_readknows-network..."
    if docker network rm sh_readknows-network 2>/dev/null; then
        print_success "旧网络 sh_readknows-network 已删除"
    else
        print_warning "无法删除旧网络 sh_readknows-network，可能仍有容器在使用"
        print_info "请手动检查: docker network inspect sh_readknows-network"
    fi
    
    # 检查并清理其他旧网络
    print_info "检查其他旧网络..."
    for old_network in "sh_tts-lite-network"; do
        if docker network ls | grep -q " ${old_network}$"; then
            CONTAINERS=$(docker network inspect "${old_network}" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null || echo "")
            if [ -z "$CONTAINERS" ] || [ "$CONTAINERS" = "" ]; then
                print_info "删除未使用的旧网络: ${old_network}"
                if docker network rm "${old_network}" 2>/dev/null; then
                    print_success "旧网络 ${old_network} 已删除"
                else
                    print_warning "无法删除旧网络 ${old_network}"
                fi
            else
                print_warning "网络 ${old_network} 正在被使用，跳过删除"
            fi
        fi
    done
fi

# 确保 readknows-network 存在
if [ "$READKNOWS_NETWORK_EXISTS" = false ]; then
    print_info "创建 readknows-network 网络..."
    if docker network create readknows-network 2>/dev/null; then
        print_success "网络 readknows-network 已创建"
    else
        print_error "无法创建网络"
        exit 1
    fi
fi

print_header "网络修复完成"
print_success "现在可以使用正确的网络名称: readknows-network"
print_info "可以继续安装 TTS-API-Lite 服务了"

