#!/bin/bash

# KnowBooks 强制初始化脚本（无需确认）
# ⚠️ 直接删除所有数据，无需确认！

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo ""
echo -e "${PURPLE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║       📚 KnowBooks 强制初始化（无需确认）                 ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

deleted_db_count=0
deleted_files_count=0
deleted_dirs_count=0

# 停止后端服务器
echo -e "${BLUE}📊 步骤 1/3: 停止后端服务器${NC}"
echo "─────────────────────────────────────────────────────────"
if pgrep -f "node.*backend" > /dev/null; then
    pkill -f "node.*backend" || true
    sleep 2
    echo -e "   ${GREEN}✅ 后端服务器已停止${NC}"
else
    echo "   ℹ️  后端服务器未运行"
fi
echo ""

# 清除数据库
echo -e "${BLUE}📊 步骤 2/3: 清除数据库${NC}"
echo "─────────────────────────────────────────────────────────"
db_paths=(
    "backend/data/database.db"
    "backend/database.db"
    "data/database.db"
    "database.db"
)

for db_path in "${db_paths[@]}"; do
    if [ -f "$db_path" ]; then
        size=$(du -h "$db_path" | cut -f1)
        echo "   删除: $db_path ($size)"
        rm -f "$db_path"
        ((deleted_db_count++))
    fi
done
echo -e "   ${GREEN}✅ 已删除 $deleted_db_count 个数据库文件${NC}"
echo ""

# 清除书籍文件
echo -e "${BLUE}📚 步骤 3/3: 清除书籍文件${NC}"
echo "─────────────────────────────────────────────────────────"

clear_directory() {
    local dir_path=$1
    local dir_name=$2
    
    if [ -d "$dir_path" ]; then
        echo "   清理: $dir_name"
        file_count=$(find "$dir_path" -type f 2>/dev/null | wc -l | tr -d ' ')
        rm -rf "${dir_path:?}"/* 2>/dev/null || true
        echo "   删除了 $file_count 个文件"
        ((deleted_files_count+=file_count))
        ((deleted_dirs_count++))
    fi
}

clear_directory "backend/books" "books/"
clear_directory "backend/covers" "covers/"
echo ""

# 总结
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ 初始化完成！${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "已删除: $deleted_db_count 个数据库, $deleted_files_count 个文件"
echo ""
echo -e "${YELLOW}后续步骤：${NC}"
echo "1. 清除浏览器缓存 (F12 → Application → Clear site data)"
echo "2. 启动服务器: cd backend && npm run dev"
echo -e "3. 注册首个用户: ${PURPLE}第一个注册的用户将自动成为管理员！${NC}"
echo ""

