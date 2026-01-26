#!/bin/bash
# 修复 HTTPS 登录问题

echo "=========================================="
echo "修复 HTTPS 登录问题"
echo "=========================================="
echo ""

# 检查后端 HTTPS 服务
echo "1. 检查后端 HTTPS 服务状态..."
HTTPS_RUNNING=$(docker logs readknows-backend 2>&1 | grep -i "HTTPS服务器运行" | tail -1)

if [ -z "$HTTPS_RUNNING" ]; then
    echo "   ❌ 后端 HTTPS 服务未启动"
    echo ""
    echo "   解决方案："
    echo "   方案 A：启动后端 HTTPS 服务（推荐）"
    echo "     1. 确保证书文件存在于后端容器的 /app/data/ssl/ 目录"
    echo "     2. 证书文件应为：cert.pem 和 key.pem（或 fullchain.pem 和 privkey.pem）"
    echo "     3. 重启后端容器：docker-compose restart backend"
    echo ""
    echo "   方案 B：使用 HTTP 代理（临时方案）"
    echo "     修改 frontend/nginx.conf，将 HTTPS upstream 改为 HTTP："
    echo "     location ^~ /api {"
    echo "         proxy_pass http://backend_pool;  # 改为 HTTP"
    echo "         ..."
    echo "     }"
    echo ""
    
    read -p "   是否要临时切换到 HTTP 代理？(y/N): " use_http
    if [ "$use_http" = "y" ] || [ "$use_http" = "Y" ]; then
        echo "   正在修改 nginx 配置..."
        # 这里可以自动修改，但为了安全，让用户手动修改
        echo "   请手动修改 frontend/nginx.conf 中的 /api location 块："
        echo "   将 'proxy_pass https://backend_https_pool;' 改为 'proxy_pass http://backend_pool;'"
        echo "   并删除 'proxy_ssl_verify off;' 和 'proxy_ssl_verify_depth 0;' 行"
        echo ""
        echo "   然后重新构建前端容器："
        echo "   docker-compose build frontend"
        echo "   docker-compose up -d frontend"
    fi
else
    echo "   ✓ 后端 HTTPS 服务已启动"
    echo "   $HTTPS_RUNNING"
    echo ""
    echo "   如果仍然无法登录，请检查："
    echo "   1. 前端容器日志: docker logs readknows-frontend"
    echo "   2. 后端容器日志: docker logs readknows-backend"
    echo "   3. nginx 错误日志: docker exec readknows-frontend cat /var/log/nginx/error.log"
fi

echo ""
echo "=========================================="
echo "诊断完成"
echo "=========================================="
