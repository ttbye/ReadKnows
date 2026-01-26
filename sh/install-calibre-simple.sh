#!/bin/bash
# Calibre 简单安装脚本 - 适用于 Windows Git Bash

CONTAINER_NAME="readknows-backend"

echo "========================================"
echo "Calibre 安装工具"
echo "========================================"
echo ""

# 检查容器是否运行
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ 容器 $CONTAINER_NAME 未运行"
    echo "请先启动容器: docker-compose up -d"
    exit 1
fi

echo "✅ 找到容器: $CONTAINER_NAME"
echo ""
echo "开始安装 Calibre（这可能需要几分钟）..."
echo ""

# 直接在容器内执行安装
docker exec $CONTAINER_NAME bash -c '
set -e

echo "步骤 1: 安装系统依赖..."
export DEBIAN_FRONTEND=noninteractive
apt-get update > /dev/null 2>&1
apt-get install -y --no-install-recommends \
    ca-certificates wget curl xz-utils python3 xdg-utils fontconfig \
    libegl1 libopengl0 libxcb-cursor0 libgl1-mesa-glx libxkbcommon0 \
    libxcb-xinerama0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libasound2 libpulse0 libdrm2 libxss1 libxext6 libxrender1 libxtst6 \
    libxi6 libpangocairo-1.0-0 libatk1.0-0 libcairo-gobject2 libgtk-3-0 \
    libgdk-pixbuf2.0-0 > /dev/null 2>&1
echo "✅ 系统依赖安装完成"

echo "步骤 2: 下载 Calibre 安装脚本..."
DOWNLOAD_SUCCESS=false
for method in 1 2 3; do
    case $method in
        1)
            if wget --no-check-certificate -nv --timeout=300 --tries=3 -O /tmp/calibre-installer.sh https://download.calibre-ebook.com/linux-installer.sh 2>&1; then
                if [ -f /tmp/calibre-installer.sh ] && [ -s /tmp/calibre-installer.sh ]; then
                    DOWNLOAD_SUCCESS=true
                    break
                fi
            fi;;
        2)
            if curl -k -L --connect-timeout 300 --max-time 600 -o /tmp/calibre-installer.sh https://download.calibre-ebook.com/linux-installer.sh 2>&1; then
                if [ -f /tmp/calibre-installer.sh ] && [ -s /tmp/calibre-installer.sh ]; then
                    DOWNLOAD_SUCCESS=true
                    break
                fi
            fi;;
        3)
            if wget --timeout=300 --tries=3 -O /tmp/calibre-installer.sh https://download.calibre-ebook.com/linux-installer.sh 2>&1; then
                if [ -f /tmp/calibre-installer.sh ] && [ -s /tmp/calibre-installer.sh ]; then
                    DOWNLOAD_SUCCESS=true
                    break
                fi
            fi;;
    esac
done

if [ "$DOWNLOAD_SUCCESS" = false ]; then
    echo "❌ 下载失败，请检查网络连接"
    exit 1
fi
echo "✅ 下载完成"

echo "步骤 3: 安装 Calibre..."
chmod +x /tmp/calibre-installer.sh
if bash /tmp/calibre-installer.sh install_dir=/opt/calibre > /dev/null 2>&1; then
    echo "✅ Calibre 安装完成"
else
    echo "❌ Calibre 安装失败"
    exit 1
fi

echo "步骤 4: 创建符号链接..."
mkdir -p /opt/calibre /usr/local/bin
ln -sf /opt/calibre/calibre/ebook-convert /opt/calibre/ebook-convert 2>/dev/null || true
ln -sf /opt/calibre/calibre/ebook-convert /usr/local/bin/ebook-convert 2>/dev/null || true
ln -sf /opt/calibre/calibre/ebook-meta /usr/local/bin/ebook-meta 2>/dev/null || true
echo "✅ 符号链接创建完成"

echo "步骤 5: 验证安装..."
if [ -f /opt/calibre/calibre/ebook-convert ] && /opt/calibre/calibre/ebook-convert --version >/dev/null 2>&1; then
    echo "✅ Calibre 安装成功！"
    /opt/calibre/calibre/ebook-convert --version 2>&1 | head -1
    exit 0
else
    echo "❌ Calibre 安装验证失败"
    exit 1
fi
'

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "✅ Calibre 安装完成！"
    echo "========================================"
else
    echo ""
    echo "========================================"
    echo "❌ Calibre 安装失败"
    echo "========================================"
    exit 1
fi

