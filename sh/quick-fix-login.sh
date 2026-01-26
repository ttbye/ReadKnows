#!/bin/bash

# 快速修复登录500错误

echo "=========================================="
echo "快速修复登录500错误"
echo "=========================================="
echo ""

# 检查后端容器
CONTAINER_NAME=""
if docker ps --format "{{.Names}}" | grep -qE "^(readknows-backend|knowbooks-backend)$"; then
    CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep -E "^(readknows-backend|knowbooks-backend)$" | head -1)
    echo "✅ 找到后端容器: $CONTAINER_NAME"
else
    echo "❌ 后端容器未运行"
    exit 1
fi

echo ""
echo "1. 检查JWT_SECRET..."
JWT_SECRET=$(docker exec "$CONTAINER_NAME" printenv JWT_SECRET 2>/dev/null || echo "")
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "change-this-secret-key-in-production" ] || [ "$JWT_SECRET" = "your-secret-key" ]; then
    echo "❌ JWT_SECRET未正确设置"
    echo "   当前值: ${JWT_SECRET:-未设置}"
    echo ""
    echo "正在生成并设置JWT_SECRET..."
    NEW_SECRET=$(openssl rand -base64 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
    
    # 更新docker-compose.yml
    if [ -f "docker-compose.yml" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|JWT_SECRET=\${JWT_SECRET:-.*}|JWT_SECRET=\${JWT_SECRET:-$NEW_SECRET}|" docker-compose.yml
        else
            sed -i "s|JWT_SECRET=\${JWT_SECRET:-.*}|JWT_SECRET=\${JWT_SECRET:-$NEW_SECRET}|" docker-compose.yml
        fi
        echo "✅ docker-compose.yml已更新"
    fi
    
    echo "   新密钥: $NEW_SECRET"
    echo ""
    echo "⚠️  需要重启容器以应用更改"
    RESTART_NEEDED=true
else
    echo "✅ JWT_SECRET已设置"
    RESTART_NEEDED=false
fi

echo ""
echo "2. 查看最近的登录错误..."
echo "----------------------------------------"
docker logs "$CONTAINER_NAME" --tail 50 2>&1 | grep -i "登录错误\|login.*error\|JWT_SECRET\|验证.*出错" | tail -10 || echo "未找到相关错误"

echo ""
echo "3. 查看最近的500错误..."
echo "----------------------------------------"
docker logs "$CONTAINER_NAME" --tail 100 2>&1 | grep -i "500\|Internal Server Error" | tail -5 || echo "未找到500错误"

echo ""
if [ "$RESTART_NEEDED" = true ]; then
    echo "=========================================="
    echo "需要重启后端容器"
    echo "=========================================="
    echo ""
    read -p "是否现在重启? (Y/n，默认: Y): " restart_choice
    restart_choice=${restart_choice:-y}
    
    if [ "$restart_choice" = "y" ] || [ "$restart_choice" = "Y" ]; then
        echo ""
        echo "正在重启后端容器..."
        docker-compose restart backend
        
        echo ""
        echo "等待服务启动..."
        sleep 5
        
        echo ""
        echo "验证JWT_SECRET..."
        NEW_JWT=$(docker exec "$CONTAINER_NAME" printenv JWT_SECRET 2>/dev/null || echo "")
        if [ -n "$NEW_JWT" ] && [ "$NEW_JWT" != "change-this-secret-key-in-production" ] && [ "$NEW_JWT" != "your-secret-key" ]; then
            echo "✅ JWT_SECRET已更新"
        else
            echo "⚠️  JWT_SECRET可能未更新，请检查docker-compose.yml"
        fi
    else
        echo "已跳过重启，请稍后手动重启: docker-compose restart backend"
    fi
fi

echo ""
echo "=========================================="
echo "诊断完成"
echo "=========================================="
echo ""
echo "如果问题仍然存在，请运行:"
echo "  docker logs $CONTAINER_NAME --tail 100"
echo ""
