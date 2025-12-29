#!/bin/bash

# ============================================
# Ollama 连接诊断脚本
# ============================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Ollama 连接诊断工具${NC}"
echo ""

# 1. 检查前端容器的 OLLAMA_URL 环境变量
echo -e "${YELLOW}1. 检查前端容器的 OLLAMA_URL 环境变量...${NC}"
OLLAMA_URL=$(docker exec readknows-frontend env 2>/dev/null | grep OLLAMA_URL | cut -d'=' -f2)
if [ -n "$OLLAMA_URL" ]; then
    echo -e "${GREEN}✓${NC} OLLAMA_URL: $OLLAMA_URL"
else
    echo -e "${RED}❌${NC} OLLAMA_URL 未设置"
fi
echo ""

# 2. 检查前端容器是否运行
echo -e "${YELLOW}2. 检查前端容器状态...${NC}"
if docker ps | grep -q readknows-frontend; then
    echo -e "${GREEN}✓${NC} 前端容器正在运行"
else
    echo -e "${RED}❌${NC} 前端容器未运行"
fi
echo ""

# 3. 检查前端容器日志中的 OLLAMA 配置
echo -e "${YELLOW}3. 检查前端容器启动日志中的 OLLAMA 配置...${NC}"
docker logs readknows-frontend 2>&1 | grep -i "ollama" | tail -5
echo ""

# 4. 测试 nginx 代理
echo -e "${YELLOW}4. 测试 nginx 代理...${NC}"
PROXY_TEST=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:1280/ollama-proxy/api/tags 2>/dev/null)
if [ "$PROXY_TEST" = "200" ]; then
    echo -e "${GREEN}✓${NC} nginx 代理正常 (HTTP $PROXY_TEST)"
elif [ "$PROXY_TEST" = "502" ]; then
    echo -e "${RED}❌${NC} nginx 代理返回 502 Bad Gateway"
    echo "   这意味着 nginx 无法连接到 Ollama 服务器"
    echo "   请检查 OLLAMA_URL 环境变量配置"
elif [ "$PROXY_TEST" = "000" ]; then
    echo -e "${RED}❌${NC} 无法连接到 nginx 代理"
    echo "   请检查前端容器是否运行"
else
    echo -e "${YELLOW}⚠️${NC} nginx 代理返回 HTTP $PROXY_TEST"
fi
echo ""

# 5. 如果 OLLAMA_URL 已设置，尝试解析并测试连接
if [ -n "$OLLAMA_URL" ]; then
    echo -e "${YELLOW}5. 解析 OLLAMA_URL 并测试连接...${NC}"
    
    # 提取主机和端口
    HOST_PORT=$(echo "$OLLAMA_URL" | sed -E 's|^[^:]+://||')
    OLLAMA_HOST=$(echo "$HOST_PORT" | sed -E 's|:.*||')
    OLLAMA_PORT=$(echo "$HOST_PORT" | sed -E 's|.*:||')
    
    echo "   解析结果:"
    echo "   - 主机: $OLLAMA_HOST"
    echo "   - 端口: $OLLAMA_PORT"
    echo ""
    
    # 从容器内测试连接
    echo -e "${YELLOW}   从容器内测试连接...${NC}"
    CONTAINER_TEST=$(docker exec readknows-frontend wget -qO- --timeout=5 "http://${OLLAMA_HOST}:${OLLAMA_PORT}/api/tags" 2>&1)
    if echo "$CONTAINER_TEST" | grep -q "models"; then
        echo -e "${GREEN}✓${NC} 容器可以连接到 Ollama 服务器"
    else
        echo -e "${RED}❌${NC} 容器无法连接到 Ollama 服务器"
        echo "   错误信息: $CONTAINER_TEST"
    fi
    echo ""
fi

# 6. 检查后端容器日志
echo -e "${YELLOW}6. 检查后端容器最近的 AI 测试日志...${NC}"
docker logs readknows-backend 2>&1 | grep -A 10 "AI Test" | tail -20
echo ""

# 7. 提供建议
echo -e "${BLUE}💡 建议：${NC}"
echo ""
if [ -z "$OLLAMA_URL" ]; then
    echo "1. 在 docker-compose.yml 中设置 OLLAMA_URL 环境变量："
    echo "   environment:"
    echo "     - OLLAMA_URL=http://192.168.x.x:11434"
    echo ""
fi

if [ "$PROXY_TEST" = "502" ]; then
    echo "2. 502 Bad Gateway 错误通常表示："
    echo "   - OLLAMA_URL 配置的地址无法从容器访问"
    echo "   - Ollama 服务器未运行"
    echo "   - 防火墙阻止了连接"
    echo ""
    echo "3. 解决步骤："
    echo "   a) 确认 Ollama 服务器正在运行"
    echo "   b) 确认 OLLAMA_URL 中的地址和端口正确"
    echo "   c) 如果 Ollama 在局域网其他机器上，确保："
    echo "      - 使用实际 IP 地址（如 192.168.6.14:11434）"
    echo "      - Ollama 监听在 0.0.0.0 而不是 127.0.0.1"
    echo "      - 防火墙允许来自 Docker 容器的连接"
    echo "   d) 重启前端容器: docker-compose restart frontend"
    echo ""
fi

echo "4. 查看完整日志："
echo "   docker logs readknows-frontend | grep -i ollama"
echo "   docker logs readknows-backend | grep -i 'AI Test'"
echo ""

