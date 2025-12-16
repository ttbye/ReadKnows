#!/bin/bash

# KnowBooks 远程部署脚本
# 用于从远程Docker Registry拉取镜像并部署

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 打印带颜色的消息
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

# 检查Docker是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "未找到 Docker，请先安装 Docker"
        exit 1
    fi
    print_success "Docker 已安装: $(docker --version)"
}

# 检查Docker Compose是否安装
check_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
        print_success "Docker Compose 已安装: $(docker-compose --version)"
    elif docker compose version &> /dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
        print_success "Docker Compose 已安装: $(docker compose version)"
    else
        print_error "未找到 Docker Compose，请先安装 Docker Compose"
        exit 1
    fi
}

# 检查Docker服务是否运行
check_docker_service() {
    if ! docker info &> /dev/null; then
        print_error "Docker 服务未运行，请启动 Docker 服务"
        exit 1
    fi
    print_success "Docker 服务正在运行"
}

# 获取项目根目录
get_project_root() {
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    echo "$SCRIPT_DIR"
}

# 检查必要的文件
check_files() {
    PROJECT_ROOT=$(get_project_root)
    
    if [ ! -f "$PROJECT_ROOT/docker-compose.yml" ]; then
        print_error "未找到 docker-compose.yml 文件"
        exit 1
    fi
    print_success "找到 docker-compose.yml"
}

# 创建.env文件
create_env_file() {
    PROJECT_ROOT=$(get_project_root)
    ENV_FILE="$PROJECT_ROOT/.env"
    
    if [ -f "$ENV_FILE" ]; then
        print_info ".env 文件已存在，跳过创建"
        return
    fi
    
    print_info "创建 .env 配置文件..."
    
    # 生成随机JWT密钥
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
    
    cat > "$ENV_FILE" << EOF
# JWT配置
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

# 豆瓣API配置（可选）
DOUBAN_API_BASE=

# AI配置（可选）
AI_PROVIDER=ollama
AI_API_URL=http://frontend:1280/ollama-proxy
AI_API_KEY=
AI_MODEL=llama2

# Ollama服务器地址（用于nginx代理）
# 如果ollama在宿主机上，使用: http://host.docker.internal:11434
# 如果ollama在局域网其他机器上，使用: http://192.168.1.100:11434
OLLAMA_URL=http://host.docker.internal:11434
EOF
    
    print_success ".env 文件已创建: $ENV_FILE"
    print_warning "请根据需要编辑 .env 文件中的配置"
}

# 创建必要的目录
create_directories() {
    PROJECT_ROOT=$(get_project_root)
    
    print_info "检查数据目录..."
    
    # 从docker-compose.yml中提取卷路径
    VOLUME_PATHS=(
        "/volume5/docker/bookpath/data"
        "/volume5/docker/bookpath/books"
        "/volume5/docker/bookpath/covers"
        "/volume5/docker/bookpath/fonts"
        "/volume5/docker/bookpath/import"
    )
    
    for path in "${VOLUME_PATHS[@]}"; do
        if [ ! -d "$path" ]; then
            print_warning "数据目录不存在: $path"
            read -p "是否创建此目录? (y/n): " create_dir
            if [ "$create_dir" = "y" ] || [ "$create_dir" = "Y" ]; then
                sudo mkdir -p "$path"
                sudo chmod 755 "$path"
                print_success "已创建目录: $path"
            else
                print_warning "跳过创建，请确保目录存在或修改 docker-compose.yml"
            fi
        else
            print_success "数据目录存在: $path"
        fi
    done
}

# 检查端口占用
check_ports() {
    print_info "检查端口占用..."
    
    check_port() {
        local port=$1
        local name=$2
        
        if command -v lsof &> /dev/null; then
            if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
                print_warning "端口 $port ($name) 已被占用"
                return 1
            else
                print_success "端口 $port ($name) 可用"
                return 0
            fi
        elif command -v netstat &> /dev/null; then
            if netstat -tuln 2>/dev/null | grep -q ":$port "; then
                print_warning "端口 $port ($name) 已被占用"
                return 1
            else
                print_success "端口 $port ($name) 可用"
                return 0
            fi
        else
            print_warning "未找到端口检查工具，跳过检查"
            return 0
        fi
    }
    
    check_port 1280 "前端"
    check_port 1281 "后端"
}

# 配置镜像源（从Registry拉取）
configure_image_pull() {
    print_header "配置镜像拉取"
    
    echo ""
    print_info "请选择镜像来源:"
    echo "  1) 从Docker Hub拉取（需要镜像已推送到Docker Hub）"
    echo "  2) 从私有Registry拉取（需要配置Registry地址）"
    echo "  3) 使用本地已有镜像（镜像已通过其他方式导入）"
    echo "  4) 取消"
    echo ""
    read -p "请输入选项 (1-4): " image_source
    
    case $image_source in
        1)
            read -p "请输入Docker Hub用户名/组织名: " dockerhub_user
            BACKEND_IMAGE="${dockerhub_user}/knowbooks-backend:latest"
            FRONTEND_IMAGE="${dockerhub_user}/knowbooks-frontend:latest"
            PULL_IMAGES=true
            ;;
        2)
            read -p "请输入Registry地址（如: registry.example.com）: " registry_host
            read -p "请输入项目路径（如: knowbooks）: " registry_path
            BACKEND_IMAGE="${registry_host}/${registry_path}/knowbooks-backend:latest"
            FRONTEND_IMAGE="${registry_host}/${registry_path}/knowbooks-frontend:latest"
            PULL_IMAGES=true
            print_info "如果需要认证，请先运行: docker login ${registry_host}"
            ;;
        3)
            print_info "将使用本地已有镜像"
            BACKEND_IMAGE="knowbooks-backend:latest"
            FRONTEND_IMAGE="knowbooks-frontend:latest"
            PULL_IMAGES=false
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
    
    # 修改docker-compose.yml使用指定镜像
    if [ "$PULL_IMAGES" = true ]; then
        modify_docker_compose_for_pull
    fi
}

# 修改docker-compose.yml以使用拉取的镜像
modify_docker_compose_for_pull() {
    PROJECT_ROOT=$(get_project_root)
    COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
    COMPOSE_BACKUP="$PROJECT_ROOT/docker-compose.yml.backup"
    
    # 备份原文件
    if [ ! -f "$COMPOSE_BACKUP" ]; then
        cp "$COMPOSE_FILE" "$COMPOSE_BACKUP"
        print_success "已备份 docker-compose.yml"
    fi
    
    print_info "修改 docker-compose.yml 以使用拉取的镜像..."
    
    # 创建临时文件
    TEMP_FILE=$(mktemp)
    
    # 使用sed修改文件，将build改为image
    sed -e "s|build:|image: ${BACKEND_IMAGE}|" \
        -e "s|context: ./backend||" \
        -e "s|dockerfile: Dockerfile||" \
        "$COMPOSE_FILE" | \
    sed -e "/frontend:/,/networks:/ {
        s|build:|image: ${FRONTEND_IMAGE}|
        s|context: ./frontend||
        s|dockerfile: Dockerfile||
    }" > "$TEMP_FILE"
    
    # 更精确的修改方式
    python3 << EOF
import re

with open('$COMPOSE_FILE', 'r') as f:
    content = f.read()

# 替换后端build为image
backend_pattern = r'(backend:.*?)(build:.*?context: ./backend.*?dockerfile: Dockerfile)'
backend_replacement = r'\1image: ${BACKEND_IMAGE}'
content = re.sub(backend_pattern, backend_replacement, content, flags=re.DOTALL)

# 替换前端build为image
frontend_pattern = r'(frontend:.*?)(build:.*?context: ./frontend.*?dockerfile: Dockerfile)'
frontend_replacement = r'\1image: ${FRONTEND_IMAGE}'
content = re.sub(frontend_pattern, frontend_replacement, content, flags=re.DOTALL)

with open('$COMPOSE_FILE', 'w') as f:
    f.write(content)
EOF
    
    # 如果python失败，使用简单的sed方式
    if [ $? -ne 0 ]; then
        print_warning "Python修改失败，使用sed方式..."
        # 简单的sed替换
        sed -i.bak "s|build:|image: ${BACKEND_IMAGE}|g" "$COMPOSE_FILE"
        sed -i.bak "/frontend:/,/depends_on:/ s|build:|image: ${FRONTEND_IMAGE}|g" "$COMPOSE_FILE"
        # 删除context和dockerfile行
        sed -i.bak '/context: \.\/backend/d' "$COMPOSE_FILE"
        sed -i.bak '/context: \.\/frontend/d' "$COMPOSE_FILE"
        sed -i.bak '/dockerfile: Dockerfile/d' "$COMPOSE_FILE"
    fi
    
    print_success "已修改 docker-compose.yml"
    print_info "备份文件: $COMPOSE_BACKUP"
}

# 拉取镜像
pull_images() {
    if [ "$PULL_IMAGES" = false ]; then
        print_info "跳过镜像拉取（使用本地镜像）"
        return
    fi
    
    print_header "拉取镜像"
    
    print_info "正在拉取后端镜像: $BACKEND_IMAGE"
    if docker pull "$BACKEND_IMAGE"; then
        print_success "后端镜像拉取成功"
    else
        print_error "后端镜像拉取失败"
        exit 1
    fi
    
    print_info "正在拉取前端镜像: $FRONTEND_IMAGE"
    if docker pull "$FRONTEND_IMAGE"; then
        print_success "前端镜像拉取成功"
    else
        print_error "前端镜像拉取失败"
        exit 1
    fi
    
    # 重新标记镜像（如果需要）
    if [ "$BACKEND_IMAGE" != "knowbooks-backend:latest" ]; then
        print_info "重新标记后端镜像..."
        docker tag "$BACKEND_IMAGE" "knowbooks-backend:latest"
    fi
    
    if [ "$FRONTEND_IMAGE" != "knowbooks-frontend:latest" ]; then
        print_info "重新标记前端镜像..."
        docker tag "$FRONTEND_IMAGE" "knowbooks-frontend:latest"
    fi
}

# 停止现有容器
stop_existing_containers() {
    print_info "检查现有容器..."
    
    if $COMPOSE_CMD ps -q | grep -q .; then
        print_warning "发现正在运行的容器"
        echo ""
        read -p "是否停止并删除现有容器? (y/n): " remove_existing
        if [ "$remove_existing" = "y" ] || [ "$remove_existing" = "Y" ]; then
            print_info "停止并删除现有容器..."
            $COMPOSE_CMD down
            print_success "现有容器已停止并删除"
        fi
    else
        print_success "未发现正在运行的容器"
    fi
}

# 启动服务
start_services() {
    print_header "启动服务"
    
    PROJECT_ROOT=$(get_project_root)
    cd "$PROJECT_ROOT"
    
    print_info "使用 Docker Compose 启动服务..."
    
    $COMPOSE_CMD up -d
    
    if [ $? -eq 0 ]; then
        print_success "服务启动成功"
    else
        print_error "服务启动失败"
        exit 1
    fi
}

# 等待服务就绪
wait_for_services() {
    print_info "等待服务启动..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker ps | grep -q "knowbooks-backend" && docker ps | grep -q "knowbooks-frontend"; then
            print_success "服务已就绪"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    echo ""
    print_warning "服务启动超时，但可能仍在运行中"
}

# 显示服务状态
show_status() {
    print_header "服务状态"
    
    echo ""
    print_info "容器状态:"
    $COMPOSE_CMD ps
    
    echo ""
    print_info "服务地址:"
    echo "  前端: http://localhost:1280"
    echo "  后端API: http://localhost:1281"
    echo ""
    
    print_info "常用命令:"
    echo "  查看日志: $COMPOSE_CMD logs -f"
    echo "  查看后端日志: $COMPOSE_CMD logs -f backend"
    echo "  查看前端日志: $COMPOSE_CMD logs -f frontend"
    echo "  停止服务: $COMPOSE_CMD down"
    echo "  重启服务: $COMPOSE_CMD restart"
    echo "  查看状态: $COMPOSE_CMD ps"
}

# 初始化管理员账户
init_admin() {
    print_header "初始化管理员账户"
    
    echo ""
    read -p "是否现在初始化管理员账户? (y/n): " init_admin_choice
    
    if [ "$init_admin_choice" = "y" ] || [ "$init_admin_choice" = "Y" ]; then
        print_info "正在初始化管理员账户..."
        
        if $COMPOSE_CMD exec -T backend node scripts/initAdmin.js 2>/dev/null; then
            print_success "管理员账户初始化成功"
        else
            print_warning "管理员账户初始化失败，可能服务尚未完全启动"
            print_info "您可以稍后手动运行: $COMPOSE_CMD exec backend node scripts/initAdmin.js"
        fi
    else
        print_info "跳过管理员账户初始化"
        print_info "您可以稍后运行: $COMPOSE_CMD exec backend node scripts/initAdmin.js"
    fi
}

# 主函数
main() {
    print_header "KnowBooks 远程部署脚本"
    
    # 检查依赖
    check_docker
    check_docker_compose
    check_docker_service
    
    # 检查文件
    check_files
    
    # 创建.env文件
    create_env_file
    
    # 创建目录
    create_directories
    
    # 检查端口
    check_ports
    
    # 配置镜像拉取
    configure_image_pull
    
    # 拉取镜像
    pull_images
    
    # 停止现有容器
    stop_existing_containers
    
    # 启动服务
    start_services
    
    # 等待服务
    wait_for_services
    
    # 显示状态
    show_status
    
    # 初始化管理员
    init_admin
    
    print_header "部署完成"
    print_success "KnowBooks 已成功部署！"
    echo ""
    print_info "访问地址:"
    echo "  🌐 前端: http://localhost:1280"
    echo "  🔌 后端API: http://localhost:1281"
    echo ""
    print_info "下一步:"
    echo "  1. 打开浏览器访问 http://localhost:1280"
    echo "  2. 使用初始化时创建的管理员账户登录"
    echo "  3. 开始使用 KnowBooks！"
    echo ""
}

# 执行主函数
main

