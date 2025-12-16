#!/bin/bash

# ============================================
# ReadKnows (读士私人书库) 状态检查脚本
# ============================================

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}🔍 ReadKnows (读士私人书库) 状态检查${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 1. 容器状态
echo -e "${BLUE}📦 容器状态：${NC}"
docker-compose ps
echo ""

# 2. 检查后端健康状态
echo -e "${BLUE}🔧 后端服务检查：${NC}"
if curl -s http://localhost:1281/api/health > /dev/null 2>&1; then
    HEALTH=$(curl -s http://localhost:1281/api/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    if [ "$HEALTH" = "ok" ]; then
        echo -e "${GREEN}  ✅ 后端服务正常运行${NC}"
        echo -e "     地址: http://localhost:1281"
    else
        echo -e "${YELLOW}  ⚠️  后端服务状态异常${NC}"
    fi
else
    echo -e "${RED}  ❌ 后端服务无响应${NC}"
fi
echo ""

# 3. 检查前端
echo -e "${BLUE}🌐 前端服务检查：${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:1280 | grep -q "200\|301\|302"; then
    echo -e "${GREEN}  ✅ 前端服务正常运行${NC}"
    echo -e "     地址: http://localhost:1280"
else
    echo -e "${RED}  ❌ 前端服务无响应${NC}"
fi
echo ""

# 4. 磁盘使用
echo -e "${BLUE}💾 Docker 磁盘使用：${NC}"
docker system df
echo ""

# 5. 容器资源使用
echo -e "${BLUE}📊 容器资源使用：${NC}"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep -E "NAME|knowbooks"
echo ""

# 6. 最近日志错误
echo -e "${BLUE}⚠️  最近的错误日志（后端）：${NC}"
ERROR_COUNT=$(docker-compose logs --tail=100 backend 2>/dev/null | grep -i "error" | wc -l)
if [ "$ERROR_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}  发现 ${ERROR_COUNT} 条错误${NC}"
    docker-compose logs --tail=100 backend | grep -i "error" | tail -5
else
    echo -e "${GREEN}  ✅ 无错误${NC}"
fi
echo ""

# 7. 快捷命令
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📝 常用命令：${NC}"
echo ""
echo "  查看日志:    ./docker-logs.sh"
echo "  重启服务:    ./docker-restart.sh"
echo "  重新部署:    ./redeploy.sh"
echo "  快速部署:    ./deploy-quick.sh"
echo "  停止服务:    docker-compose down"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
