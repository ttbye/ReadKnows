#!/bin/bash

# ReadKnows SSL 证书一键配置脚本
# 支持 Let's Encrypt、自定义证书和自签名证书

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
SSL_DIR="$PROJECT_ROOT/ssl"
COMPOSE_DIR="$SCRIPT_DIR"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# 检查 Docker Compose 是否可用
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    print_error "未找到 docker-compose"
    exit 1
fi

# 检测使用的 docker-compose 文件
detect_compose_file() {
    local os_type=""
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f "$COMPOSE_DIR/docker-compose-Linux.yml" ]; then
            os_type="Linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        if [ -f "$COMPOSE_DIR/docker-compose-MACOS.yml" ]; then
            os_type="MACOS"
        fi
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        if [ -f "$COMPOSE_DIR/docker-compose-WINDOWS.yml" ]; then
            os_type="WINDOWS"
        fi
    fi
    
    if [ -n "$os_type" ] && [ -f "$COMPOSE_DIR/docker-compose-${os_type}.yml" ]; then
        echo "docker-compose-${os_type}.yml"
    elif [ -f "$COMPOSE_DIR/docker-compose.yml" ]; then
        echo "docker-compose.yml"
    else
        print_error "未找到 docker-compose 配置文件"
        exit 1
    fi
}

# 配置 SSL（更新 docker-compose 和 nginx 配置）
configure_ssl() {
    local domain=$1
    local cert_file=${2:-"fullchain.pem"}
    local key_file=${3:-"privkey.pem"}
    
    print_title "配置 Docker Compose 和 Nginx"
    
    # 备份原配置
    if [ ! -f "$FRONTEND_DIR/nginx.conf.backup" ]; then
        print_info "备份原始 nginx 配置..."
        cp "$FRONTEND_DIR/nginx.conf" "$FRONTEND_DIR/nginx.conf.backup"
    fi
    
    # 复制 SSL 配置
    print_info "应用 SSL 配置..."
    cp "$FRONTEND_DIR/nginx-ssl.conf" "$FRONTEND_DIR/nginx.conf"
    
    # 更新 server_name
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS 使用 sed -i ''
        sed -i '' "s/server_name _;/server_name $domain;/g" "$FRONTEND_DIR/nginx.conf"
    else
        # Linux 使用 sed -i
        sed -i "s/server_name _;/server_name $domain;/g" "$FRONTEND_DIR/nginx.conf"
    fi
    
    # 如果使用自定义证书文件名，更新 nginx 配置
    if [ "$cert_file" != "fullchain.pem" ] || [ "$key_file" != "privkey.pem" ]; then
        print_info "更新证书文件路径..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|ssl_certificate /etc/nginx/ssl/fullchain.pem;|ssl_certificate /etc/nginx/ssl/$cert_file;|g" "$FRONTEND_DIR/nginx.conf"
            sed -i '' "s|ssl_certificate_key /etc/nginx/ssl/privkey.pem;|ssl_certificate_key /etc/nginx/ssl/$key_file;|g" "$FRONTEND_DIR/nginx.conf"
        else
            sed -i "s|ssl_certificate /etc/nginx/ssl/fullchain.pem;|ssl_certificate /etc/nginx/ssl/$cert_file;|g" "$FRONTEND_DIR/nginx.conf"
            sed -i "s|ssl_certificate_key /etc/nginx/ssl/privkey.pem;|ssl_certificate_key /etc/nginx/ssl/$key_file;|g" "$FRONTEND_DIR/nginx.conf"
        fi
    fi
    
    print_success "Nginx 配置已更新"
    
    # 更新 docker-compose.yml
    print_info "更新 Docker Compose 配置..."
    
    # 检查是否已经配置了 SSL 端口和卷
    if ! grep -q "443:443" "$COMPOSE_FILE_PATH"; then
        # 备份 docker-compose 文件
        if [ ! -f "${COMPOSE_FILE_PATH}.backup" ]; then
            cp "$COMPOSE_FILE_PATH" "${COMPOSE_FILE_PATH}.backup"
        fi
        
        # 取消注释 SSL 相关配置
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' 's/# - "80:80"/- "80:80"/g' "$COMPOSE_FILE_PATH"
            sed -i '' 's/# - "443:443"/- "443:443"/g' "$COMPOSE_FILE_PATH"
            sed -i '' 's|# - ../ssl:/etc/nginx/ssl:ro|- ../ssl:/etc/nginx/ssl:ro|g' "$COMPOSE_FILE_PATH"
        else
            # Linux
            sed -i 's/# - "80:80"/- "80:80"/g' "$COMPOSE_FILE_PATH"
            sed -i 's/# - "443:443"/- "443:443"/g' "$COMPOSE_FILE_PATH"
            sed -i 's|# - ../ssl:/etc/nginx/ssl:ro|- ../ssl:/etc/nginx/ssl:ro|g' "$COMPOSE_FILE_PATH"
        fi
        
        print_success "Docker Compose 配置已更新"
    else
        print_info "Docker Compose 已包含 SSL 配置"
    fi
    
    # 提示用户
    echo ""
    print_success "SSL 配置完成！"
    echo ""
    print_info "下一步操作："
    echo "  1. 重新构建并启动前端服务："
    echo "     cd $COMPOSE_DIR"
    echo "     $COMPOSE_CMD -f $COMPOSE_FILE up -d --build frontend"
    echo ""
    echo "  2. 访问您的网站："
    echo "     https://$domain"
    echo ""
    
    if [ "$ssl_choice" = "1" ]; then
        print_info "3. 设置自动续期（已创建续期脚本）："
        echo "     编辑 crontab: crontab -e"
        echo "     添加: 0 3 1 * * $COMPOSE_DIR/renew-ssl.sh"
        echo ""
    fi
    
    read -p "是否现在重新构建并启动前端服务? (Y/n，默认: Y): " rebuild
    rebuild=${rebuild:-Y}
    
    if [ "$rebuild" = "Y" ] || [ "$rebuild" = "y" ]; then
        print_info "重新构建并启动前端服务..."
        cd "$COMPOSE_DIR"
        $COMPOSE_CMD -f "$COMPOSE_FILE" up -d --build frontend
        
        sleep 3
        
        # 检查服务状态
        if $COMPOSE_CMD -f "$COMPOSE_FILE" ps frontend | grep -q "Up"; then
            print_success "前端服务已启动"
            print_info "请访问: https://$domain"
        else
            print_warning "前端服务可能未正常启动，请检查日志："
            echo "  $COMPOSE_CMD -f $COMPOSE_FILE logs frontend"
        fi
    fi
}

# Let's Encrypt 证书配置
setup_letsencrypt() {
    print_title "配置 Let's Encrypt 证书"
    
    # 检查 certbot 是否安装
    if ! command -v certbot &> /dev/null; then
        print_error "未找到 certbot，请先安装："
        echo "  Ubuntu/Debian: sudo apt-get install certbot"
        echo "  CentOS/RHEL: sudo yum install certbot"
        echo "  或使用 snap: sudo snap install --classic certbot"
        exit 1
    fi
    
    # 获取域名
    read -p "请输入您的域名（例如：example.com）: " domain
    if [ -z "$domain" ]; then
        print_error "域名不能为空"
        exit 1
    fi
    
    # 获取邮箱
    read -p "请输入您的邮箱（用于证书到期提醒）: " email
    if [ -z "$email" ]; then
        print_error "邮箱不能为空"
        exit 1
    fi
    
    # 询问是否包含 www 子域名
    read -p "是否包含 www.${domain}? (Y/n，默认: Y): " include_www
    include_www=${include_www:-Y}
    
    # 创建 SSL 目录
    mkdir -p "$SSL_DIR"
    
    print_info "开始获取 Let's Encrypt 证书..."
    
    # 构建 certbot 命令
    CERTBOT_CMD="sudo certbot certonly --standalone"
    
    if [ "$include_www" = "Y" ] || [ "$include_www" = "y" ]; then
        CERTBOT_CMD="$CERTBOT_CMD -d $domain -d www.$domain"
    else
        CERTBOT_CMD="$CERTBOT_CMD -d $domain"
    fi
    
    CERTBOT_CMD="$CERTBOT_CMD --email $email --agree-tos --non-interactive"
    
    # 检查 80 端口是否被占用
    if lsof -Pi :80 -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -an | grep -q ":80.*LISTEN" 2>/dev/null; then
        print_warning "检测到 80 端口被占用，需要先停止前端服务"
        read -p "是否现在停止前端服务以获取证书? (Y/n，默认: Y): " stop_service
        stop_service=${stop_service:-Y}
        
        if [ "$stop_service" = "Y" ] || [ "$stop_service" = "y" ]; then
            print_info "停止前端服务..."
            cd "$COMPOSE_DIR"
            $COMPOSE_CMD -f "$COMPOSE_FILE" stop frontend || true
            sleep 2
        else
            print_error "无法继续，请手动停止占用 80 端口的服务后重试"
            exit 1
        fi
    fi
    
    # 获取证书
    print_info "正在获取证书（这可能需要几分钟）..."
    if eval "$CERTBOT_CMD"; then
        print_success "证书获取成功"
    else
        print_error "证书获取失败"
        # 如果停止了服务，尝试重启
        if [ "$stop_service" = "Y" ] || [ "$stop_service" = "y" ]; then
            print_info "重启前端服务..."
            cd "$COMPOSE_DIR"
            $COMPOSE_CMD -f "$COMPOSE_FILE" start frontend || true
        fi
        exit 1
    fi
    
    # 复制证书到项目目录
    print_info "复制证书文件..."
    sudo cp /etc/letsencrypt/live/$domain/fullchain.pem "$SSL_DIR/" 2>/dev/null || {
        print_error "无法复制证书文件，请检查权限"
        exit 1
    }
    sudo cp /etc/letsencrypt/live/$domain/privkey.pem "$SSL_DIR/" 2>/dev/null || {
        print_error "无法复制私钥文件，请检查权限"
        exit 1
    }
    
    # 如果有 chain.pem，也复制
    if [ -f "/etc/letsencrypt/live/$domain/chain.pem" ]; then
        sudo cp /etc/letsencrypt/live/$domain/chain.pem "$SSL_DIR/" 2>/dev/null || true
    fi
    
    # 设置权限
    sudo chmod 644 "$SSL_DIR/fullchain.pem" 2>/dev/null || true
    sudo chmod 600 "$SSL_DIR/privkey.pem" 2>/dev/null || true
    if [ -f "$SSL_DIR/chain.pem" ]; then
        sudo chmod 644 "$SSL_DIR/chain.pem" 2>/dev/null || true
    fi
    
    # 修改文件所有者（如果可能）
    if [ -n "$SUDO_USER" ]; then
        sudo chown "$SUDO_USER:$SUDO_USER" "$SSL_DIR"/*.pem 2>/dev/null || true
    fi
    
    print_success "证书文件已复制到 $SSL_DIR"
    
    # 配置 docker-compose 和 nginx
    configure_ssl "$domain"
    
    # 如果停止了服务，现在重启
    if [ "$stop_service" = "Y" ] || [ "$stop_service" = "y" ]; then
        print_info "重启前端服务..."
        cd "$COMPOSE_DIR"
        $COMPOSE_CMD -f "$COMPOSE_FILE" up -d frontend
    fi
}

# 自定义证书配置
setup_custom_cert() {
    print_title "配置自定义证书"
    
    # 创建 SSL 目录
    mkdir -p "$SSL_DIR"
    
    print_info "请将您的证书文件放在以下位置："
    echo "  证书文件: $SSL_DIR/cert.pem (或 fullchain.pem)"
    echo "  私钥文件: $SSL_DIR/key.pem (或 privkey.pem)"
    echo "  中间证书: $SSL_DIR/chain.pem (可选)"
    echo ""
    
    read -p "证书文件已准备好? (Y/n，默认: Y): " cert_ready
    cert_ready=${cert_ready:-Y}
    
    if [ "$cert_ready" != "Y" ] && [ "$cert_ready" != "y" ]; then
        print_info "请准备好证书文件后重新运行此脚本"
        exit 0
    fi
    
    # 检查证书文件
    CERT_FILE=""
    KEY_FILE=""
    
    if [ -f "$SSL_DIR/fullchain.pem" ]; then
        CERT_FILE="fullchain.pem"
    elif [ -f "$SSL_DIR/cert.pem" ]; then
        CERT_FILE="cert.pem"
    else
        print_error "未找到证书文件，请确保文件存在于 $SSL_DIR/"
        exit 1
    fi
    
    if [ -f "$SSL_DIR/privkey.pem" ]; then
        KEY_FILE="privkey.pem"
    elif [ -f "$SSL_DIR/key.pem" ]; then
        KEY_FILE="key.pem"
    else
        print_error "未找到私钥文件，请确保文件存在于 $SSL_DIR/"
        exit 1
    fi
    
    print_success "找到证书文件: $CERT_FILE"
    print_success "找到私钥文件: $KEY_FILE"
    
    # 获取域名
    read -p "请输入您的域名（例如：example.com）: " domain
    if [ -z "$domain" ]; then
        print_error "域名不能为空"
        exit 1
    fi
    
    # 如果使用的是 cert.pem 和 key.pem，需要更新 nginx-ssl.conf
    if [ "$CERT_FILE" = "cert.pem" ] || [ "$KEY_FILE" = "key.pem" ]; then
        print_info "检测到使用 cert.pem/key.pem，将更新 nginx 配置"
    fi
    
    configure_ssl "$domain" "$CERT_FILE" "$KEY_FILE"
}

# 自签名证书配置
setup_self_signed() {
    print_title "生成自签名证书"
    
    print_warning "自签名证书仅用于测试，浏览器会显示安全警告，不适合生产环境！"
    read -p "确认继续? (y/N，默认: N): " confirm
    confirm=${confirm:-N}
    
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "已取消"
        exit 0
    fi
    
    # 创建 SSL 目录
    mkdir -p "$SSL_DIR"
    
    # 获取域名或IP
    read -p "请输入域名或IP地址（例如：example.com 或 192.168.1.100）: " domain
    if [ -z "$domain" ]; then
        print_error "域名或IP不能为空"
        exit 1
    fi
    
    print_info "生成自签名证书..."
    
    # 生成私钥
    openssl genrsa -out "$SSL_DIR/privkey.pem" 2048
    
    # 生成证书签名请求
    openssl req -new -key "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/cert.csr" \
        -subj "/C=CN/ST=State/L=City/O=ReadKnows/CN=$domain"
    
    # 生成自签名证书（有效期 365 天）
    openssl x509 -req -days 365 -in "$SSL_DIR/cert.csr" \
        -signkey "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/fullchain.pem"
    
    # 清理临时文件
    rm -f "$SSL_DIR/cert.csr"
    
    # 设置权限
    chmod 644 "$SSL_DIR/fullchain.pem"
    chmod 600 "$SSL_DIR/privkey.pem"
    
    print_success "自签名证书已生成"
    
    configure_ssl "$domain"
}

COMPOSE_FILE=$(detect_compose_file)
COMPOSE_FILE_PATH="$COMPOSE_DIR/$COMPOSE_FILE"

# 主程序
main() {
    print_title "ReadKnows SSL 证书配置工具"
    
    echo ""
    print_info "检测到的 Docker Compose 文件: $COMPOSE_FILE"
    echo ""
    
    # 选择 SSL 证书类型
    echo "请选择 SSL 证书类型："
    echo "  1) Let's Encrypt 自动证书（推荐，免费，自动续期）"
    echo "  2) 使用已有证书文件（自定义证书）"
    echo "  3) 生成自签名证书（仅用于测试）"
    echo "  4) 退出"
    echo ""
    read -p "请输入选项 [1-4]: " ssl_choice
    
    case $ssl_choice in
        1)
            # 检查是否以 root 权限运行
            if [ "$EUID" -ne 0 ]; then
                print_error "使用 Let's Encrypt 需要 root 权限，请使用 sudo 运行"
                exit 1
            fi
            print_info "使用 Let's Encrypt 证书"
            setup_letsencrypt
            ;;
        2)
            print_info "使用自定义证书"
            setup_custom_cert
            ;;
        3)
            print_info "生成自签名证书"
            setup_self_signed
            ;;
        4)
            print_info "退出"
            exit 0
            ;;
        *)
            print_error "无效选项"
            exit 1
            ;;
    esac
}

# 运行主函数
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main
fi

