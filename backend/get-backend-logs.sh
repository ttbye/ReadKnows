#!/bin/bash

# 获取后端日志的诊断脚本

echo "=========================================="
echo "后端日志诊断工具"
echo "=========================================="
echo ""

# 检查容器是否运行
if ! docker ps | grep -q "readknows-backend"; then
    echo "❌ 错误: 后端容器未运行"
    echo "请先启动容器: cd sh && docker-compose up -d"
    exit 1
fi

echo "✅ 后端容器正在运行"
echo ""

# 获取最近的错误日志
echo "=========================================="
echo "最近的错误日志（最后50行）"
echo "=========================================="
docker logs readknows-backend --tail 50 2>&1 | grep -i "error\|异常\|失败\|登录" || echo "未找到相关错误日志"

echo ""
echo "=========================================="
echo "完整的最近日志（最后100行）"
echo "=========================================="
docker logs readknows-backend --tail 100

echo ""
echo "=========================================="
echo "环境变量检查"
echo "=========================================="
echo "JWT_SECRET:"
docker exec readknows-backend printenv JWT_SECRET | head -c 20
echo "..."
echo ""
echo "NODE_ENV:"
docker exec readknows-backend printenv NODE_ENV
echo ""

echo "=========================================="
echo "数据库连接检查"
echo "=========================================="
docker exec readknows-backend ls -la /app/data/ 2>&1 | head -10

echo ""
echo "=========================================="
echo "请将以上输出复制给我，特别是错误日志部分"
echo "=========================================="
