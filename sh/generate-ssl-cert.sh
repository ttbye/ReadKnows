#!/bin/bash
# 生成支持 localhost 和 127.0.0.1 的 SSL 证书

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

SSL_DIR="$DATA_DIR/data/ssl"

echo "=========================================="
echo "生成 SSL 证书（支持 localhost 和 127.0.0.1）"
echo "=========================================="
echo ""
echo "证书将保存到: $SSL_DIR"
echo ""

# 创建目录
mkdir -p "$SSL_DIR"

# 创建 OpenSSL 配置文件（包含 SAN）
CONFIG_FILE="$SSL_DIR/openssl.conf"
cat > "$CONFIG_FILE" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=CN
ST=State
L=City
O=ReadKnows
CN=localhost

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

echo "✓ 已创建 OpenSSL 配置文件"

# 生成私钥
echo "生成私钥..."
openssl genrsa -out "$SSL_DIR/key.pem" 2048
if [ $? -ne 0 ]; then
    echo "❌ 私钥生成失败"
    exit 1
fi
echo "✓ 私钥已生成"

# 生成证书签名请求
echo "生成证书签名请求..."
openssl req -new -key "$SSL_DIR/key.pem" \
    -out "$SSL_DIR/cert.csr" \
    -config "$CONFIG_FILE"
if [ $? -ne 0 ]; then
    echo "❌ 证书签名请求生成失败"
    exit 1
fi
echo "✓ 证书签名请求已生成"

# 生成自签名证书（包含 SAN）
echo "生成自签名证书..."
openssl x509 -req -days 365 \
    -in "$SSL_DIR/cert.csr" \
    -signkey "$SSL_DIR/key.pem" \
    -out "$SSL_DIR/cert.pem" \
    -extensions v3_req \
    -extfile "$CONFIG_FILE"
if [ $? -ne 0 ]; then
    echo "❌ 证书生成失败"
    exit 1
fi
echo "✓ 证书已生成"

# 清理临时文件
rm -f "$SSL_DIR/cert.csr" "$CONFIG_FILE"
echo "✓ 已清理临时文件"

# 设置权限
chmod 644 "$SSL_DIR/cert.pem"
chmod 600 "$SSL_DIR/key.pem"
echo "✓ 已设置文件权限"

# 验证证书
echo ""
echo "=========================================="
echo "证书信息"
echo "=========================================="
openssl x509 -in "$SSL_DIR/cert.pem" -text -noout | grep -A 2 "Subject Alternative Name"
echo ""

echo "=========================================="
echo "✓ 证书生成完成！"
echo "=========================================="
echo ""
echo "证书文件："
echo "  证书: $SSL_DIR/cert.pem"
echo "  私钥: $SSL_DIR/key.pem"
echo ""
echo "支持的域名/IP："
echo "  - localhost"
echo "  - 127.0.0.1"
echo "  - ::1 (IPv6)"
echo ""
echo "下一步："
echo "  1. 重新构建并启动前端容器："
echo "     cd sh"
echo "     docker-compose build frontend"
echo "     docker-compose up -d frontend"
echo ""
echo "  2. 访问测试："
echo "     https://localhost:1243"
echo "     https://127.0.0.1:1243"
echo ""
