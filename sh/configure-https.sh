#!/bin/bash

# ReadKnows HTTPS 快速配置脚本
# 用于配置已有的SSL证书

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

print_title() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# 检测data目录路径（从docker-compose.yml中提取）
detect_data_dir() {
    COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
    if [ -f "$COMPOSE_FILE" ]; then
        # 从docker-compose.yml中提取backend的data挂载路径
        DATA_MOUNT=$(grep -A 5 "backend:" "$COMPOSE_FILE" | grep -E "^\s+-.*:/app/data" | head -1 | sed 's/.*- \(.*\):\/app\/data.*/\1/')
        if [ -n "$DATA_MOUNT" ]; then
            echo "$DATA_MOUNT"
            return
        fi
    fi
    # 默认路径（Linux/Synology）
    echo "/volume5/docker/ReadKnows/data"
}

DATA_DIR=$(detect_data_dir)
SSL_DIR="$DATA_DIR/ssl"

print_title "ReadKnows HTTPS 配置向导"

# 检查 Docker Compose 是否可用
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    print_error "未找到 docker-compose"
    exit 1
fi

# 1. 获取域名
echo ""
read -p "请输入您的域名（例如：example.com）: " domain
if [ -z "$domain" ]; then
    print_error "域名不能为空"
    exit 1
fi

# 2. 检查证书文件
echo ""
print_info "检测到的data目录: $DATA_DIR"
print_info "请将您的SSL证书文件放入以下目录："
echo "  $SSL_DIR"
print_info "（如果data目录路径不正确，请手动修改 docker-compose.yml 中的卷挂载路径）"
echo ""
print_info "支持的证书文件命名："
echo "  - 证书文件: fullchain.pem 或 cert.pem"
echo "  - 私钥文件: privkey.pem 或 key.pem"
echo ""

# 检查证书文件是否存在
CERT_FILE=""
KEY_FILE=""

if [ -f "$SSL_DIR/fullchain.pem" ]; then
    CERT_FILE="fullchain.pem"
elif [ -f "$SSL_DIR/cert.pem" ]; then
    CERT_FILE="cert.pem"
elif [ -f "$SSL_DIR/certificate.pem" ]; then
    CERT_FILE="certificate.pem"
elif [ -f "$SSL_DIR/cert.crt" ]; then
    CERT_FILE="cert.crt"
fi

if [ -f "$SSL_DIR/privkey.pem" ]; then
    KEY_FILE="privkey.pem"
elif [ -f "$SSL_DIR/key.pem" ]; then
    KEY_FILE="key.pem"
elif [ -f "$SSL_DIR/private.key" ]; then
    KEY_FILE="private.key"
fi

# 如果找不到证书文件，询问用户
if [ -z "$CERT_FILE" ] || [ -z "$KEY_FILE" ]; then
    print_warning "未在 $SSL_DIR 目录中找到证书文件"
    echo ""
    read -p "证书文件是否在其他位置？(y/N): " cert_elsewhere
    if [ "$cert_elsewhere" = "y" ] || [ "$cert_elsewhere" = "Y" ]; then
        read -p "请输入证书文件的完整路径: " cert_path
        read -p "请输入私钥文件的完整路径: " key_path
        
        if [ ! -f "$cert_path" ] || [ ! -f "$key_path" ]; then
            print_error "证书文件不存在"
            exit 1
        fi
        
        # 复制证书文件
        print_info "复制证书文件到 $SSL_DIR ..."
        mkdir -p "$SSL_DIR"
        cp "$cert_path" "$SSL_DIR/fullchain.pem"
        cp "$key_path" "$SSL_DIR/privkey.pem"
        chmod 644 "$SSL_DIR/fullchain.pem"
        chmod 600 "$SSL_DIR/privkey.pem"
        
        CERT_FILE="fullchain.pem"
        KEY_FILE="privkey.pem"
        print_success "证书文件已复制"
    else
        print_error "请将证书文件放入 $SSL_DIR 目录后重新运行此脚本"
        exit 1
    fi
else
    print_success "找到证书文件: $CERT_FILE"
    print_success "找到私钥文件: $KEY_FILE"
fi

# 3. 备份原nginx配置
if [ ! -f "$FRONTEND_DIR/nginx.conf.backup" ]; then
    print_info "备份原始 nginx 配置..."
    cp "$FRONTEND_DIR/nginx.conf" "$FRONTEND_DIR/nginx.conf.backup"
    print_success "已备份到 nginx.conf.backup"
fi

# 4. 复制SSL配置
print_info "应用 SSL 配置..."
cp "$FRONTEND_DIR/nginx-ssl.conf" "$FRONTEND_DIR/nginx.conf"

# 5. 更新server_name
print_info "更新域名配置..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/server_name _;/server_name $domain;/g" "$FRONTEND_DIR/nginx.conf"
else
    sed -i "s/server_name _;/server_name $domain;/g" "$FRONTEND_DIR/nginx.conf"
fi

# 6. 如果证书文件名不是默认的，更新nginx配置
if [ "$CERT_FILE" != "fullchain.pem" ] || [ "$KEY_FILE" != "privkey.pem" ]; then
    print_info "更新证书文件路径..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|ssl_certificate /etc/nginx/ssl/fullchain.pem;|ssl_certificate /etc/nginx/ssl/$CERT_FILE;|g" "$FRONTEND_DIR/nginx.conf"
        sed -i '' "s|ssl_certificate_key /etc/nginx/ssl/privkey.pem;|ssl_certificate_key /etc/nginx/ssl/$KEY_FILE;|g" "$FRONTEND_DIR/nginx.conf"
    else
        sed -i "s|ssl_certificate /etc/nginx/ssl/fullchain.pem;|ssl_certificate /etc/nginx/ssl/$CERT_FILE;|g" "$FRONTEND_DIR/nginx.conf"
        sed -i "s|ssl_certificate_key /etc/nginx/ssl/privkey.pem;|ssl_certificate_key /etc/nginx/ssl/$KEY_FILE;|g" "$FRONTEND_DIR/nginx.conf"
    fi
fi

print_success "Nginx 配置已更新"

# 7. 检查docker-compose.yml是否已配置SSL
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
if ! grep -q "1243:443" "$COMPOSE_FILE"; then
    print_warning "docker-compose.yml 中未找到SSL端口配置"
    print_info "请确保 docker-compose.yml 中已启用以下配置："
    echo "  ports:"
    echo "    - \"1280:80\"      # HTTP 端口（外部1280映射到容器80）"
    echo "    - \"1243:443\"     # HTTPS 端口（外部1243映射到容器443）"
    echo "  volumes:"
    echo "    - $DATA_DIR/ssl:/etc/nginx/ssl:ro"
    echo ""
    print_info "当前检测到的data目录: $DATA_DIR"
    print_info "SSL证书应放在: $SSL_DIR"
    echo ""
    print_warning "请手动检查并更新 docker-compose.yml 中的端口和卷配置"
else
    print_success "docker-compose.yml 已包含 SSL 配置"
fi

# 8. 完成提示
echo ""
print_title "配置完成"
echo ""
print_success "HTTPS 配置已完成！"
echo ""
print_info "下一步操作："
echo "  1. 重新构建并启动前端服务："
echo "     cd $SCRIPT_DIR"
echo "     $COMPOSE_CMD up -d --build frontend"
echo ""
echo "  2. 访问您的网站："
echo "     https://$domain:1243"
echo "     或 http://$domain:1280 (会自动重定向到HTTPS)"
echo ""
echo "  3. 检查服务状态："
echo "     $COMPOSE_CMD logs frontend"
echo ""

read -p "是否现在重新构建并启动前端服务? (Y/n，默认: Y): " rebuild
rebuild=${rebuild:-Y}

if [ "$rebuild" = "Y" ] || [ "$rebuild" = "y" ]; then
    print_info "重新构建并启动前端服务..."
    cd "$SCRIPT_DIR"
    $COMPOSE_CMD up -d --build frontend
    
    sleep 3
    
    # 检查服务状态
    if $COMPOSE_CMD ps frontend | grep -q "Up"; then
        print_success "前端服务已启动"
        print_info "请访问: https://$domain"
        echo ""
        print_info "如果遇到问题，请检查日志："
        echo "  $COMPOSE_CMD logs frontend"
    else
        print_warning "前端服务可能未正常启动，请检查日志："
        echo "  $COMPOSE_CMD logs frontend"
    fi
fi
