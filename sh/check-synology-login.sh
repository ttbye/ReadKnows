#!/bin/bash
# 快速检查群晖 Docker 登录问题

echo "=== 检查群晖 Docker 登录问题 ==="
echo ""

# 检查容器是否运行
echo "1. 检查容器状态："
docker ps | grep -E "readknows-backend|readknows-frontend" || echo "容器未运行"
echo ""

# 检查 JWT_SECRET
echo "2. 检查 JWT_SECRET 环境变量："
docker exec readknows-backend env | grep JWT_SECRET || echo "JWT_SECRET 未设置"
echo ""

# 查看最近的登录错误日志
echo "3. 查看最近的登录错误日志（最后50行）："
docker logs readknows-backend --tail 50 | grep -A 10 -B 5 "登录\|login\|JWT_SECRET\|error\|Error" | tail -30
echo ""

# 检查数据库文件
echo "4. 检查数据库文件："
docker exec readknows-backend ls -la /app/data/database.db 2>/dev/null || echo "数据库文件不存在或无法访问"
echo ""

# 检查文件权限
echo "5. 检查数据目录权限："
docker exec readknows-backend ls -la /app/data/ | head -5
echo ""

echo "=== 检查完成 ==="
echo ""
echo "如果看到错误，请将上述输出发送给开发者"
