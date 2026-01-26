#!/bin/bash

# ReadKnows SSL 证书自动续期脚本
# 用于自动续期 Let's Encrypt 证书并重启前端容器

set -e

# 颜色定义
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

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SSL_DIR="$PROJECT_ROOT/ssl"
COMPOSE_DIR="$SCRIPT_DIR"

# 检查是否以 root 权限运行
if [ "$EUID" -ne 0 ]; then
    print_error "请使用 sudo 运行此脚本"
    exit 1
fi

# 检查 certbot 是否安装
if ! command -v certbot &> /dev/null; then
    print_error "未找到 certbot，请先安装："
    echo "  Ubuntu/Debian: sudo apt-get install certbot"
    echo "  CentOS/RHEL: sudo yum install certbot"
    exit 1
fi

print_info "开始续期 SSL 证书..."

# 续期证书（只续期即将过期的证书）
if certbot renew --quiet; then
    print_success "证书续期检查完成"
else
    print_warning "证书续期检查失败或无需续期"
fi

# 查找所有 Let's Encrypt 证书目录
CERT_DIRS=$(find /etc/letsencrypt/live -mindepth 1 -maxdepth 1 -type d 2>/dev/null || true)

if [ -z "$CERT_DIRS" ]; then
    print_warning "未找到 Let's Encrypt 证书目录"
    print_info "如果您使用的是自定义证书，请手动更新证书文件"
    exit 0
fi

# 创建 SSL 目录
mkdir -p "$SSL_DIR"

# 复制所有证书到项目目录
COPIED=0
for cert_dir in $CERT_DIRS; do
    DOMAIN=$(basename "$cert_dir")
    
    if [ -f "$cert_dir/fullchain.pem" ] && [ -f "$cert_dir/privkey.pem" ]; then
        print_info "复制证书: $DOMAIN"
        
        # 复制证书文件
        cp "$cert_dir/fullchain.pem" "$SSL_DIR/fullchain.pem"
        cp "$cert_dir/privkey.pem" "$SSL_DIR/privkey.pem"
        
        # 如果有 chain.pem，也复制（用于 OCSP Stapling）
        if [ -f "$cert_dir/chain.pem" ]; then
            cp "$cert_dir/chain.pem" "$SSL_DIR/chain.pem"
        fi
        
        # 设置权限
        chmod 644 "$SSL_DIR/fullchain.pem" 2>/dev/null || true
        chmod 600 "$SSL_DIR/privkey.pem" 2>/dev/null || true
        if [ -f "$SSL_DIR/chain.pem" ]; then
            chmod 644 "$SSL_DIR/chain.pem" 2>/dev/null || true
        fi
        
        COPIED=1
        print_success "证书已复制: $DOMAIN"
    fi
done

if [ $COPIED -eq 0 ]; then
    print_warning "未找到有效的证书文件"
    exit 0
fi

# 检查 Docker Compose 是否可用
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    print_error "未找到 docker-compose"
    exit 1
fi

# 重启前端容器以加载新证书
print_info "重启前端容器以加载新证书..."
cd "$COMPOSE_DIR"

if $COMPOSE_CMD restart frontend; then
    print_success "前端容器已重启"
else
    print_warning "前端容器重启失败，请手动重启："
    echo "  cd $COMPOSE_DIR"
    echo "  $COMPOSE_CMD restart frontend"
fi

print_success "SSL 证书续期完成！"

