#!/bin/bash
# 迁移 TTS 服务到正确的网络

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_header() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
}

print_header "TTS 服务网络迁移"

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    print_error "Docker 未运行，请先启动 Docker"
    exit 1
fi

TTS_CONTAINER="readknows-tts-service"
OLD_NETWORK="sh_readknows-network"
NEW_NETWORK="readknows-network"

# 检查容器是否存在
if ! docker ps -a --format "{{.Names}}" | grep -q "^${TTS_CONTAINER}$"; then
    print_warning "容器 ${TTS_CONTAINER} 不存在"
    exit 0
fi

print_info "找到容器: ${TTS_CONTAINER}"

# 检查容器是否正在运行
if docker ps --format "{{.Names}}" | grep -q "^${TTS_CONTAINER}$"; then
    print_info "容器正在运行"
    IS_RUNNING=true
else
    print_info "容器已停止"
    IS_RUNNING=false
fi

# 检查新网络是否存在
if ! docker network ls --format "{{.Name}}" | grep -q "^${NEW_NETWORK}$"; then
    print_error "目标网络 ${NEW_NETWORK} 不存在"
    print_info "请先启动主服务创建网络"
    exit 1
fi

print_info "目标网络 ${NEW_NETWORK} 存在"

# 检查容器是否已经在新网络上
if docker network inspect "${NEW_NETWORK}" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -q "${TTS_CONTAINER}"; then
    print_success "容器已经在 ${NEW_NETWORK} 网络上"
    ALREADY_ON_NEW=true
else
    print_info "容器不在 ${NEW_NETWORK} 网络上"
    ALREADY_ON_NEW=false
fi

# 如果已经在正确网络上，检查是否还在旧网络上
if [ "$ALREADY_ON_NEW" = true ]; then
    if docker network inspect "${OLD_NETWORK}" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -q "${TTS_CONTAINER}"; then
        print_warning "容器同时在两个网络上，需要从旧网络断开"
        echo ""
        read -p "是否从 ${OLD_NETWORK} 断开连接? (Y/n，默认: Y): " disconnect_choice
        disconnect_choice=${disconnect_choice:-y}
        
        if [ "$disconnect_choice" = "y" ] || [ "$disconnect_choice" = "Y" ]; then
            if docker network disconnect "${OLD_NETWORK}" "${TTS_CONTAINER}" 2>/dev/null; then
                print_success "已从 ${OLD_NETWORK} 断开连接"
            else
                print_error "断开连接失败"
            fi
        fi
    else
        print_success "容器已经在正确的网络上，无需迁移"
    fi
    exit 0
fi

# 迁移容器到新网络
echo ""
print_info "开始迁移容器 ${TTS_CONTAINER} 到 ${NEW_NETWORK}..."

# 连接到新网络
print_info "连接到新网络 ${NEW_NETWORK}..."
if docker network connect "${NEW_NETWORK}" "${TTS_CONTAINER}" 2>/dev/null; then
    print_success "已连接到 ${NEW_NETWORK}"
else
    print_error "连接失败"
    exit 1
fi

# 从旧网络断开
print_info "从旧网络 ${OLD_NETWORK} 断开连接..."
if docker network disconnect "${OLD_NETWORK}" "${TTS_CONTAINER}" 2>/dev/null; then
    print_success "已从 ${OLD_NETWORK} 断开连接"
else
    print_warning "断开连接失败（可能已经断开）"
fi

# 如果容器正在运行，重启以确保网络配置生效
if [ "$IS_RUNNING" = true ]; then
    echo ""
    read -p "是否重启容器以确保网络配置生效? (Y/n，默认: Y): " restart_choice
    restart_choice=${restart_choice:-y}
    
    if [ "$restart_choice" = "y" ] || [ "$restart_choice" = "Y" ]; then
        print_info "重启容器..."
        if docker restart "${TTS_CONTAINER}" > /dev/null 2>&1; then
            print_success "容器已重启"
        else
            print_error "重启失败"
        fi
    fi
fi

echo ""
print_success "迁移完成！"
print_info "验证网络配置："
docker network inspect "${NEW_NETWORK}" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -q "${TTS_CONTAINER}" && print_success "容器在 ${NEW_NETWORK} 上" || print_error "容器不在 ${NEW_NETWORK} 上"

echo ""
print_info "当前网络状态："
docker network ls | grep -E "(readknows|tts)"

