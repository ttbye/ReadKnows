#!/bin/bash

# OCR API 健康检查脚本

echo "=========================================="
echo "OCR API 健康检查"
echo "=========================================="
echo ""

# 检查容器状态
echo "1. 检查容器状态..."
if docker ps | grep -q ocr-api; then
    echo "✅ OCR API 容器正在运行"
    docker ps | grep ocr-api
else
    echo "❌ OCR API 容器未运行"
    echo ""
    echo "尝试启动容器..."
    cd "$(dirname "$0")/../sh" && docker compose -f docker-compose-OCR-MACOS.yml up -d
    sleep 5
fi

echo ""
echo "2. 检查服务健康状态..."
HEALTH_URL="http://localhost:5080/health"
MAX_ATTEMPTS=10
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    RESPONSE=$(curl -s -w "\n%{http_code}" "$HEALTH_URL" 2>/dev/null)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo "✅ OCR API 服务健康"
        echo ""
        echo "响应内容:"
        echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
        exit 0
    else
        ATTEMPT=$((ATTEMPT + 1))
        echo "⏳ 等待服务启动... ($ATTEMPT/$MAX_ATTEMPTS)"
        sleep 2
    fi
done

echo "❌ OCR API 服务未响应"
echo ""
echo "检查容器日志:"
docker logs ocr-api --tail 30 2>&1 | tail -10

echo ""
echo "=========================================="
echo "健康检查完成"
echo "=========================================="
