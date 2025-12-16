#!/bin/bash

# KnowBooks 一键初始化脚本
# 完全重置系统，删除所有数据和书籍文件

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo ""
echo -e "${PURPLE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║          📚 KnowBooks 一键初始化脚本                      ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 显示警告
echo -e "${RED}⚠️  警告：此操作将执行以下操作：${NC}"
echo ""
echo -e "${YELLOW}   🗑️  删除所有数据库记录${NC}"
echo "      - 用户数据"
echo "      - 书籍信息"
echo "      - 阅读进度"
echo "      - 书架信息"
echo "      - 导入历史"
echo ""
echo -e "${YELLOW}   🗑️  删除所有书籍文件${NC}"
echo "      - 公开书籍"
echo "      - 私人书籍"
echo "      - 封面图片"
echo ""
echo -e "${RED}   ⚠️  此操作不可恢复！${NC}"
echo ""

# 询问确认
read -p "❓ 确定要继续吗？ (输入 yes 确认): " confirm

if [ "$confirm" != "yes" ]; then
    echo ""
    echo -e "${RED}❌ 操作已取消${NC}"
    echo ""
    exit 0
fi

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}开始清理...${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

deleted_db_count=0
deleted_files_count=0
deleted_dirs_count=0

# 步骤 1: 停止后端服务器
echo -e "${BLUE}📊 步骤 1/3: 停止后端服务器${NC}"
echo "─────────────────────────────────────────────────────────"

# 尝试查找并停止Node.js进程
if pgrep -f "node.*backend" > /dev/null; then
    echo "   找到运行中的后端进程，正在停止..."
    pkill -f "node.*backend" || true
    sleep 2
    echo -e "   ${GREEN}✅ 后端服务器已停止${NC}"
else
    echo "   ℹ️  后端服务器未运行"
fi
echo ""

# 步骤 2: 清除数据库
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
        echo "   找到: $db_path"
        echo "   大小: $size"
        rm -f "$db_path"
        echo -e "   ${GREEN}✅ 已删除${NC}"
        echo ""
        ((deleted_db_count++))
    fi
done

if [ $deleted_db_count -eq 0 ]; then
    echo "   ℹ️  未找到数据库文件"
    echo ""
fi

# 步骤 3: 清除书籍文件
echo -e "${BLUE}📚 步骤 3/3: 清除书籍文件${NC}"
echo "─────────────────────────────────────────────────────────"

# 清除函数
clear_directory() {
    local dir_path=$1
    local dir_name=$2
    
    if [ -d "$dir_path" ]; then
        echo "   正在清理: $dir_name"
        file_count=$(find "$dir_path" -type f 2>/dev/null | wc -l | tr -d ' ')
        
        # 清空目录内容但保留目录本身
        rm -rf "${dir_path:?}"/* 2>/dev/null || true
        
        echo -e "   ${GREEN}✅ 已删除 $file_count 个文件${NC}"
        echo ""
        ((deleted_files_count+=file_count))
        ((deleted_dirs_count++))
    else
        echo "   ℹ️  目录不存在: $dir_name"
        echo ""
    fi
}

# 清除书籍目录
clear_directory "backend/books" "书籍目录 (books/)"

# 清除封面目录
clear_directory "backend/covers" "封面目录 (covers/)"

# 显示总结
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}清理完成！${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}✅ 已删除 $deleted_db_count 个数据库文件${NC}"
echo -e "${GREEN}✅ 已清理 $deleted_dirs_count 个目录${NC}"
echo -e "${GREEN}✅ 已删除 $deleted_files_count 个文件${NC}"
echo ""
echo "────────────────────────────────────────────────────────────"
echo -e "${BLUE}📋 后续步骤：${NC}"
echo "────────────────────────────────────────────────────────────"
echo ""
echo -e "${YELLOW}1. 清除浏览器缓存：${NC}"
echo "   - 打开浏览器开发者工具 (F12)"
echo "   - Application → Storage"
echo "   - Clear site data"
echo ""
echo -e "${YELLOW}2. 启动后端服务器：${NC}"
echo -e "   ${BLUE}cd backend${NC}"
echo -e "   ${BLUE}npm run dev${NC}"
echo ""
echo -e "${YELLOW}3. 启动前端服务器：${NC}"
echo -e "   ${BLUE}cd frontend${NC}"
echo -e "   ${BLUE}npm run dev${NC}"
echo ""
echo -e "${YELLOW}4. 注册首个用户：${NC}"
echo -e "   ${PURPLE}👑 第一个注册的用户将自动成为管理员！${NC}"
echo "   - 打开浏览器访问系统"
echo "   - 点击注册按钮"
echo "   - 填写用户信息"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# 询问是否立即启动服务器
echo ""
read -p "🚀 是否立即启动后端服务器？(y/n): " start_server

if [ "$start_server" = "y" ] || [ "$start_server" = "Y" ]; then
    echo ""
    echo -e "${BLUE}正在启动后端服务器...${NC}"
    echo ""
    cd backend
    npm run dev
else
    echo ""
    echo -e "${GREEN}完成！请手动启动服务器。${NC}"
    echo ""
fi

