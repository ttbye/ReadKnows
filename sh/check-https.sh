#!/bin/bash
# HTTPS配置检查脚本

echo "=========================================="
echo "HTTPS 配置检查"
echo "=========================================="
echo ""

# 获取项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 检测操作系统
if [[ "$OSTYPE" == "darwin"* ]]; then
    DATA_DIR="${READKNOWS_DATA_DIR:-/Users/ttbye/ReadKnows}"
    echo "✓ 检测到 macOS 系统"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    DATA_DIR="${READKNOWS_DATA_DIR:-/volume5/docker/ReadKnows}"
    echo "✓ 检测到 Linux 系统"
else
    DATA_DIR="${READKNOWS_DATA_DIR:-/volume5/docker/ReadKnows}"
    echo "⚠️  未知系统，使用默认路径"
fi

echo "数据目录: $DATA_DIR"
echo ""

# 1. 检查SSL证书目录
SSL_DIR="$DATA_DIR/data/ssl"
echo "1. 检查SSL证书目录: $SSL_DIR"
if [ -d "$SSL_DIR" ]; then
    echo "   ✓ SSL目录存在"
else
    echo "   ❌ SSL目录不存在"
    echo "   创建目录..."
    mkdir -p "$SSL_DIR"
    echo "   ✓ 已创建目录"
fi
echo ""

# 2. 检查证书文件
echo "2. 检查SSL证书文件"
CERT_FOUND=false
if [ -f "$SSL_DIR/cert.pem" ] && [ -f "$SSL_DIR/key.pem" ]; then
    echo "   ✓ 找到 cert.pem 和 key.pem"
    CERT_FOUND=true
    CERT_FILE="cert.pem"
    KEY_FILE="key.pem"
elif [ -f "$SSL_DIR/fullchain.pem" ] && [ -f "$SSL_DIR/privkey.pem" ]; then
    echo "   ✓ 找到 fullchain.pem 和 privkey.pem"
    CERT_FOUND=true
    CERT_FILE="fullchain.pem"
    KEY_FILE="privkey.pem"
else
    echo "   ❌ 未找到SSL证书文件"
    echo ""
    echo "   证书文件应放在: $SSL_DIR/"
    echo "   支持的文件命名："
    echo "     - cert.pem 和 key.pem"
    echo "     - fullchain.pem 和 privkey.pem"
    echo ""
    read -p "   是否生成自签名证书用于测试？(y/n): " generate_cert
    if [ "$generate_cert" = "y" ] || [ "$generate_cert" = "Y" ]; then
        echo "   生成自签名证书..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
          -keyout "$SSL_DIR/key.pem" \
          -out "$SSL_DIR/cert.pem" \
          -subj "/C=CN/ST=State/L=City/O=Organization/CN=localhost" 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "   ✓ 自签名证书已生成"
            CERT_FOUND=true
            CERT_FILE="cert.pem"
            KEY_FILE="key.pem"
        else
            echo "   ❌ 证书生成失败，请手动生成"
        fi
    fi
fi
echo ""

# 3. 检查证书权限
if [ "$CERT_FOUND" = true ]; then
    echo "3. 检查证书文件权限"
    chmod 644 "$SSL_DIR/$CERT_FILE" 2>/dev/null
    chmod 600 "$SSL_DIR/$KEY_FILE" 2>/dev/null
    echo "   ✓ 证书权限已设置"
    echo ""
fi

# 4. 检查Docker容器
echo "4. 检查Docker容器状态"
if docker ps | grep -q readknows-frontend; then
    echo "   ✓ 前端容器正在运行"
    CONTAINER_RUNNING=true
else
    echo "   ❌ 前端容器未运行"
    CONTAINER_RUNNING=false
fi
echo ""

# 5. 检查端口映射
echo "5. 检查端口映射"
if [ "$CONTAINER_RUNNING" = true ]; then
    echo "   检查容器端口映射..."
    docker port readknows-frontend 2>/dev/null | grep -q "443" && echo "   ✓ HTTPS端口443已映射" || echo "   ❌ HTTPS端口443未映射"
    docker port readknows-frontend 2>/dev/null | grep -q "80" && echo "   ✓ HTTP端口80已映射" || echo "   ❌ HTTP端口80未映射"
else
    echo "   容器未运行，跳过端口检查"
fi
echo ""

# 6. 检查容器内的证书
if [ "$CONTAINER_RUNNING" = true ]; then
    echo "6. 检查容器内的SSL证书"
    if docker exec readknows-frontend ls /etc/nginx/ssl/ 2>/dev/null | grep -q "\.pem"; then
        echo "   ✓ 容器内找到证书文件"
        docker exec readknows-frontend ls -la /etc/nginx/ssl/ 2>/dev/null
    else
        echo "   ❌ 容器内未找到证书文件"
        echo "   请检查docker-compose.yml中的volume挂载配置"
    fi
    echo ""
    
    # 7. 检查nginx配置
    echo "7. 检查nginx配置"
    if docker exec readknows-frontend nginx -t 2>/dev/null; then
        echo "   ✓ nginx配置有效"
    else
        echo "   ❌ nginx配置有错误"
        echo "   错误详情："
        docker exec readknows-frontend nginx -t 2>&1
    fi
    echo ""
    
    # 8. 检查nginx是否监听443端口
    echo "8. 检查nginx监听端口"
    if docker exec readknows-frontend netstat -tlnp 2>/dev/null | grep -q ":443" || \
       docker exec readknows-frontend ss -tlnp 2>/dev/null | grep -q ":443"; then
        echo "   ✓ nginx正在监听443端口"
    else
        echo "   ❌ nginx未监听443端口"
        echo "   可能原因："
        echo "     1. SSL证书不存在或无效"
        echo "     2. nginx配置错误"
        echo "     3. 查看容器日志: docker logs readknows-frontend"
    fi
    echo ""
fi

# 总结
echo "=========================================="
echo "检查完成"
echo "=========================================="
echo ""
if [ "$CERT_FOUND" = true ] && [ "$CONTAINER_RUNNING" = true ]; then
    echo "✓ 配置看起来正常"
    echo ""
    echo "访问地址："
    echo "  HTTP:  http://localhost:1280"
    echo "  HTTPS: https://localhost:1243"
    echo ""
    echo "如果HTTPS仍无法访问，请："
    echo "  1. 查看容器日志: docker logs readknows-frontend"
    echo "  2. 检查防火墙设置"
    echo "  3. 确认端口1243未被其他程序占用"
else
    echo "⚠️  发现问题，请根据上述检查结果修复"
fi
echo ""
