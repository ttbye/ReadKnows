#!/bin/bash

# ============================================
# KnowBooks 一键重新部署脚本
# ============================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
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

print_step() {
    echo -e "${PURPLE}▶️  $1${NC}"
}

# 分隔线
print_separator() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# 开始部署
echo ""
print_separator
echo -e "${CYAN}🚀 开始重新部署 KnowBooks${NC}"
print_separator
echo ""

# 检查是否在正确的目录
if [ ! -f "docker-compose.yml" ]; then
    print_error "未找到 docker-compose.yml 文件"
    print_info "请在项目根目录执行此脚本"
    exit 1
fi

# 步骤1: 停止现有容器
print_step "步骤 1/7: 停止现有容器"
print_info "正在停止容器..."
docker-compose down
print_success "容器已停止"
echo ""

# 步骤2: 拉取最新代码（可选）
print_step "步骤 2/7: 更新代码（可选）"
if [ -d ".git" ]; then
    read -p "是否拉取最新代码？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "正在拉取最新代码..."
        git pull
        print_success "代码已更新"
    else
        print_warning "跳过代码更新"
    fi
else
    print_warning "非 Git 仓库，跳过代码更新"
fi
echo ""

# 步骤3: 清理旧镜像（可选）
print_step "步骤 3/7: 清理旧镜像（可选）"
read -p "是否清理旧的 Docker 镜像？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "正在清理旧镜像..."
    docker-compose down --rmi all 2>/dev/null || true
    docker system prune -f
    print_success "旧镜像已清理"
else
    print_warning "跳过镜像清理"
fi
echo ""

# 步骤4: 重新构建镜像
print_step "步骤 4/7: 重新构建镜像"
print_info "正在构建镜像（这可能需要几分钟）..."
docker-compose build --no-cache
print_success "镜像构建完成"
echo ""

# 步骤5: 启动容器
print_step "步骤 5/7: 启动容器"
print_info "正在启动容器..."
docker-compose up -d
print_success "容器已启动"
echo ""

# 步骤6: 等待服务就绪
print_step "步骤 6/7: 等待服务就绪"
print_info "等待服务启动（30秒）..."
for i in {1..30}; do
    echo -ne "${CYAN}⏳ ${i}/30 秒${NC}\r"
    sleep 1
done
echo ""
print_success "等待完成"
echo ""

# 步骤7: 检查服务状态
print_step "步骤 7/7: 检查服务状态"
echo ""
print_info "容器状态："
docker-compose ps
echo ""

# 检查后端健康状态
print_info "检查后端服务..."
if curl -s http://localhost:1281/api/health > /dev/null 2>&1; then
    print_success "后端服务正常 (http://localhost:1281)"
else
    print_warning "后端服务可能还未完全启动"
fi

# 检查前端
print_info "检查前端服务..."
if curl -s http://localhost:1280 > /dev/null 2>&1; then
    print_success "前端服务正常 (http://localhost:1280)"
else
    print_warning "前端服务可能还未完全启动"
fi

echo ""

# 显示日志提示
print_separator
print_success "部署完成！"
print_separator
echo ""

print_info "📊 查看实时日志："
echo "  docker-compose logs -f"
echo ""

print_info "📊 查看后端日志："
echo "  docker-compose logs -f backend"
echo ""

print_info "📊 查看前端日志："
echo "  docker-compose logs -f frontend"
echo ""

print_info "🔍 检查容器状态："
echo "  docker-compose ps"
echo ""

print_info "🌐 访问地址："
echo "  本地: http://localhost:1280"
echo "  远程: https://vlistttbye.i234.me:12280"
echo ""

print_info "🛑 停止服务："
echo "  docker-compose down"
echo ""

print_info "🔄 重启服务："
echo "  docker-compose restart"
echo ""

# 询问是否查看日志
read -p "是否查看实时日志？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "正在显示日志（Ctrl+C 退出）..."
    echo ""
    docker-compose logs -f
fi

print_separator
print_success "🎉 一切就绪！"
print_separator
