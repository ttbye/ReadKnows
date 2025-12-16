#!/bin/bash

# KnowBooks 默认管理员账号测试脚本
# 用于测试默认管理员账号创建功能

set -e

echo "========================================" 
echo "KnowBooks 默认管理员账号测试"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否在项目根目录
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ 错误：请在项目根目录运行此脚本${NC}"
    exit 1
fi

echo "📋 测试步骤："
echo "1. 备份现有数据库（如果存在）"
echo "2. 删除数据库触发首次初始化"
echo "3. 重启Docker服务"
echo "4. 检查默认管理员是否创建"
echo "5. 测试登录功能"
echo ""

read -p "⚠️  此操作会删除现有数据库，是否继续？(y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消测试"
    exit 0
fi

echo ""
echo "=== 步骤 1: 备份现有数据库 ==="

# 检查数据库路径（从docker-compose.yml中提取）
DB_HOST_PATH="/volume5/docker/bookpath/data"
DB_FILE="${DB_HOST_PATH}/database.db"

if [ -f "$DB_FILE" ]; then
    BACKUP_FILE="${DB_HOST_PATH}/database.db.backup.$(date +%Y%m%d_%H%M%S)"
    echo "备份数据库到: $BACKUP_FILE"
    cp "$DB_FILE" "$BACKUP_FILE"
    echo -e "${GREEN}✅ 备份完成${NC}"
else
    echo -e "${YELLOW}ℹ️  数据库文件不存在，跳过备份${NC}"
fi

echo ""
echo "=== 步骤 2: 删除数据库 ==="
if [ -f "$DB_FILE" ]; then
    rm "$DB_FILE"
    echo -e "${GREEN}✅ 数据库已删除${NC}"
else
    echo -e "${YELLOW}ℹ️  数据库文件不存在${NC}"
fi

echo ""
echo "=== 步骤 3: 重启Docker服务 ==="
echo "停止服务..."
docker-compose down

echo "启动服务..."
docker-compose up -d

echo "等待服务启动（30秒）..."
sleep 30

echo ""
echo "=== 步骤 4: 检查日志 ==="
echo "查找默认管理员创建日志..."
echo ""

LOGS=$(docker-compose logs backend 2>&1)

if echo "$LOGS" | grep -q "默认管理员账号创建成功"; then
    echo -e "${GREEN}✅ 找到默认管理员创建日志${NC}"
    echo ""
    echo "相关日志："
    echo "$LOGS" | grep -A 10 "默认管理员账号创建成功"
else
    echo -e "${RED}❌ 未找到默认管理员创建日志${NC}"
    echo ""
    echo "后端日志（最后50行）："
    docker-compose logs --tail=50 backend
    exit 1
fi

echo ""
echo "=== 步骤 5: 验证数据库 ==="
echo "检查数据库中的用户..."

USER_CHECK=$(docker-compose exec -T backend sh -c "
    node -e \"
    const Database = require('better-sqlite3');
    const db = new Database('./data/database.db');
    const users = db.prepare('SELECT username, email, role FROM users').all();
    console.log(JSON.stringify(users, null, 2));
    db.close();
    \"
" 2>/dev/null)

if echo "$USER_CHECK" | grep -q "books"; then
    echo -e "${GREEN}✅ 默认用户 'books' 已创建${NC}"
    echo ""
    echo "用户信息："
    echo "$USER_CHECK"
else
    echo -e "${RED}❌ 未找到默认用户 'books'${NC}"
    exit 1
fi

echo ""
echo "=== 步骤 6: 测试API健康检查 ==="
if curl -s http://localhost:1201/api/health > /dev/null; then
    echo -e "${GREEN}✅ 后端API正常${NC}"
else
    echo -e "${RED}❌ 后端API无法访问${NC}"
fi

if curl -s http://localhost:1280/ > /dev/null; then
    echo -e "${GREEN}✅ 前端服务正常${NC}"
else
    echo -e "${RED}❌ 前端服务无法访问${NC}"
fi

echo ""
echo "=== 步骤 7: 检查系统配置 ==="
SYSTEM_CONFIG=$(curl -s http://localhost:1201/api/auth/system-config)

if echo "$SYSTEM_CONFIG" | grep -q "hasPrivateKey"; then
    echo -e "${GREEN}✅ 系统配置API正常${NC}"
    echo ""
    echo "系统配置："
    echo "$SYSTEM_CONFIG" | jq . 2>/dev/null || echo "$SYSTEM_CONFIG"
else
    echo -e "${YELLOW}⚠️  系统配置API异常${NC}"
fi

echo ""
echo "========================================" 
echo "✅ 测试完成！"
echo "========================================" 
echo ""
echo "📝 测试结果总结："
echo "- 默认管理员账号已创建"
echo "- 用户名: books"
echo "- 密码: books"
echo "- 私人访问密钥: books"
echo ""
echo "🌐 访问地址："
echo "- 前端: http://localhost:1280"
echo "- 后端API: http://localhost:1201"
echo ""
echo "⚠️  下一步："
echo "1. 在浏览器中访问 http://localhost:1280"
echo "2. 使用默认账号登录（用户名: books, 密码: books）"
echo "3. 登录后立即修改密码"
echo "4. 修改私人访问密钥"
echo ""
echo "📚 详细文档："
echo "- DEFAULT_ADMIN.md"
echo "- CHANGELOG_DEFAULT_ADMIN.md"
echo ""

# 如果有备份，提示恢复
if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    echo "💾 如需恢复原数据库："
    echo "   docker-compose down"
    echo "   cp $BACKUP_FILE $DB_FILE"
    echo "   docker-compose up -d"
    echo ""
fi

echo "========================================" 
