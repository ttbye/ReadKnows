#!/bin/bash
# 检查后端 HTTPS 服务状态

echo "=========================================="
echo "后端 HTTPS 服务检查"
echo "=========================================="
echo ""

# 1. 检查后端容器状态
echo "1. 检查后端容器状态"
if docker ps | grep -q readknows-backend; then
    echo "   ✓ 后端容器正在运行"
    CONTAINER_RUNNING=true
else
    echo "   ❌ 后端容器未运行"
    CONTAINER_RUNNING=false
    exit 1
fi
echo ""

# 2. 检查后端日志中的 HTTPS 信息
echo "2. 检查后端 HTTPS 服务启动日志"
HTTPS_STARTED=$(docker logs readknows-backend 2>&1 | grep -i "HTTPS服务器运行" | tail -1)
if [ -n "$HTTPS_STARTED" ]; then
    echo "   ✓ HTTPS 服务已启动"
    echo "   $HTTPS_STARTED"
else
    echo "   ❌ HTTPS 服务未启动"
    echo "   可能原因："
    echo "     1. SSL证书文件不存在"
    echo "     2. 证书文件路径错误"
    echo "     3. 证书文件格式错误"
fi
echo ""

# 3. 检查后端容器内的证书文件
echo "3. 检查后端容器内的SSL证书"
if docker exec readknows-backend ls /app/data/ssl/ 2>/dev/null | grep -q "\.pem"; then
    echo "   ✓ 找到证书文件"
    docker exec readknows-backend ls -la /app/data/ssl/ 2>/dev/null
else
    echo "   ❌ 未找到证书文件"
    echo "   证书应放在: /app/data/ssl/"
    echo "   支持的文件："
    echo "     - cert.pem 和 key.pem"
    echo "     - fullchain.pem 和 privkey.pem"
fi
echo ""

# 4. 检查后端是否监听 1244 端口
echo "4. 检查后端端口监听"
if docker exec readknows-backend netstat -tlnp 2>/dev/null | grep -q ":1244" || \
   docker exec readknows-backend ss -tlnp 2>/dev/null | grep -q ":1244"; then
    echo "   ✓ 后端正在监听 1244 端口 (HTTPS)"
else
    echo "   ❌ 后端未监听 1244 端口"
    echo "   可能原因："
    echo "     1. HTTPS 服务未启动"
    echo "     2. 证书文件不存在或无效"
fi
echo ""

# 5. 测试从前端容器到后端的连接
echo "5. 测试前端到后端的连接"
if docker exec readknows-frontend wget -q --spider --no-check-certificate https://backend:1244/api/health 2>/dev/null || \
   docker exec readknows-frontend curl -k -s -o /dev/null -w "%{http_code}" https://backend:1244/api/health 2>/dev/null | grep -q "200\|404"; then
    echo "   ✓ 可以从前端容器连接到后端 HTTPS"
else
    echo "   ❌ 无法从前端容器连接到后端 HTTPS"
    echo "   可能原因："
    echo "     1. 后端 HTTPS 服务未启动"
    echo "     2. Docker 网络配置问题"
    echo "     3. 后端证书问题"
fi
echo ""

# 6. 查看后端最近的错误日志
echo "6. 后端最近的错误日志（最后20行）"
docker logs readknows-backend --tail 20 2>&1 | grep -i "error\|fail\|certificate\|ssl" || echo "   未发现相关错误"
echo ""

# 总结
echo "=========================================="
echo "检查完成"
echo "=========================================="
echo ""
echo "如果 HTTPS 服务未启动，请："
echo "  1. 确保证书文件存在于后端容器的 /app/data/ssl/ 目录"
echo "  2. 检查证书文件权限"
echo "  3. 查看完整日志: docker logs readknows-backend"
echo "  4. 重启后端容器: docker-compose restart backend"
echo ""
