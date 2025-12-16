#!/bin/bash

# 强制刷新脚本 - 清除所有缓存并重启服务

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  强制刷新 - 清除缓存并重启服务${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. 停止所有后端和前端进程
echo -e "${YELLOW}[1/5] 停止服务...${NC}"
pkill -f "tsx watch src/index.ts" 2>/dev/null || true
pkill -f "node.*index.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 2
echo -e "${GREEN}✓${NC} 服务已停止"
echo ""

# 2. 检查数据库
echo -e "${YELLOW}[2/5] 检查数据库...${NC}"
cd backend
BOOK_COUNT=$(sqlite3 data/database.db "SELECT COUNT(*) FROM books;" 2>/dev/null || echo "0")
echo "数据库中的书籍数量: $BOOK_COUNT"

if [ "$BOOK_COUNT" != "0" ]; then
    echo -e "${YELLOW}⚠️  数据库中仍有 $BOOK_COUNT 本书${NC}"
    read -p "是否删除数据库并重新初始化？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "删除数据库..."
        rm -f data/database.db database.db
        echo -e "${GREEN}✓${NC} 数据库已删除"
    fi
else
    echo -e "${GREEN}✓${NC} 数据库为空"
fi
cd ..
echo ""

# 3. 清除浏览器缓存提示
echo -e "${YELLOW}[3/5] 浏览器缓存清除指南${NC}"
echo ""
echo -e "${CYAN}请按以下步骤清除浏览器缓存：${NC}"
echo ""
echo "方法1: 使用开发者工具（推荐）"
echo "  1. 打开浏览器，按 F12 打开开发者工具"
echo "  2. 右键点击刷新按钮，选择'清空缓存并硬性重新加载'"
echo "  或"
echo "  3. Application 标签页 → Storage → Clear site data"
echo ""
echo "方法2: 使用设置页面的清除缓存功能"
echo "  1. 登录系统"
echo "  2. 进入设置页面"
echo "  3. 找到'缓存管理'部分"
echo "  4. 点击'清除所有缓存'按钮"
echo ""
echo -e "${YELLOW}⚠️  重要：必须清除浏览器缓存才能看到最新数据！${NC}"
echo ""

# 4. 重新启动服务
echo -e "${YELLOW}[4/5] 重新启动服务...${NC}"
cd backend
npm run dev > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

sleep 3

if kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${GREEN}✓${NC} 后端服务器已启动 (PID: $BACKEND_PID)"
else
    echo -e "${RED}❌ 后端启动失败，请查看 backend.log${NC}"
fi

cd frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

sleep 3

if kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${GREEN}✓${NC} 前端服务器已启动 (PID: $FRONTEND_PID)"
else
    echo -e "${RED}❌ 前端启动失败，请查看 frontend.log${NC}"
fi
echo ""

# 5. 验证
echo -e "${YELLOW}[5/5] 验证数据...${NC}"
sleep 2
BOOK_COUNT=$(curl -s 'http://localhost:3001/api/books?limit=1' 2>/dev/null | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('pagination', {}).get('total', 0))" 2>/dev/null || echo "无法获取")
echo "API返回的书籍总数: $BOOK_COUNT"

if [ "$BOOK_COUNT" = "0" ]; then
    echo -e "${GREEN}✓${NC} API返回0本书，数据库已清空"
else
    echo -e "${YELLOW}⚠️  API返回 $BOOK_COUNT 本书，可能仍有数据${NC}"
fi
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✅ 完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${CYAN}下一步：${NC}"
echo "1. 清除浏览器缓存（必须！）"
echo "2. 访问 http://localhost:3000"
echo "3. 按 Ctrl+Shift+R (Windows/Linux) 或 Cmd+Shift+R (Mac) 强制刷新"
echo ""
echo -e "${YELLOW}如果仍然看到书籍，请：${NC}"
echo "- 完全关闭浏览器后重新打开"
echo "- 使用无痕模式访问"
echo "- 清除所有浏览器数据"
echo ""

