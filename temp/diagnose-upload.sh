#!/bin/bash

# 批量上传问题诊断脚本

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=========================================="
echo "批量上传问题诊断"
echo -e "==========================================${NC}"
echo ""

# 1. 检查后端服务状态
echo -e "${BLUE}1. 检查后端服务状态${NC}"
if curl -s http://localhost:1281/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 后端服务正常${NC}"
    curl -s http://localhost:1281/api/health | jq . 2>/dev/null || curl -s http://localhost:1281/api/health
else
    echo -e "${RED}❌ 后端服务异常或未启动${NC}"
fi
echo ""

# 2. 检查数据库文件
echo -e "${BLUE}2. 检查数据库文件${NC}"
if [ -f "backend/data/database.db" ]; then
    echo -e "${GREEN}✅ 数据库文件存在${NC}"
    ls -lh backend/data/database.db
    # 检查数据库完整性
    if command -v sqlite3 &> /dev/null; then
        echo -e "${BLUE}   检查数据库完整性...${NC}"
        sqlite3 backend/data/database.db "PRAGMA integrity_check;" 2>/dev/null | head -1
    fi
else
    echo -e "${RED}❌ 数据库文件不存在${NC}"
fi
echo ""

# 3. 检查书籍目录权限
echo -e "${BLUE}3. 检查书籍目录权限${NC}"
if [ -d "backend/books" ]; then
    echo -e "${GREEN}✅ 书籍目录存在${NC}"
    ls -ld backend/books
    if [ -d "backend/books/.temp" ]; then
        echo -e "${GREEN}✅ 临时目录存在${NC}"
        ls -ld backend/books/.temp
    else
        echo -e "${YELLOW}⚠️  临时目录不存在，将自动创建${NC}"
    fi
    # 检查目录是否可写
    if [ -w "backend/books" ]; then
        echo -e "${GREEN}✅ 目录可写${NC}"
    else
        echo -e "${RED}❌ 目录不可写${NC}"
    fi
else
    echo -e "${RED}❌ 书籍目录不存在${NC}"
fi
echo ""

# 4. 检查磁盘空间
echo -e "${BLUE}4. 检查磁盘空间${NC}"
df -h . | tail -1 | awk '{print "可用空间: " $4 " / 总空间: " $2}'
echo ""

# 5. 检查后端进程
echo -e "${BLUE}5. 检查后端进程${NC}"
if pgrep -f "node.*backend\|node.*dist/index" > /dev/null; then
    echo -e "${GREEN}✅ 后端进程运行中${NC}"
    ps aux | grep -E "node.*backend|node.*dist/index" | grep -v grep | head -1
else
    echo -e "${RED}❌ 后端进程未运行${NC}"
fi
echo ""

# 6. 查看最近的错误日志
echo -e "${BLUE}6. 查看最近的错误日志（最后20行）${NC}"
if [ -f "backend.log" ]; then
    ERROR_COUNT=$(tail -100 backend.log | grep -i "error\|失败\|失败" | wc -l | tr -d ' ')
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo -e "${YELLOW}⚠️  发现 $ERROR_COUNT 条错误${NC}"
        echo ""
        tail -100 backend.log | grep -i "error\|失败\|失败" | tail -5
    else
        echo -e "${GREEN}✅ 无错误日志${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  日志文件不存在${NC}"
fi
echo ""

# 7. 检查系统配置
echo -e "${BLUE}7. 检查系统配置${NC}"
if curl -s http://localhost:1281/api/auth/system-config > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 系统配置可访问${NC}"
    curl -s http://localhost:1281/api/auth/system-config | jq . 2>/dev/null || curl -s http://localhost:1281/api/auth/system-config
else
    echo -e "${RED}❌ 系统配置不可访问${NC}"
fi
echo ""

# 8. 检查端口占用
echo -e "${BLUE}8. 检查端口占用${NC}"
if command -v lsof &> /dev/null; then
    if lsof -Pi :1281 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}✅ 端口 1281 被占用（后端服务）${NC}"
    else
        echo -e "${RED}❌ 端口 1281 未被占用${NC}"
    fi
    if lsof -Pi :1280 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}✅ 端口 1280 被占用（前端服务）${NC}"
    else
        echo -e "${RED}❌ 端口 1280 未被占用${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  未安装 lsof，跳过端口检查${NC}"
fi
echo ""

# 9. 检查 Node.js 版本
echo -e "${BLUE}9. 检查 Node.js 版本${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✅ Node.js 版本: $NODE_VERSION${NC}"
else
    echo -e "${RED}❌ Node.js 未安装${NC}"
fi
echo ""

# 10. 检查内存使用
echo -e "${BLUE}10. 检查内存使用${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    vm_stat | head -5
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    free -h | head -2
else
    echo -e "${YELLOW}⚠️  无法检测内存使用${NC}"
fi
echo ""

echo -e "${BLUE}=========================================="
echo "诊断完成"
echo -e "==========================================${NC}"
echo ""
echo -e "${YELLOW}💡 提示：${NC}"
echo "  1. 如果后端服务异常，请重启：./start.sh"
echo "  2. 如果数据库文件不存在，重启后端会自动创建"
echo "  3. 如果目录权限有问题，执行：chmod -R 755 backend/books backend/data"
echo "  4. 查看详细日志：tail -f backend.log"
echo ""

