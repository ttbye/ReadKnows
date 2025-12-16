#!/bin/bash

# 管理员账户初始化脚本
# 用于创建或重置管理员账户

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

print_header "管理员账户初始化工具"

# 检查容器是否运行
if ! docker compose ps backend | grep -q "Up"; then
    print_error "后端容器未运行，请先启动容器："
    echo "  docker compose up -d"
    exit 1
fi

# 获取用户输入
echo ""
read -p "请输入管理员用户名 (默认: books): " username
username=${username:-books}

read -p "请输入管理员邮箱 (默认: admin@readknows.local): " email
email=${email:-admin@readknows.local}

read -sp "请输入管理员密码 (默认: books): " password
password=${password:-books}
echo ""

print_info "正在初始化管理员账户..."
echo ""

# 执行初始化（initAdmin.js 接受 username, email, password 三个参数）
if docker compose exec -T backend node scripts/initAdmin.js "$username" "$email" "$password" 2>&1; then
    print_success "管理员账户初始化成功！"
    echo ""
    echo -e "${CYAN}账户信息：${NC}"
    echo "  用户名: $username"
    echo "  邮箱: $email"
    echo "  密码: $password"
    echo ""
    print_warning "请妥善保管密码，首次登录后请及时修改！"
else
    print_error "管理员账户初始化失败"
    exit 1
fi

