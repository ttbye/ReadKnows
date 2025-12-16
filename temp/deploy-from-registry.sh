#!/bin/bash

# KnowBooks 从Registry部署脚本
# 适用于镜像已上传到远程Docker Registry的情况

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

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

# 检查依赖
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "未找到 Docker，请先安装 Docker"
        exit 1
    fi
    if ! docker info &> /dev/null; then
        print_error "Docker 服务未运行"
        exit 1
    fi
    print_success "Docker 已就绪"
}

check_compose() {
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    elif docker compose version &> /dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    else
        print_error "未找到 Docker Compose"
        exit 1
    fi
    print_success "Docker Compose 已就绪"
}

# 获取镜像地址
get_image_info() {
    print_header "配置镜像信息"
    
    echo ""
    print_info "请输入镜像地址（支持以下格式）:"
    echo "  1. Docker Hub: username/knowbooks-backend:latest"
    echo "  2. 私有Registry: registry.example.com/knowbooks-backend:latest"
    echo "  3. 本地镜像: knowbooks-backend:latest（已导入到本地）"
    echo ""
    
    read -p "后端镜像地址: " BACKEND_IMAGE
    read -p "前端镜像地址: " FRONTEND_IMAGE
    
    if [ -z "$BACKEND_IMAGE" ] || [ -z "$FRONTEND_IMAGE" ]; then
        print_error "镜像地址不能为空"
        exit 1
    fi
    
    print_success "后端镜像: $BACKEND_IMAGE"
    print_success "前端镜像: $FRONTEND_IMAGE"
}

# 修改docker-compose.yml
modify_compose_file() {
    print_header "修改 docker-compose.yml"
    
    COMPOSE_FILE="docker-compose.yml"
    COMPOSE_BACKUP="docker-compose.yml.backup.$(date +%Y%m%d_%H%M%S)"
    
    # 备份
    if [ -f "$COMPOSE_FILE" ]; then
        cp "$COMPOSE_FILE" "$COMPOSE_BACKUP"
        print_success "已备份: $COMPOSE_BACKUP"
    else
        print_error "未找到 docker-compose.yml"
        exit 1
    fi
    
    # 创建新的compose文件
    print_info "修改 docker-compose.yml 使用镜像..."
    
    # 使用sed修改（更可靠的方式）
    sed -i.tmp \
        -e "/^  backend:/,/^  frontend:/ { /build:/d; /context:/d; /dockerfile:/d }" \
        -e "/^  backend:/a\    image: ${BACKEND_IMAGE}" \
        -e "/^  frontend:/a\    image: ${FRONTEND_IMAGE}" \
        "$COMPOSE_FILE"
    
    # 移除build块（如果还有）
    python3 << PYTHON_SCRIPT 2>/dev/null || true
import re

with open('$COMPOSE_FILE', 'r') as f:
    content = f.read()

# 移除后端的build配置
content = re.sub(
    r'(backend:.*?)(build:.*?dockerfile: Dockerfile\s*\n)',
    r'\1image: ${BACKEND_IMAGE}\n',
    content,
    flags=re.DOTALL
)

# 移除前端的build配置
content = re.sub(
    r'(frontend:.*?)(build:.*?dockerfile: Dockerfile\s*\n)',
    r'\1image: ${FRONTEND_IMAGE}\n',
    content,
    flags=re.DOTALL
)

with open('$COMPOSE_FILE', 'w') as f:
    f.write(content)
PYTHON_SCRIPT
    
    # 清理临时文件
    rm -f "${COMPOSE_FILE}.tmp"
    
    print_success "docker-compose.yml 已修改"
}

# 拉取镜像
pull_images() {
    print_header "拉取镜像"
    
    print_info "拉取后端镜像: $BACKEND_IMAGE"
    if docker pull "$BACKEND_IMAGE"; then
        print_success "后端镜像拉取成功"
    else
        print_error "后端镜像拉取失败"
        print_info "如果镜像在本地，请确保镜像已导入"
        exit 1
    fi
    
    print_info "拉取前端镜像: $FRONTEND_IMAGE"
    if docker pull "$FRONTEND_IMAGE"; then
        print_success "前端镜像拉取成功"
    else
        print_error "前端镜像拉取失败"
        print_info "如果镜像在本地，请确保镜像已导入"
        exit 1
    fi
}

# 创建.env文件
create_env() {
    if [ ! -f ".env" ]; then
        print_info "创建 .env 文件..."
        JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
        cat > .env << EOF
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
DOUBAN_API_BASE=
AI_PROVIDER=ollama
AI_API_URL=http://frontend:1280/ollama-proxy
AI_API_KEY=
AI_MODEL=llama2
OLLAMA_URL=http://host.docker.internal:11434
EOF
        print_success ".env 文件已创建"
    else
        print_info ".env 文件已存在"
    fi
}

# 创建数据目录
create_directories() {
    print_info "检查数据目录..."
    DIRS=(
        "/volume5/docker/bookpath/data"
        "/volume5/docker/bookpath/books"
        "/volume5/docker/bookpath/covers"
        "/volume5/docker/bookpath/fonts"
        "/volume5/docker/bookpath/import"
    )
    
    for dir in "${DIRS[@]}"; do
        if [ ! -d "$dir" ]; then
            print_warning "目录不存在: $dir"
            read -p "是否创建? (y/n): " create
            if [ "$create" = "y" ]; then
                sudo mkdir -p "$dir" && sudo chmod 755 "$dir"
                print_success "已创建: $dir"
            fi
        fi
    done
}

# 停止旧容器
stop_old() {
    if $COMPOSE_CMD ps -q | grep -q .; then
        print_info "停止现有容器..."
        $COMPOSE_CMD down
        print_success "容器已停止"
    fi
}

# 启动服务
start_services() {
    print_header "启动服务"
    
    print_info "启动容器..."
    $COMPOSE_CMD up -d
    
    if [ $? -eq 0 ]; then
        print_success "服务启动成功"
    else
        print_error "服务启动失败"
        exit 1
    fi
}

# 等待服务
wait_services() {
    print_info "等待服务启动..."
    sleep 10
    
    for i in {1..20}; do
        if docker ps | grep -q "knowbooks-backend" && docker ps | grep -q "knowbooks-frontend"; then
            print_success "服务已就绪"
            return 0
        fi
        echo -n "."
        sleep 2
    done
    echo ""
    print_warning "服务可能还在启动中"
}

# 显示状态
show_status() {
    print_header "服务状态"
    
    $COMPOSE_CMD ps
    
    echo ""
    print_info "访问地址:"
    echo "  前端: http://localhost:1280"
    echo "  后端: http://localhost:1281"
    echo ""
    print_info "查看日志: $COMPOSE_CMD logs -f"
}

# 初始化管理员
init_admin() {
    echo ""
    read -p "是否初始化管理员账户? (y/n): " init
    if [ "$init" = "y" ]; then
        if $COMPOSE_CMD exec -T backend node scripts/initAdmin.js 2>/dev/null; then
            print_success "管理员账户初始化成功"
        else
            print_warning "初始化失败，可稍后运行: $COMPOSE_CMD exec backend node scripts/initAdmin.js"
        fi
    fi
}

# 主函数
main() {
    print_header "KnowBooks 从Registry部署"
    
    check_docker
    check_compose
    get_image_info
    modify_compose_file
    pull_images
    create_env
    create_directories
    stop_old
    start_services
    wait_services
    show_status
    init_admin
    
    print_header "部署完成"
    print_success "KnowBooks 已成功部署！"
}

main

