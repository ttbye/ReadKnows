#!/bin/bash

# 快速重启后端服务脚本

echo "=========================================="
echo "重启后端服务"
echo "=========================================="
echo ""

# 检查docker-compose.yml
COMPOSE_FILE="docker-compose.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ 未找到docker-compose.yml"
    exit 1
fi

# 检查JWT_SECRET
echo "1. 检查JWT_SECRET配置..."
JWT_SECRET_LINE=$(grep "JWT_SECRET" "$COMPOSE_FILE" | head -1)
if echo "$JWT_SECRET_LINE" | grep -q "change-this-secret-key-in-production"; then
    echo "⚠️  JWT_SECRET仍使用默认值"
    echo "   运行: cd ../backend && bash fix-jwt-secret.sh"
    exit 1
else
    echo "✅ JWT_SECRET已配置"
fi

echo ""
echo "2. 重启后端容器..."
docker-compose restart backend

if [ $? -eq 0 ]; then
    echo "✅ 后端容器已重启"
else
    echo "❌ 重启失败"
    exit 1
fi

echo ""
echo "3. 等待服务启动..."
sleep 5

echo ""
echo "4. 检查容器状态..."
docker-compose ps backend

echo ""
echo "5. 查看最近日志..."
docker-compose logs backend --tail 20 | grep -i "JWT_SECRET\|登录\|error" || echo "未找到相关日志"

echo ""
echo "=========================================="
echo "重启完成"
echo "=========================================="
echo ""
echo "如果仍有问题，查看完整日志:"
echo "  docker-compose logs backend --tail 100"
