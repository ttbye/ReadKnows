#!/bin/bash

# ============================================
# KnowBooks 查看日志脚本
# ============================================

BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}📊 KnowBooks 日志查看${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "请选择要查看的日志："
echo "  1) 所有服务"
echo "  2) 后端服务"
echo "  3) 前端服务"
echo "  4) 最近50行（所有服务）"
echo "  5) 最近50行（后端）"
echo "  6) 最近50行（前端）"
echo ""
read -p "请输入选项 (1-6): " choice

case $choice in
    1)
        echo -e "${BLUE}📊 显示所有服务实时日志（Ctrl+C 退出）...${NC}"
        echo ""
        docker-compose logs -f
        ;;
    2)
        echo -e "${BLUE}📊 显示后端服务实时日志（Ctrl+C 退出）...${NC}"
        echo ""
        docker-compose logs -f backend
        ;;
    3)
        echo -e "${BLUE}📊 显示前端服务实时日志（Ctrl+C 退出）...${NC}"
        echo ""
        docker-compose logs -f frontend
        ;;
    4)
        echo -e "${BLUE}📊 显示最近50行日志（所有服务）...${NC}"
        echo ""
        docker-compose logs --tail=50
        ;;
    5)
        echo -e "${BLUE}📊 显示最近50行日志（后端）...${NC}"
        echo ""
        docker-compose logs --tail=50 backend
        ;;
    6)
        echo -e "${BLUE}📊 显示最近50行日志（前端）...${NC}"
        echo ""
        docker-compose logs --tail=50 frontend
        ;;
    *)
        echo "无效选项"
        exit 1
        ;;
esac

