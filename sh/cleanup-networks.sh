#!/bin/bash
# ReadKnows Docker 网络清理脚本

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

print_header "ReadKnows Docker 网络清理"

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    print_error "Docker 未运行，请先启动 Docker"
    exit 1
fi

print_info "检查现有网络..."

# 列出所有网络
NETWORKS=$(docker network ls --format "{{.Name}}")

# 需要保留的网络
KEEP_NETWORKS=("bridge" "host" "none" "readknows-network")

# 需要清理的网络（带 sh_ 前缀的旧网络）
CLEANUP_NETWORKS=("sh_readknows-network" "sh_tts-lite-network")

print_info "当前所有网络："
docker network ls

echo ""

# 检查每个需要清理的网络
for network in "${CLEANUP_NETWORKS[@]}"; do
    if echo "$NETWORKS" | grep -q "^${network}$"; then
        print_warning "发现旧网络: ${network}"
        
        # 检查是否有容器在使用这个网络
        CONTAINERS=$(docker network inspect "${network}" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null || echo "")
        
        if [ -z "$CONTAINERS" ] || [ "$CONTAINERS" = "" ]; then
            print_info "网络 ${network} 未被使用，可以安全删除"
            read -p "是否删除网络 ${network}? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                if docker network rm "${network}" 2>/dev/null; then
                    print_success "网络 ${network} 已删除"
                else
                    print_error "删除网络 ${network} 失败"
                fi
            else
                print_info "跳过删除网络 ${network}"
            fi
        else
            print_warning "网络 ${network} 正在被以下容器使用: ${CONTAINERS}"
            print_info "请先停止并删除这些容器，然后再运行此脚本"
        fi
        echo ""
    fi
done

# 检查是否有其他未使用的自定义网络
print_info "检查其他未使用的自定义网络..."

ALL_NETWORKS=$(docker network ls --format "{{.Name}}")
for network in $ALL_NETWORKS; do
    # 跳过系统网络和需要保留的网络
    if [[ " ${KEEP_NETWORKS[@]} " =~ " ${network} " ]]; then
        continue
    fi
    
    # 跳过已经处理过的网络
    if [[ " ${CLEANUP_NETWORKS[@]} " =~ " ${network} " ]]; then
        continue
    fi
    
    # 检查是否有容器在使用
    CONTAINERS=$(docker network inspect "${network}" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null || echo "")
    
    if [ -z "$CONTAINERS" ] || [ "$CONTAINERS" = "" ]; then
        print_warning "发现未使用的网络: ${network}"
        read -p "是否删除网络 ${network}? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if docker network rm "${network}" 2>/dev/null; then
                print_success "网络 ${network} 已删除"
            else
                print_error "删除网络 ${network} 失败"
            fi
        fi
    fi
done

echo ""
print_success "网络清理完成！"
print_info "当前剩余网络："
docker network ls
echo ""

