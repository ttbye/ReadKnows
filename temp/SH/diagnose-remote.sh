#!/bin/bash
# KnowBooks 远程服务器诊断脚本
# 在远程服务器上运行此脚本

echo "================================================"
echo "KnowBooks 远程诊断 - Books路径问题"
echo "================================================"
echo ""

echo "=== 1. 检查后端容器内的books目录结构 ==="
echo "查看 /app/books 目录："
docker exec knowbooks-backend ls -la /app/books/
echo ""

echo "查看 /app/books/public 目录（如果存在）："
docker exec knowbooks-backend ls -la /app/books/public/ 2>/dev/null || echo "❌ /app/books/public 目录不存在"
echo ""

echo "查找所有封面文件："
docker exec knowbooks-backend find /app/books -name "cover.*" -type f | head -20
echo ""

echo "=== 2. 检查数据库中的cover_url ==="
echo "查看数据库中的封面路径（前10条）："
docker exec knowbooks-backend sqlite3 /app/data/database.db "SELECT id, title, cover_url FROM books WHERE cover_url IS NOT NULL LIMIT 10;" 2>/dev/null || echo "⚠️ 无法访问数据库"
echo ""

echo "=== 3. 测试后端books路径 ==="
echo "测试1: /books/public/cover.jpg"
curl -I http://localhost:1201/books/public/cover.jpg 2>&1 | head -3
echo ""

echo "=== 4. 测试前端代理 ==="
echo "测试1: 前端到后端API代理"
curl -s http://localhost:1280/api/health | head -1
echo ""

echo "测试2: 前端到后端books代理"
curl -I http://localhost:1280/books/public/cover.jpg 2>&1 | head -3
echo ""

echo "=== 5. 检查前端Nginx配置 ==="
echo "查看前端容器内的nginx.conf："
docker exec knowbooks-frontend cat /etc/nginx/conf.d/default.conf | grep -A 15 "location /books"
echo ""

echo "=== 6. 测试容器间通信 ==="
echo "从前端容器访问后端 /books 路径："
docker exec knowbooks-frontend sh -c "wget -O- http://backend:3001/books/public/cover.jpg 2>&1" | head -5
echo ""

echo "=== 7. 查看后端日志（最近的books请求） ==="
docker-compose logs backend | grep -i "books" | tail -10
echo ""

echo "================================================"
echo "诊断完成"
echo "================================================"
echo ""
echo "💡 建议："
echo "1. 如果 /app/books/public 不存在，说明文件路径不对"
echo "2. 如果前端Nginx配置中没有 'location /books'，需要重新构建前端镜像"
echo "3. 如果容器间通信失败，说明Docker网络有问题"
